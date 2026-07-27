import { Check, ChevronDown, Search } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Quiet trailing note in the list (e.g. "Added"). */
  hint?: string;
  /** Shown but not selectable. */
  disabled?: boolean;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableSelectOption[];
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
};

type PanelPos = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  openUp: boolean;
};

function measurePanel(trigger: HTMLElement): PanelPos {
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(rect.width, 220);
  const gap = 4;
  const pad = 8;
  const spaceBelow = window.innerHeight - rect.bottom - pad;
  const spaceAbove = rect.top - pad;
  const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(280, Math.max(160, openUp ? spaceAbove - gap : spaceBelow - gap));
  return {
    top: openUp ? rect.top - gap : rect.bottom + gap,
    left: Math.min(rect.left, window.innerWidth - width - pad),
    width,
    maxHeight,
    openUp,
  };
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  id,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
}: SearchableSelectProps) {
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [panel, setPanel] = useState<PanelPos | null>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPanel(null);
      return;
    }
    const update = () => {
      if (triggerRef.current) setPanel(measurePanel(triggerRef.current));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!justOpened) return;
    setQuery("");
    const selectedIdx = options.findIndex((o) => o.value === value);
    setActiveIndex(selectedIdx >= 0 ? selectedIdx : 0);
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-opt-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered]);

  function pick(next: string) {
    const opt = options.find((o) => o.value === next);
    if (opt?.disabled) return;
    onChange(next);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[activeIndex];
      if (opt && !opt.disabled) pick(opt.value);
    }
  }

  const panelStyle: CSSProperties | undefined = panel
    ? {
      position: "fixed",
      left: panel.left,
      width: panel.width,
      maxHeight: panel.maxHeight,
      zIndex: 300,
      ...(panel.openUp
        ? { bottom: window.innerHeight - panel.top, top: "auto" }
        : { top: panel.top }),
    }
    : undefined;

  const listMaxHeight = panel ? Math.max(96, panel.maxHeight - 52) : 240;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
        onKeyDown={onTriggerKeyDown}
        className={`flex min-w-0 cursor-pointer items-center gap-1 text-left ${className}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${!value || !selected ? "text-[var(--pos-text-2)]" : ""}`}
        >
          {value && selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 text-[var(--pos-text-2)] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2.25}
          aria-hidden
        />
      </button>
      {open && panel
        ? createPortal(
          <div
            ref={listRef}
            style={panelStyle}
            className="overflow-hidden rounded-[10px] border border-solid [border-color:var(--pos-divider)] bg-[var(--pos-card)] shadow-lg"
          >
            <div className="border-b border-solid [border-color:var(--pos-divider)] p-1.5">
              <label className="relative flex items-center">
                <Search
                  className="pointer-events-none absolute left-2 size-3.5 text-[var(--pos-text-2)]"
                  strokeWidth={2.25}
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search…"
                  className="h-8 w-full rounded-[7px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] py-1 pl-7 pr-2 text-[12px] text-[var(--pos-text-1)] outline-none focus:border-[var(--pos-sb-base)] focus:ring-2 focus:ring-[var(--pos-sb-base)]/15"
                  autoComplete="off"
                  aria-autocomplete="list"
                  aria-controls={listId}
                />
              </label>
            </div>
            <ul
              id={listId}
              role="listbox"
              aria-label={ariaLabel || placeholder}
              className="overflow-y-auto overscroll-contain py-1"
              style={{ maxHeight: listMaxHeight }}
            >
              {filtered.length === 0 ? (
                <li className="px-2.5 py-2 text-[12px] text-[var(--pos-text-2)]">No matches</li>
              ) : (
                filtered.map((opt, index) => {
                  const isSelected = opt.value === value;
                  const isActive = index === activeIndex;
                  const isDisabled = Boolean(opt.disabled);
                  return (
                    <li key={`${opt.value}::${opt.label}`} role="presentation">
                      <button
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={isDisabled || undefined}
                        disabled={isDisabled}
                        data-opt-index={index}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          if (!isDisabled) pick(opt.value);
                        }}
                        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                          isDisabled
                            ? "cursor-not-allowed text-[var(--pos-text-2)] opacity-55"
                            : isActive
                              ? "bg-[color-mix(in_srgb,var(--pos-sb-base)_10%,transparent)] text-[var(--pos-text-1)]"
                              : "text-[var(--pos-text-1)] hover:bg-[var(--pos-nav-hover)]/50"
                          } ${isSelected && !isDisabled ? "font-semibold" : "font-normal"}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                        {opt.hint ? (
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-[var(--pos-text-2)]">
                            {opt.hint}
                          </span>
                        ) : null}
                        {isSelected && !isDisabled ? (
                          <Check
                            className="size-3.5 shrink-0 text-[var(--pos-sb-base)]"
                            strokeWidth={2.5}
                            aria-hidden
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
