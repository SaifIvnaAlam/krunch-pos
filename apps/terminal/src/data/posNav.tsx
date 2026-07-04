import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  ClipboardList,
  LineChart,
  NotebookPen,
  Receipt,
  Salad,
  TrendingUp,
  UserRound,
  UtensilsCrossed,
} from "lucide-react";

export type NavLeaf = {
  kind: "leaf";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
  /** When true, leaf stays routable but is omitted from sidebar / mobile nav. */
  hidden?: boolean;
};

export type NavBranch = {
  kind: "branch";
  id: string;
  label: string;
  icon: LucideIcon;
  addon?: boolean;
  beta?: boolean;
  hidden?: boolean;
  children: NavNode[];
};

export type NavNode = NavLeaf | NavBranch;

export type NavSection = {
  id: string;
  label: string;
  nodes: NavNode[];
};

const OFFICE_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "exp-daily", label: "Daily Entry Form", icon: NotebookPen },
  {
    kind: "branch",
    id: "lm-branch",
    label: "Ledger",
    icon: BookMarked,
    children: [
      { kind: "leaf", id: "lm-management", label: "Ledger books", icon: BookOpen },
      { kind: "leaf", id: "lm-ledger", label: "Bills & payments", icon: Receipt },
    ],
  },
  {
    kind: "branch",
    id: "rep-branch",
    label: "Reports",
    icon: BarChart3,
    children: [
      { kind: "leaf", id: "rep-management", label: "Expense reports", icon: Receipt },
      { kind: "leaf", id: "rep-sales", label: "Sales report", icon: TrendingUp },
      { kind: "leaf", id: "rep-analytics", label: "Analytics", icon: LineChart },
    ],
  },
  {
    kind: "branch",
    id: "hr-branch",
    label: "Employees",
    icon: UserRound,
    children: [
      { kind: "leaf", id: "hr-employees", label: "Employee Management", icon: UserRound },
      { kind: "leaf", id: "hr-payroll", label: "Employee Salaries", icon: Receipt },
    ],
  },
];

const OPERATIONS_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "menu", label: "Take orders", icon: UtensilsCrossed, hidden: true },
  { kind: "leaf", id: "mo-list", label: "Orders", icon: ClipboardList, hidden: true },
  { kind: "leaf", id: "fd-menu", label: "Menu setup", icon: Salad, hidden: true },
];

export const POS_NAV_SECTIONS: NavSection[] = [
  { id: "office", label: "", nodes: OFFICE_NAV_NODES },
  { id: "operations", label: "Operations", nodes: OPERATIONS_NAV_NODES },
];

export const HIDDEN_NAV_LEAF_IDS = new Set(
  OPERATIONS_NAV_NODES.filter((n): n is NavLeaf => n.kind === "leaf" && n.hidden === true).map(
    (n) => n.id,
  ),
);

function isNavNodeVisible(node: NavNode): boolean {
  if (node.hidden) return false;
  if (node.kind === "branch") {
    return filterVisibleNavNodes(node.children).length > 0;
  }
  return true;
}

export function filterVisibleNavNodes(nodes: NavNode[]): NavNode[] {
  return nodes
    .filter(isNavNodeVisible)
    .map((node) =>
      node.kind === "branch"
        ? { ...node, children: filterVisibleNavNodes(node.children) }
        : node,
    );
}

/** Sidebar / mobile nav sections (hidden leaves omitted; empty sections dropped). */
export function getVisibleNavSections(): NavSection[] {
  return POS_NAV_SECTIONS.map((section) => ({
    ...section,
    nodes: filterVisibleNavNodes(section.nodes),
  })).filter((section) => section.nodes.length > 0);
}

export function leavesFromNodes(nodes: NavNode[]): NavLeaf[] {
  const out: NavLeaf[] = [];
  function walk(list: NavNode[]) {
    for (const n of list) {
      if (n.kind === "leaf") out.push(n);
      else walk(n.children);
    }
  }
  walk(nodes);
  return out;
}

/** Flat list of sidebar leaves (for mobile nav). */
export function flattenNavLeaves(): NavLeaf[] {
  return POS_NAV_SECTIONS.flatMap((s) => leavesFromNodes(s.nodes));
}

/** IDs that open the POS menu + cart surface. */
export const MENU_VIEW_IDS = new Set(["menu"]);

export function collectAllLeafIds(): string[] {
  return flattenNavLeaves().map((n) => n.id);
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
