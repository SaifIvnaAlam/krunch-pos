import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  LogOut,
  UtensilsCrossed,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";
import {
  POS_NAV_SECTIONS,
  branchPathToLeaf,
  type NavBranch,
  type NavLeaf,
  type NavNode,
} from "../../data/bhojonNav";

const RESTAURANT = {
  name: "Steak & Marrow",
  branch: "Downtown · Floor service",
} as const;

function collectCollapsedShortcuts(): NavLeaf[] {
  const out: NavLeaf[] = [];
  const seen = new Set<string>();

  function walk(nodes: NavNode[]) {
    for (const node of nodes) {
      if (node.kind === "leaf") {
        if (seen.has(node.id)) continue;
        seen.add(node.id);
        out.push(node);
      } else {
        walk(node.children);
      }
    }
  }

  for (const section of POS_NAV_SECTIONS) {
    walk(section.nodes);
  }
  return out;
}

const COLLAPSED_SHORTCUTS = collectCollapsedShortcuts();

const SIDEBAR_COLLAPSED_KEY = "remi_pos_sidebar_collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return sessionStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsed(collapsed: boolean) {
  try {
    sessionStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function LeafRow({
  id,
  label,
  icon: Icon,
  addon,
  active,
  depth,
  onSelect,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  active: boolean;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const isNested = depth > 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? "page" : undefined}
      className={`group relative flex w-full items-center gap-2.5 rounded-[5px] text-left transition-all duration-150 ${
        isNested
          ? "min-h-[40px] py-2 pl-9 pr-3 text-[12px]"
          : "min-h-[44px] py-2.5 pl-3 pr-3 text-[13px]"
      } ${
        active
          ? "bg-[var(--pos-sb-active-bg)] text-[var(--pos-sb-active-text)]"
          : "text-[var(--pos-sb-text-2)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
      }`}
    >
      <Icon
        className={`shrink-0 transition-colors ${isNested ? "size-[13px]" : "size-[15px]"} ${
          active ? "text-[var(--pos-sb-active-icon)]" : "text-[var(--pos-sb-icon)] group-hover:text-[var(--pos-sb-text-3)]"
        }`}
        strokeWidth={active ? 2.2 : 1.8}
      />

      <span
        className={`min-w-0 flex-1 truncate leading-none ${
          active ? "font-semibold" : isNested ? "font-normal" : "font-medium"
        }`}
      >
        {label}
      </span>

      {addon ? (
        <span className="shrink-0 rounded-[3px] border border-[var(--pos-sb-badge-border)] bg-[var(--pos-sb-badge-bg)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pos-sb-badge-fg)]">
          Add-on
        </span>
      ) : null}
    </button>
  );
}

function CollapsedLeafIcon({
  id,
  label,
  icon: Icon,
  active,
  onSelect,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className="group relative flex w-full items-center justify-center py-1.5"
    >
      <span
        className={`flex size-10 items-center justify-center rounded-[6px] transition-all duration-150 ${
          active
            ? "bg-[var(--pos-sb-active-bg)] text-[var(--pos-sb-active-icon)]"
            : "text-[var(--pos-sb-icon)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
        }`}
      >
        <Icon className="size-[16px] shrink-0" strokeWidth={active ? 2.2 : 1.8} />
      </span>
    </button>
  );
}

export function PosSidebar({
  activeLeafId,
  onSelectLeaf,
  onSignOut,
}: {
  activeLeafId: string;
  onSelectLeaf: (id: string) => void;
  onSignOut: () => void;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({
    "manage-order": true,
  });
  const navRef = useRef<HTMLElement | null>(null);
  const [collapsedCanScrollDown, setCollapsedCanScrollDown] = useState(false);

  const setCollapsed = (next: boolean) => {
    writeSidebarCollapsed(next);
    setSidebarCollapsed(next);
  };

  useEffect(() => {
    const path = branchPathToLeaf(activeLeafId);
    if (path.length === 0) return;
    setOpenBranches((prev) => {
      const next = { ...prev };
      for (const id of path) next[id] = true;
      return next;
    });
  }, [activeLeafId]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      setCollapsedCanScrollDown(false);
      return;
    }

    const el = navRef.current;
    if (!el) return;

    const update = () => {
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      setCollapsedCanScrollDown(maxScrollTop > 2 && el.scrollTop < maxScrollTop - 2);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update, { passive: true });

    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [sidebarCollapsed]);

  const toggleBranch = (id: string) => {
    setOpenBranches((p) => ({ ...p, [id]: !p[id] }));
  };

  const renderNodes = (nodes: NavNode[], depth: number) =>
    nodes.map((node) => {
      if (node.kind === "leaf") {
        return (
          <div key={node.id}>
            <LeafRow
              id={node.id}
              label={node.label}
              icon={node.icon}
              addon={node.addon}
              active={activeLeafId === node.id}
              depth={depth}
              onSelect={onSelectLeaf}
            />
          </div>
        );
      }
      return (
        <BranchBlock
          key={node.id}
          branch={node}
          depth={depth}
          open={openBranches[node.id] ?? false}
          onToggle={() => toggleBranch(node.id)}
          renderChildren={(children, d) => renderNodes(children, d)}
        />
      );
    });

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden border-r border-solid transition-[width] duration-200 ease-out [background:var(--pos-sb-bg)] [border-color:var(--pos-sb-border)] ${
        sidebarCollapsed ? "w-[56px]" : "w-[260px]"
      }`}
    >
      {/* Header */}
      <div
        className={`shrink-0 border-b [border-color:var(--pos-sb-divider)] [background:var(--pos-sb-header-bg)] ${
          sidebarCollapsed ? "px-1.5 py-3" : "px-4 py-3"
        }`}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[var(--pos-sb-brand-bg)]"
              title={RESTAURANT.name}
            >
              <UtensilsCrossed className="size-[15px] text-[var(--pos-sb-text-1)]" strokeWidth={2} />
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(!sidebarCollapsed)}
              className="flex size-7 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
              aria-expanded={!sidebarCollapsed}
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="size-3.5 shrink-0" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-[6px] bg-[var(--pos-sb-brand-bg)]"
              title={RESTAURANT.name}
            >
              <UtensilsCrossed className="size-[15px] text-[var(--pos-sb-text-1)]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-[var(--pos-sb-text-1)]">
                {RESTAURANT.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] leading-tight text-[var(--pos-sb-text-2)]">
                {RESTAURANT.branch}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div className="scale-90 opacity-60 hover:opacity-100 transition-opacity">
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(!sidebarCollapsed)}
                className="flex size-7 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
                aria-expanded={!sidebarCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="size-3.5 shrink-0" strokeWidth={1.8} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav
        ref={navRef}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col gap-0.5 px-1 pt-3">
            {COLLAPSED_SHORTCUTS.map((s) => (
              <CollapsedLeafIcon
                key={s.id}
                id={s.id}
                label={s.label}
                icon={s.icon}
                active={activeLeafId === s.id}
                onSelect={onSelectLeaf}
              />
            ))}
          </div>
        ) : (
          <div className="px-2 py-3">
            {POS_NAV_SECTIONS.map((section, i) => (
              <div key={section.id} className={i > 0 ? "mt-4" : ""}>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--pos-sb-section-label)]">
                  {section.label}
                </p>
                <div className="flex flex-col gap-0.5">{renderNodes(section.nodes, 0)}</div>
              </div>
            ))}
          </div>
        )}

        {sidebarCollapsed && collapsedCanScrollDown ? (
          <div className="pointer-events-none sticky bottom-0 left-0 right-0 flex justify-center pb-2 pt-4">
            <div className="flex size-7 items-center justify-center rounded-full bg-[var(--pos-sb-bg)] text-[var(--pos-sb-icon)] shadow-sm ring-1 ring-[var(--pos-sb-border)]">
              <ChevronDown className="size-3.5" strokeWidth={2} aria-hidden />
            </div>
          </div>
        ) : null}
      </nav>

      {/* Footer */}
      <div
        className={`shrink-0 border-t [border-color:var(--pos-sb-divider)] [background:var(--pos-sb-header-bg)] ${
          sidebarCollapsed ? "px-1.5 py-3" : "px-3 py-3"
        }`}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pos-sb-brand-bg)] text-[11px] font-bold text-[var(--pos-sb-text-1)]"
              title="Demo server"
            >
              D
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex size-8 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-1)]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-[6px] bg-[var(--pos-sb-card)] px-2.5 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pos-sb-brand-bg)] text-[11px] font-bold text-[var(--pos-sb-text-1)]">
              D
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[var(--pos-sb-text-1)]">
                Demo server
              </p>
              <p className="truncate text-[10px] text-[var(--pos-sb-text-2)]">
                Sample session
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-1)]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** @deprecated Renamed to PosSidebar (kept for compatibility). */
export const PosBhojonSidebar = PosSidebar;

function BranchBlock({
  branch,
  depth,
  open,
  onToggle,
  renderChildren,
}: {
  branch: NavBranch;
  depth: number;
  open: boolean;
  onToggle: () => void;
  renderChildren: (nodes: NavNode[], depth: number) => ReactNode;
}) {
  const Icon = branch.icon;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className={`group flex min-h-[44px] w-full items-center gap-2.5 rounded-[5px] py-2.5 pl-3 pr-3 text-left text-[13px] transition-all duration-150 ${
          open
            ? "bg-[var(--pos-sb-branch-open)] font-semibold text-[var(--pos-sb-text-3)]"
            : "font-medium text-[var(--pos-sb-text-2)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
        }`}
        aria-expanded={open}
      >
        <Icon
          className="size-[15px] shrink-0 text-[var(--pos-sb-icon)] transition-colors group-hover:text-[var(--pos-sb-text-3)]"
          strokeWidth={open ? 2.2 : 1.8}
        />
        <span className="min-w-0 flex-1 truncate leading-none">{branch.label}</span>
        {branch.addon ? (
          <span className="shrink-0 rounded-[3px] border border-[var(--pos-sb-badge-border)] bg-[var(--pos-sb-badge-bg)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pos-sb-badge-fg)]">
            Add-on
          </span>
        ) : null}
        <ChevronRight
          className={`size-3.5 shrink-0 text-[var(--pos-sb-icon)] transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
          strokeWidth={2}
        />
      </button>

      {open ? (
        <div className="mt-0.5 mb-1 flex flex-col gap-0.5 border-l border-[var(--pos-sb-divider)] ml-[22px]">
          {renderChildren(branch.children, depth + 1)}
        </div>
      ) : null}
    </div>
  );
}
