import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  NotebookPen,
  Package,
  Factory,
  Users,
  CalendarDays,
  CalendarOff,
  Receipt,
  TrendingUp,
} from "lucide-react";

export type NavLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
};

export type NavBranch = {
  kind: "branch";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  children: NavNode[];
};

export type NavNode = NavLeaf | NavBranch;

export type NavSection = {
  id: string;
  label: string;
  nodes: NavNode[];
};

const SIDEBAR_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "exp-daily", label: "Daily Entry Form", icon: NotebookPen },
  {
    kind: "branch",
    id: "reports",
    label: "Reports",
    icon: BarChart3,
    children: [
      { kind: "leaf", id: "rep-expenses", label: "Expense reports", icon: Receipt },
      { kind: "leaf", id: "rep-sales", label: "Sales report", icon: TrendingUp },
    ],
  },
  {
    kind: "branch",
    id: "inventory-management",
    label: "Inventory Management",
    icon: Package,
    children: [
      {
        kind: "leaf",
        id: "inv-overview",
        label: "Stock overview",
        icon: Package,
      },
      {
        kind: "leaf",
        id: "inv-adjust",
        label: "Stock in & out",
        icon: Factory,
      },
    ],
  },
  {
    kind: "branch",
    id: "employee-management",
    label: "Employee Management",
    icon: Users,
    children: [
      { kind: "leaf", id: "hr-directory", label: "Employee List", icon: Users },
      { kind: "leaf", id: "hr-roster", label: "Roster & Attendance", icon: CalendarDays },
      { kind: "leaf", id: "hr-leave", label: "Leave", icon: CalendarOff },
      { kind: "leaf", id: "hr-payroll", label: "Payroll & Compensation", icon: Receipt },
    ],
  },
];

export const POS_NAV_SECTIONS: NavSection[] = [
  { id: "sidebar", label: "", nodes: SIDEBAR_NAV_NODES },
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
} | null {
  function walk(nodes: NavNode[]): { label: string; icon: LucideIcon; addon?: boolean } | null {
    for (const n of nodes) {
      if (n.kind === "leaf" && n.id === id) {
        return { label: n.label, icon: n.icon, addon: n.addon };
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
