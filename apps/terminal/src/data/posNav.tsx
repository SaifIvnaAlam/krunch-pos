import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookMarked,
  LineChart,
  NotebookPen,
  Package,
  Receipt,
  TrendingUp,
  UserRound,
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

const OFFICE_NAV_NODES: NavNode[] = [
  { kind: "leaf", id: "exp-daily", label: "Daily Entry Form", icon: NotebookPen },
  { kind: "leaf", id: "lm-cashbooks", label: "Cashbooks", icon: BookMarked },
  { kind: "leaf", id: "lm-items", label: "Items purchased", icon: Package },
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

export const POS_NAV_SECTIONS: NavSection[] = [
  { id: "office", label: "", nodes: OFFICE_NAV_NODES },
];

export function filterVisibleNavNodes(nodes: NavNode[]): NavNode[] {
  return nodes
    .filter((node) => node.kind !== "branch" || filterVisibleNavNodes(node.children).length > 0)
    .map((node) =>
      node.kind === "branch"
        ? { ...node, children: filterVisibleNavNodes(node.children) }
        : node,
    );
}

/** Sidebar / mobile nav sections (empty sections dropped). */
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
