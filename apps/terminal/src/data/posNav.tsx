import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookMarked,
  ClipboardList,
  NotebookPen,
  Receipt,
  Salad,
  UtensilsCrossed,
} from "lucide-react";

export type NavLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
};

export type NavBranch = {
  kind: "branch";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
  children: NavNode[];
};

export type NavNode = NavLeaf | NavBranch;

export type NavSection = {
  id: string;
  label: string;
  nodes: NavNode[];
};

const PRIMARY_SIDEBAR_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "exp-daily", label: "Daily Entry Form", icon: NotebookPen },
  { kind: "leaf", id: "lm-management", label: "Ledger Management", icon: BookMarked },
  { kind: "leaf", id: "rep-management", label: "Reports", icon: BarChart3 },
  { kind: "leaf", id: "hr-payroll", label: "Employee Salaries", icon: Receipt },
];

const BETA_SIDEBAR_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "menu", label: "POS", icon: UtensilsCrossed, beta: true },
  { kind: "leaf", id: "mo-list", label: "Orders", icon: ClipboardList, beta: true },
  { kind: "leaf", id: "fd-menu", label: "Menu", icon: Salad, beta: true },
];

export const POS_NAV_SECTIONS: NavSection[] = [
  { id: "main", label: "", nodes: PRIMARY_SIDEBAR_NAV_NODES },
  { id: "upcoming", label: "Upcoming", nodes: BETA_SIDEBAR_NAV_NODES },
];

/** IDs that open the POS menu + cart surface. */
export const MENU_VIEW_IDS = new Set(["menu"]);

export function collectAllLeafIds(): string[] {
  const out: string[] = [];
  function walk(nodes: NavNode[]) {
    for (const n of nodes) {
      if (n.kind === "leaf") out.push(n.id);
      else walk(n.children);
    }
  }
  for (const s of POS_NAV_SECTIONS) walk(s.nodes);
  return out;
}

/** Branch IDs that must be open to reveal this leaf (innermost parent last). */
export function branchPathToLeaf(leafId: string): string[] {
  const path: string[] = [];

  function walk(nodes: NavNode[], stack: string[]): boolean {
    for (const n of nodes) {
      if (n.kind === "leaf") {
        if (n.id === leafId) {
          path.push(...stack);
          return true;
        }
      } else {
        if (walk(n.children, [...stack, n.id])) return true;
      }
    }
    return false;
  }

  for (const s of POS_NAV_SECTIONS) {
    if (walk(s.nodes, [])) break;
  }
  return path;
}

export function findLeafMeta(id: string): {
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
} | null {
  function walk(nodes: NavNode[]): {
    label: string;
    icon: LucideIcon;
    addon?: boolean;
    beta?: boolean;
  } | null {
    for (const n of nodes) {
      if (n.kind === "leaf" && n.id === id) {
        return { label: n.label, icon: n.icon, addon: n.addon, beta: n.beta };
      }
      if (n.kind === "branch") {
        const hit = walk(n.children);
        if (hit) return hit;
      }
    }
    return null;
  }
  for (const s of POS_NAV_SECTIONS) {
    const hit = walk(s.nodes);
    if (hit) return hit;
  }
  return null;
}
