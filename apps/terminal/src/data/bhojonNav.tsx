import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  LayoutGrid,
  UtensilsCrossed,
  ClipboardList,
  CalendarDays,
  ShoppingCart,
  ChefHat,
  Factory,
  Users,
  ChartColumn,
  Share2,
  Gift,
  QrCode,
  Clock,
  Receipt,
  Trash2,
  MessageCircle,
  Settings,
  UserCircle,
  Puzzle,
  Palette,
  Shield,
  Globe,
  Download,
  Mail,
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

/** POS operations + administration navigation tree. */
export const POS_NAV_SECTIONS: NavSection[] = [
  {
    id: "register",
    label: "Register",
    nodes: [
      { kind: "leaf", id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { kind: "leaf", id: "floor", label: "Floor", icon: LayoutGrid },
      { kind: "leaf", id: "menu", label: "Menu / POS", icon: UtensilsCrossed },
    ],
  },
  {
    id: "operations",
    label: "Operations",
    nodes: [
      {
        kind: "branch",
        id: "manage-order",
        label: "Manage order",
        icon: ClipboardList,
        children: [
          {
            kind: "leaf",
            id: "mo-pos",
            label: "POS / New order",
            icon: UtensilsCrossed,
          },
          {
            kind: "leaf",
            id: "mo-list",
            label: "Order list",
            icon: ClipboardList,
          },
          {
            kind: "leaf",
            id: "mo-pending",
            label: "Pending / kitchen",
            icon: Factory,
          },
          {
            kind: "leaf",
            id: "mo-completed",
            label: "Completed",
            icon: Receipt,
          },
          {
            kind: "leaf",
            id: "mo-cancelled",
            label: "Cancelled",
            icon: Trash2,
          },
          {
            kind: "leaf",
            id: "mo-invoices",
            label: "POS invoice list",
            icon: Receipt,
          },
          {
            kind: "leaf",
            id: "mo-online",
            label: "Online order queue",
            icon: Globe,
          },
        ],
      },
      {
        kind: "branch",
        id: "reservation",
        label: "Reservation",
        icon: CalendarDays,
        children: [
          { kind: "leaf", id: "rsv-list", label: "Reservation list", icon: CalendarDays },
          { kind: "leaf", id: "rsv-new", label: "New booking", icon: CalendarDays },
          { kind: "leaf", id: "rsv-blackout", label: "Unavailable days", icon: CalendarDays },
          { kind: "leaf", id: "rsv-settings", label: "Table settings", icon: Settings },
        ],
      },
      {
        kind: "branch",
        id: "purchase",
        label: "Purchase manage",
        icon: ShoppingCart,
        children: [
          { kind: "leaf", id: "pu-list", label: "Purchase list", icon: ShoppingCart },
          { kind: "leaf", id: "pu-new", label: "New purchase", icon: ShoppingCart },
          { kind: "leaf", id: "pu-return", label: "Return purchase", icon: ShoppingCart },
          { kind: "leaf", id: "pu-suppliers", label: "Supplier list", icon: Users },
          { kind: "leaf", id: "pu-ledger", label: "Supplier ledger", icon: Receipt },
        ],
      },
      {
        kind: "branch",
        id: "food-mgmt",
        label: "Food management",
        icon: ChefHat,
        children: [
          { kind: "leaf", id: "fd-cat", label: "Food category list", icon: ChefHat },
          { kind: "leaf", id: "fd-items", label: "Add / edit food items", icon: UtensilsCrossed },
          { kind: "leaf", id: "fd-addon", label: "Add-on list", icon: Puzzle },
          { kind: "leaf", id: "fd-menu-type", label: "Menu type / service period", icon: Clock },
          { kind: "leaf", id: "fd-barcode", label: "Barcode / internal codes", icon: QrCode },
        ],
      },
      {
        kind: "branch",
        id: "production",
        label: "Production",
        icon: Factory,
        children: [
          { kind: "leaf", id: "pr-recipe", label: "Recipe management", icon: Factory },
          { kind: "leaf", id: "pr-units", label: "Production unit list", icon: Factory },
          { kind: "leaf", id: "pr-run", label: "Add production run", icon: Factory },
          { kind: "leaf", id: "pr-settings", label: "Production settings", icon: Settings },
        ],
      },
      {
        kind: "branch",
        id: "hr",
        label: "Human resource",
        icon: Users,
        children: [
          { kind: "leaf", id: "hr-emp", label: "Employee list", icon: Users },
          { kind: "leaf", id: "hr-att", label: "Attendance", icon: Clock },
          { kind: "leaf", id: "hr-leave", label: "Leave", icon: CalendarDays },
          { kind: "leaf", id: "hr-pay", label: "Payroll / salaries", icon: Receipt },
        ],
      },
      {
        kind: "branch",
        id: "report",
        label: "Report",
        icon: ChartColumn,
        children: [
          { kind: "leaf", id: "rp-sales", label: "Sales report", icon: ChartColumn },
          { kind: "leaf", id: "rp-purchase", label: "Purchase report", icon: ShoppingCart },
          { kind: "leaf", id: "rp-stock", label: "Stock report", icon: Factory },
          { kind: "leaf", id: "rp-register", label: "Cash register / shift", icon: Receipt },
          { kind: "leaf", id: "rp-commission", label: "Waiter performance", icon: Users },
        ],
      },
    ],
  },
  {
    id: "addons",
    label: "Add-ons",
    nodes: [
      {
        kind: "leaf",
        id: "ad-facebook",
        label: "Facebook setting",
        icon: Share2,
        addon: true,
      },
      { kind: "leaf", id: "ad-loyalty", label: "Loyalty", icon: Gift, addon: true },
      { kind: "leaf", id: "ad-qr", label: "QR app", icon: QrCode, addon: true },
      { kind: "leaf", id: "ad-shift", label: "Shift management", icon: Clock, addon: true },
      { kind: "leaf", id: "ad-tax", label: "Tax setting", icon: Receipt, addon: true },
      { kind: "leaf", id: "ad-waste", label: "Waste tracking", icon: Trash2 },
      {
        kind: "leaf",
        id: "ad-whatsapp",
        label: "Whatsapp setting",
        icon: MessageCircle,
        addon: true,
      },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    nodes: [
      {
        kind: "branch",
        id: "setting",
        label: "Setting",
        icon: Settings,
        children: [
          { kind: "leaf", id: "st-company", label: "Company / branch profile", icon: Settings },
          { kind: "leaf", id: "st-locale", label: "Localization", icon: Globe },
          { kind: "leaf", id: "st-notify", label: "Email / SMS templates", icon: Mail },
          { kind: "leaf", id: "st-paygw", label: "Payment gateway", icon: Receipt },
          { kind: "leaf", id: "st-backup", label: "Backup / maintenance", icon: Download },
        ],
      },
      { kind: "leaf", id: "user", label: "User", icon: UserCircle },
      { kind: "leaf", id: "modules", label: "Modules", icon: Puzzle },
      { kind: "leaf", id: "themes", label: "Themes", icon: Palette },
      { kind: "leaf", id: "role", label: "Role permission", icon: Shield },
      {
        kind: "branch",
        id: "web-setting",
        label: "Web setting",
        icon: Globe,
        children: [
          { kind: "leaf", id: "ws-site", label: "Site identity", icon: Globe },
          { kind: "leaf", id: "ws-cms", label: "Homepage / CMS blocks", icon: LayoutGrid },
          { kind: "leaf", id: "ws-hours", label: "Online order hours", icon: Clock },
        ],
      },
      { kind: "leaf", id: "auto-update", label: "Auto update", icon: Download },
      {
        kind: "branch",
        id: "message",
        label: "Message",
        icon: Mail,
        children: [
          { kind: "leaf", id: "msg-inbox", label: "Inbox / sent", icon: Mail },
          { kind: "leaf", id: "msg-compose", label: "Compose / broadcast", icon: Mail },
          { kind: "leaf", id: "msg-templates", label: "Templates", icon: Mail },
        ],
      },
    ],
  },
];

/** IDs that open the POS menu + cart surface. */
export const MENU_VIEW_IDS = new Set(["menu", "mo-pos"]);

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
