import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  LogOut,
  UtensilsCrossed,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { ThemeToggle } from "../ThemeToggle";
import {
  POS_NAV_SECTIONS,
  branchPathToLeaf,
  type NavBranch,
  type NavLeaf,
  type NavNode,
} from "../../data/bhojonNav";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const RESTAURANT = {
  name: "Remi Kitchen",
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
  /** Nested depth: 0 for top-level leaves, >0 for branch children. */
  depth: number;
  onSelect: (id: string) => void;
}) {
  const isNested = depth > 0;
  const tileBase = `flex ${isNested ? "size-8 rounded-[7px]" : "size-9 rounded-[8px]"} shrink-0 items-center justify-center border border-solid transition-colors duration-150 ${border0}`;

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? "page" : undefined}
      className={`mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-[9px] py-1.5 pr-2.5 text-left transition-colors duration-150 ${
        isNested ? "ml-2.5 pl-1.5" : "pl-2"
      } ${
        active
          ? `bg-[var(--pos-nav-expanded-active)] text-[var(--pos-text-1)] [border-color:var(--pos-border-hairline)] ${border0}`
          : isNested
            ? "text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/80 hover:text-[var(--pos-text-1)]"
            : "text-[var(--pos-text-2)] hover:bg-[var(--pos-nav-hover)]/80 hover:text-[var(--pos-text-1)]"
      }`}
    >
      <span
        className={`${tileBase} ${
          active
            ? "border-[var(--pos-border-medium)] bg-[var(--pos-icon-tile-bg)] text-[var(--pos-text-1)]"
            : isNested
              ? "bg-[var(--pos-icon-tile-bg)] text-[var(--pos-icon-muted)]"
              : `bg-[var(--pos-icon-tile-bg)] text-[var(--pos-icon-muted)]`
        }`}
      >
        <Icon className={`${isNested ? "size-[14px]" : "size-4"} shrink-0`} strokeWidth={2} />
      </span>
      {isNested ? (
        <span
          className={`size-1.5 shrink-0 rounded-full ${
            active ? "bg-[var(--pos-text-1)]" : "bg-[var(--pos-border-medium)]"
          }`}
          aria-hidden
        />
      ) : null}
      <span
        className={`min-w-0 flex-1 truncate ${isNested ? "text-[12px]" : "text-[13px]"} ${
          active || !isNested ? "font-medium" : "font-normal"
        } ${!active && isNested ? "text-[var(--pos-text-2)]" : "text-[var(--pos-text-1)]"}`}
      >
        {label}
      </span>
      {addon ? (
        <span className="shrink-0 rounded-full border border-solid border-[#5b9bd6] bg-[#c8def5] px-1.5 py-0.5 text-[9px] font-medium text-[#2f6dae]">
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
      className={`flex w-full items-center justify-center py-2 transition-colors duration-150 ${
        active ? "" : "text-[var(--pos-text-2)] hover:text-[var(--pos-text-1)]"
      }`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-[10px] transition-colors duration-150 ${
          active
            ? "bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)]"
            : "hover:bg-[var(--pos-nav-hover)]"
        }`}
      >
        <Icon className="size-[18px] shrink-0" strokeWidth={2} />
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
      className={`flex shrink-0 flex-col overflow-hidden border-r border-solid [border-color:var(--pos-border-hairline)] bg-[var(--pos-sidebar)] transition-[width] duration-200 ease-out ${
        sidebarCollapsed ? "w-[68px]" : "w-[280px]"
      }`}
    >
      <div
        className={`border-b border-solid [border-color:var(--pos-divider)] px-2 ${
          sidebarCollapsed ? "py-2" : "py-3"
        }`}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-1">
            <div
              className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)] ${border0}`}
              title={RESTAURANT.name}
            >
              <UtensilsCrossed className="size-4" strokeWidth={2} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="scale-[0.9]">
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(!sidebarCollapsed)}
                className={`flex size-7 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] text-[var(--pos-text-2)] transition-colors hover:[border-color:var(--pos-border-strong)] hover:bg-[var(--pos-nav-hover)] hover:text-[var(--pos-text-1)] ${border0}`}
                aria-expanded={!sidebarCollapsed}
                aria-label="Expand sidebar"
                title="Expand sidebar"
              >
                <PanelLeftOpen className="size-3.5 shrink-0" strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div
              className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)] ${border0}`}
              title={RESTAURANT.name}
            >
              <UtensilsCrossed className="size-[18px]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight text-[var(--pos-text-1)]">
                {RESTAURANT.name}
              </p>
              <p className="mt-1 truncate text-[11px] leading-tight text-[var(--pos-text-2)]">
                {RESTAURANT.branch}
              </p>
            </div>
            <div className={`flex shrink-0 items-center gap-1 rounded-[10px] bg-[var(--pos-card)] p-1 ${border0}`}>
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setCollapsed(!sidebarCollapsed)}
                className="flex size-8 items-center justify-center rounded-[8px] text-[var(--pos-text-2)] transition-colors hover:bg-[var(--pos-nav-hover)] hover:text-[var(--pos-text-1)]"
                aria-expanded={!sidebarCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
              >
                <PanelLeftClose className="size-4 shrink-0" strokeWidth={2} />
              </button>
            </div>
          </div>
        )}
      </div>

      <nav
        ref={navRef}
        className={`relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1.5 ${
          sidebarCollapsed
            ? "[scrollbar-width:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar-thumb]:bg-transparent"
            : "[scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--pos-border-medium)] [&::-webkit-scrollbar-track]:bg-transparent"
        }`}
      >
        {sidebarCollapsed ? (
          <div className="flex flex-col gap-1 px-1 pt-2">
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
          <div className="overflow-x-hidden pt-1">
            {POS_NAV_SECTIONS.map((section) => (
              <div key={section.id} className="mb-1.5">
                <p className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]/90">
                  {section.label}
                </p>
                <div className="flex flex-col gap-1">{renderNodes(section.nodes, 0)}</div>
              </div>
            ))}
          </div>
        )}

        {sidebarCollapsed && collapsedCanScrollDown ? (
          <div className="pointer-events-none sticky bottom-0 left-0 right-0 flex justify-center pb-2 pt-6">
            <div className="flex size-9 items-center justify-center rounded-full bg-[var(--pos-sidebar)]/85 text-[var(--pos-text-2)] shadow-sm ring-1 ring-[var(--pos-border-hairline)] backdrop-blur">
              <ChevronDown className="size-4" strokeWidth={2} aria-hidden />
            </div>
          </div>
        ) : null}
      </nav>

      <div className="shrink-0 border-t border-solid [border-color:var(--pos-divider)] px-2 py-3">
        {sidebarCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <div
              className="flex size-9 items-center justify-center rounded-full bg-[#2f6dae] text-[11px] font-medium text-white"
              title="Demo server"
            >
              D
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex size-10 items-center justify-center rounded-[10px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-signout-bg)] text-[var(--pos-text-2)] transition-colors hover:[border-color:var(--pos-border-strong)] hover:text-[var(--pos-text-1)]"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" strokeWidth={2} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[var(--pos-card)] px-2 py-2 pr-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#2f6dae] text-[12px] font-medium text-white">
                D
              </div>
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-[var(--pos-text-1)]">
                  Demo server
                </p>
                <p className="truncate text-[11px] text-[var(--pos-text-2)]">
                  Sample session
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-signout-bg)] text-[var(--pos-text-2)] transition-colors hover:[border-color:var(--pos-border-strong)] hover:text-[var(--pos-text-1)] ${border0}`}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" strokeWidth={2} />
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
    <div className={depth > 0 ? "ml-1.5" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className={`mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-[12px] py-1.5 pl-2 pr-2 text-left transition-colors ${
          open
            ? `bg-[var(--pos-card)] text-[var(--pos-text-1)] ${border0}`
            : `bg-[var(--pos-card)] text-[var(--pos-text-1)] ${border0} hover:bg-[var(--pos-nav-hover)]/70`
        }`}
        aria-expanded={open}
      >
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-[8px] border border-solid bg-[var(--pos-icon-tile-bg)] text-[var(--pos-icon-muted)] [border-color:var(--pos-border-medium)]`}
        >
          <Icon className="size-4 shrink-0" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[var(--pos-text-1)]">
          {branch.label}
        </span>
        {branch.addon ? (
          <span className="shrink-0 rounded-full border border-solid border-[#5b9bd6] bg-[#c8def5] px-1.5 py-0.5 text-[9px] font-medium text-[#2f6dae]">
            Add-on
          </span>
        ) : null}
        <ChevronDown
          className={`size-4 shrink-0 text-[var(--pos-icon-muted)] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2}
        />
      </button>
      {open ? (
        <div className="mt-1 flex flex-col gap-0.5 pl-1">
          {renderChildren(branch.children, depth + 1)}
        </div>
      ) : null}
    </div>
  );
}
