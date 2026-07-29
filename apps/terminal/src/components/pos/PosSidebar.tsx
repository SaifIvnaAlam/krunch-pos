import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
import { useSession } from "@/features/auth";
import {
  getVisibleNavSections,
  branchPathToLeaf,
  leavesFromNodes,
  type NavBranch,
  type NavLeaf,
  type NavNode,
} from "../../data/posNav";

/** One collapsed-rail button per top-level nav row (matches expanded sidebar, not every nested leaf). */
type CollapsedShortcut =
  | {
      key: string;
      kind: "leaf";
      label: string;
      icon: LucideIcon;
      leafId: string;
    }
  | {
      key: string;
      kind: "branch";
      label: string;
      icon: LucideIcon;
      leaves: NavLeaf[];
      activeLeafIds: string[];
    };

function leafIdsUnder(node: NavNode): string[] {
  if (node.kind === "leaf") return [node.id];
  return node.children.flatMap(leafIdsUnder);
}

function topLevelNodesToCollapsedShortcuts(nodes: NavNode[]): CollapsedShortcut[] {
  const out: CollapsedShortcut[] = [];
  for (const node of nodes) {
    if (node.kind === "leaf") {
      out.push({
        key: node.id,
        kind: "leaf",
        label: node.label,
        icon: node.icon,
        leafId: node.id,
      });
    } else {
      const leaves = leavesFromNodes(node.children);
      const activeLeafIds = leafIdsUnder(node);
      if (leaves.length === 0) continue;
      out.push({
        key: node.id,
        kind: "branch",
        label: node.label,
        icon: node.icon,
        leaves,
        activeLeafIds,
      });
    }
  }
  return out;
}

const SIDEBAR_COLLAPSED_KEY = "remi_pos_sidebar_collapsed";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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

function NavBadge({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-[3px] border border-[var(--pos-sb-badge-border)] bg-transparent px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--pos-sb-badge-fg)]">
      {children}
    </span>
  );
}

function NavSectionHeader({ children }: { children: string }) {
  return (
    <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-sb-section-label)]">
      {children}
    </p>
  );
}

function LeafRow({
  id,
  label,
  icon: Icon,
  addon,
  beta,
  active,
  depth,
  onSelect,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
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

      {addon ? <NavBadge>Add-on</NavBadge> : null}
      {beta ? <NavBadge>Beta</NavBadge> : null}
    </button>
  );
}

function CollapsedNavIconButton({
  label,
  icon: Icon,
  active,
  onActivate,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onActivate}
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

function CollapsedBranchNavButton({
  label,
  icon: Icon,
  active,
  leaves,
  activeLeafId,
  onSelectLeaf,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  leaves: NavLeaf[];
  activeLeafId: string;
  onSelectLeaf: (id: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [flyoutStyle, setFlyoutStyle] = useState<{ top: number; left: number } | null>(null);

  const computeFlyoutStyle = () => {
    const btn = buttonRef.current;
    if (!btn) return null;
    const rect = btn.getBoundingClientRect();
    const flyoutWidth = 220;
    const overlap = 8;
    const margin = 8;
    let left = rect.right - overlap;
    if (left + flyoutWidth > window.innerWidth - margin) {
      left = Math.max(margin, rect.left - flyoutWidth + overlap);
    }
    const estimatedHeight = 44 + leaves.length * 40;
    let top = rect.top;
    if (top + estimatedHeight > window.innerHeight - margin) {
      top = Math.max(margin, window.innerHeight - estimatedHeight - margin);
    }
    return { top, left };
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const showFlyout = () => {
    clearCloseTimer();
    if (leaves.length <= 1) return;
    setFlyoutStyle(computeFlyoutStyle());
    setOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      setFlyoutStyle(null);
    }, 150);
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      setFlyoutStyle(computeFlyoutStyle());
    };

    updatePosition();
    window.addEventListener("resize", updatePosition, { passive: true });
    window.addEventListener("scroll", updatePosition, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, leaves.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setFlyoutStyle(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const handleClick = () => {
    if (leaves.length === 1) onSelectLeaf(leaves[0].id);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={showFlyout}
        onMouseLeave={scheduleClose}
        title={label}
        aria-label={label}
        aria-haspopup={leaves.length > 1 ? "menu" : undefined}
        aria-expanded={leaves.length > 1 ? open : undefined}
        aria-current={active ? "page" : undefined}
        className="group relative flex w-full items-center justify-center py-1.5"
      >
        <span
          className={`flex size-10 items-center justify-center rounded-[6px] transition-all duration-150 ${
            active || open
              ? "bg-[var(--pos-sb-active-bg)] text-[var(--pos-sb-active-icon)]"
              : "text-[var(--pos-sb-icon)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
          }`}
        >
          <Icon className="size-[16px] shrink-0" strokeWidth={active || open ? 2.2 : 1.8} />
        </span>
      </button>

      {open && flyoutStyle && leaves.length > 1
        ? createPortal(
            <div
              role="menu"
              aria-label={label}
              onMouseEnter={showFlyout}
              onMouseLeave={scheduleClose}
              className="fixed z-[200] min-w-[200px] max-w-[min(240px,calc(100vw-16px))] overflow-hidden rounded-[8px] border border-solid [border-color:var(--pos-sb-border)] [background:var(--pos-sb-bg)] py-1 shadow-lg"
              style={{ top: flyoutStyle.top, left: flyoutStyle.left }}
            >
              <p className="border-b border-solid px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-sb-section-label)] [border-color:var(--pos-sb-divider)]">
                {label}
              </p>
              {leaves.map((leaf) => {
                const LeafIcon = leaf.icon;
                const leafActive = activeLeafId === leaf.id;
                return (
                  <button
                    key={leaf.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      setFlyoutStyle(null);
                      onSelectLeaf(leaf.id);
                    }}
                    aria-current={leafActive ? "page" : undefined}
                    className={`group flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12px] transition-colors ${
                      leafActive
                        ? "bg-[var(--pos-sb-active-bg)] font-semibold text-[var(--pos-sb-active-text)]"
                        : "font-normal text-[var(--pos-sb-text-2)] hover:bg-[var(--pos-sb-hover)] hover:text-[var(--pos-sb-text-3)]"
                    }`}
                  >
                    <LeafIcon
                      className={`size-[13px] shrink-0 ${
                        leafActive
                          ? "text-[var(--pos-sb-active-icon)]"
                          : "text-[var(--pos-sb-icon)] group-hover:text-[var(--pos-sb-text-3)]"
                      }`}
                      strokeWidth={leafActive ? 2.2 : 1.8}
                    />
                    <span className="min-w-0 flex-1 truncate leading-none">{leaf.label}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function PosSidebar({
  activeLeafId,
  onSelectLeaf,
  onSignOut,
  userName = "",
  branchName = "Restaurant",
  branchAddress = null,
}: {
  activeLeafId: string;
  onSelectLeaf: (id: string) => void;
  onSignOut: () => void;
  userName?: string;
  branchName?: string;
  branchAddress?: string | null;
}) {
  const { permissions, userEmail } = useSession();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [openBranches, setOpenBranches] = useState<Record<string, boolean>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const [collapsedCanScrollDown, setCollapsedCanScrollDown] = useState(false);
  const navSections = getVisibleNavSections(permissions);
  const userInitials = initialsFromName(userName);
  const userDisplayName = userName.trim() || "Signed in";
  const userEmailDisplay = userEmail.trim() || "—";

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
              beta={node.beta}
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
      className={`hidden shrink-0 flex-col overflow-hidden border-r border-solid transition-[width] duration-200 ease-out [background:var(--pos-sb-bg)] [border-color:var(--pos-sb-border)] lg:flex ${
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
              title={branchName}
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
              className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[var(--pos-sb-brand-bg)]"
              title={branchName}
            >
              <UtensilsCrossed className="size-[15px] text-[var(--pos-sb-text-1)]" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight text-[var(--pos-sb-text-1)]">
                {branchName}
              </p>
              {branchAddress ? (
                <p className="mt-0.5 truncate text-[11px] leading-tight text-[var(--pos-sb-text-2)]">
                  {branchAddress}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <ThemeToggle variant="sidebar" />
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
      <nav ref={navRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        {sidebarCollapsed ? (
          <div className="flex flex-col gap-0.5 px-1 pt-3">
            {navSections.map((section, index) => {
              const shortcuts = topLevelNodesToCollapsedShortcuts(section.nodes);
              return (
                <div
                  key={section.id}
                  className={index > 0 ? "mt-2 border-t border-[var(--pos-sb-divider)] pt-2" : ""}
                >
                  {section.label ? (
                    <p
                      className="mb-1.5 px-0.5 text-center text-[8px] font-semibold uppercase leading-tight tracking-wide text-[var(--pos-sb-section-label)]"
                      title={section.label}
                    >
                      {section.label}
                    </p>
                  ) : null}
                  {shortcuts.map((s) =>
                    s.kind === "leaf" ? (
                      <CollapsedNavIconButton
                        key={s.key}
                        label={s.label}
                        icon={s.icon}
                        active={activeLeafId === s.leafId}
                        onActivate={() => onSelectLeaf(s.leafId)}
                      />
                    ) : (
                      <CollapsedBranchNavButton
                        key={s.key}
                        label={s.label}
                        icon={s.icon}
                        leaves={s.leaves}
                        activeLeafId={activeLeafId}
                        active={s.activeLeafIds.includes(activeLeafId)}
                        onSelectLeaf={onSelectLeaf}
                      />
                    ),
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-2 py-3">
            {navSections.map((section, index) => (
              <div
                key={section.id}
                className={index > 0 ? "mt-4 border-t border-[var(--pos-sb-divider)] pt-3" : ""}
              >
                {section.label ? <NavSectionHeader>{section.label}</NavSectionHeader> : null}
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
              title={userDisplayName}
            >
              {userInitials}
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex size-8 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-red-500/15 hover:text-red-400"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" strokeWidth={1.8} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-[6px] bg-[var(--pos-sb-card)] px-2.5 py-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--pos-sb-brand-bg)] text-[11px] font-bold text-[var(--pos-sb-text-1)]">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[var(--pos-sb-text-1)]">
                {userDisplayName}
              </p>
              <p
                className="truncate text-[10px] text-[var(--pos-sb-text-2)]"
                title={userEmailDisplay !== "—" ? userEmailDisplay : undefined}
              >
                {userEmailDisplay}
              </p>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              className="flex size-7 shrink-0 items-center justify-center rounded-[5px] text-[var(--pos-sb-icon)] transition-colors hover:bg-red-500/15 hover:text-red-400"
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
        {branch.addon ? <NavBadge>Add-on</NavBadge> : null}
        {branch.beta ? <NavBadge>Beta</NavBadge> : null}
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
