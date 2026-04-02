import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  ClipboardList,
  Factory,
  Package,
  Plus,
  Search,
} from "lucide-react";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

export const INVENTORY_LEAF_IDS = new Set([
  "inv-overview",
  "inv-adjust",
  "inv-transfers",
  "inv-count",
]);

const DEMO_STOCK_ROWS = [
  {
    id: "1",
    item: "Ribeye 12oz (frozen)",
    sku: "MEAT-RB-12",
    location: "Walk-in cooler",
    onHand: 42,
    par: 36,
    unit: "ea",
    status: "ok" as const,
  },
  {
    id: "2",
    item: "House steak sauce (batch)",
    sku: "SAU-HSE-1L",
    location: "Prep dry",
    onHand: 8,
    par: 24,
    unit: "L",
    status: "low" as const,
  },
  {
    id: "3",
    item: "Microgreens mix",
    sku: "PRD-MG-250",
    location: "Low boy 2",
    onHand: 0,
    par: 10,
    unit: "tray",
    status: "out" as const,
  },
  {
    id: "4",
    item: "Dinner rolls (par-bake)",
    sku: "BRD-ROL-48",
    location: "Freezer",
    onHand: 96,
    par: 48,
    unit: "ea",
    status: "ok" as const,
  },
];

const STATUS_PILL: Record<
  "ok" | "low" | "out",
  string
> = {
  ok: "border-[#5a7a5a] bg-[#e8f0e8] text-[#1a3d1a]",
  low: "border-[#8a6a2a] bg-[#f5ecd8] text-[#5c4010]",
  out: "border-[#8a3a3a] bg-[#f5e0e0] text-[#5c1010]",
};

const STATUS_LABEL: Record<"ok" | "low" | "out", string> = {
  ok: "In range",
  low: "Below par",
  out: "Out of stock",
};

const DEMO_ADJUST_LINES = [
  {
    id: "a1",
    item: "House steak sauce (batch)",
    before: 8,
    delta: 4,
    reason: "Receiving · PO #8841",
  },
  {
    id: "a2",
    item: "Microgreens mix",
    before: 0,
    delta: 6,
    reason: "Correction · count sheet C-12",
  },
];

const DEMO_TRANSFERS = [
  {
    id: "TR-2401",
    from: "Central kitchen",
    to: "Downtown · Floor service",
    lines: 6,
    status: "in_transit" as const,
    created: "Apr 1, 2026 · 09:12",
  },
  {
    id: "TR-2398",
    from: "Downtown · Floor service",
    to: "Downtown · Bar",
    lines: 3,
    status: "posted" as const,
    created: "Mar 31, 2026 · 16:40",
  },
  {
    id: "TR-2395",
    from: "Walk-in cooler",
    to: "Prep kitchen",
    lines: 12,
    status: "draft" as const,
    created: "Mar 31, 2026 · 11:05",
  },
];

const TRANSFER_PILL: Record<
  "draft" | "in_transit" | "posted",
  string
> = {
  draft: "border-[#6f6f6f] bg-[#f0f0f0] text-[#222]",
  in_transit: "border-[#4a6a8a] bg-[#e4eef8] text-[#1a3555]",
  posted: "border-[#3a5a3a] bg-[#e4f0e4] text-[#1a3a1a]",
};

const DEMO_COUNTS = [
  {
    id: "CNT-118",
    location: "Walk-in cooler",
    owner: "M. Rahman",
    progressPct: 72,
    status: "open" as const,
    started: "Apr 1, 2026 · 07:00",
  },
  {
    id: "CNT-117",
    location: "Dry storage · Aisle B",
    owner: "S. Chowdhury",
    progressPct: 100,
    status: "review" as const,
    started: "Mar 30, 2026 · 21:15",
  },
  {
    id: "CNT-116",
    location: "Bar backstock",
    owner: "A. Khan",
    progressPct: 100,
    status: "closed" as const,
    started: "Mar 28, 2026 · 10:00",
  },
];

const COUNT_PILL: Record<"open" | "review" | "closed", string> = {
  open: "border-[#4a6a8a] bg-[#e8f0f8] text-[#1a3555]",
  review: "border-[#8a6a2a] bg-[#f8f0e0] text-[#5c4010]",
  closed: "border-[#3a5a3a] bg-[#e8f2e8] text-[#1a3a1a]",
};

function PageHeader({
  section,
  title,
  subtitle,
  icon: Icon,
}: {
  section: string;
  title: string;
  subtitle: string;
  icon: typeof Package;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--pos-nav-active-bg)] text-[var(--pos-nav-active-fg)] ${border0}`}
      >
        <Icon className="size-5" strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
          {section}
        </p>
        <h1 className="mt-0.5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--pos-text-1)]">
          {title}
        </h1>
        <p className="mt-1 max-w-[52ch] text-[12px] leading-snug text-[var(--pos-text-2)]">
          {subtitle}
        </p>
      </div>
    </div>
  );
}

function Toolbar({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  showPlus = true,
}: {
  children: ReactNode;
  showPlus?: boolean;
}) {
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--pos-text-1)] px-3 py-2 text-[12px] font-medium text-[var(--pos-page)] transition-opacity hover:opacity-90`}
    >
      {showPlus ? <Plus className="size-3.5" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

function GhostButton({ children }: { children: ReactNode }) {
  return (
    <button
      type="button"
      className={`rounded-[8px] border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-3 py-2 text-[12px] font-medium text-[var(--pos-text-1)] transition-colors hover:bg-[var(--pos-sidebar)]`}
    >
      {children}
    </button>
  );
}

function StockOverview() {
  const lowCount = DEMO_STOCK_ROWS.filter((r) => r.status !== "ok").length;
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return DEMO_STOCK_ROWS;
    return DEMO_STOCK_ROWS.filter(
      (r) =>
        r.item.toLowerCase().includes(t) ||
        r.sku.toLowerCase().includes(t) ||
        r.location.toLowerCase().includes(t),
    );
  }, [q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Inventory Management"
        title="Stock overview"
        subtitle="On-hand quantities by location, par levels, and stock health. Connect your ledger when the API is wired."
        icon={Package}
      />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {[
          { label: "SKUs tracked", value: String(DEMO_STOCK_ROWS.length), sub: "Demo outlet" },
          { label: "Below par / OOS", value: String(lowCount), sub: "Needs attention" },
          { label: "Locations", value: "4", sub: "Cooler · dry · prep · bar" },
          { label: "Last full count", value: "Mar 28", sub: "Bar backstock closed" },
        ].map((k) => (
          <div
            key={k.label}
            className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}
          >
            <p className="text-[11px] text-[var(--pos-text-2)]">{k.label}</p>
            <p className="mt-2 font-mono text-[22px] font-medium leading-none tracking-[-0.03em] text-[var(--pos-text-1)]">
              {k.value}
            </p>
            <p className="mt-2 text-[11px] text-[var(--pos-text-2)]">{k.sub}</p>
          </div>
        ))}
      </div>

      <Toolbar className="justify-between gap-3">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-icon-muted)]"
            strokeWidth={2}
            aria-hidden
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search item, SKU, or location…"
            className="h-10 w-full rounded-[10px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] py-2 pl-10 pr-3 text-[13px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
            aria-label="Filter stock list"
          />
        </div>
        <Toolbar>
          <GhostButton>Export CSV</GhostButton>
          <PrimaryButton>New stock alert rule</PrimaryButton>
        </Toolbar>
      </Toolbar>

      <div className={`min-h-0 flex-1 overflow-hidden rounded-[14px] bg-[var(--pos-card)] ${border0}`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            On-hand by location
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-solid [border-color:var(--pos-border-hairline)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5">SKU</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5 text-right">On hand</th>
                <th className="px-4 py-2.5 text-right">Par</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3 font-medium text-[var(--pos-text-1)]">
                    {r.item}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-[var(--pos-text-2)]">
                    {r.sku}
                  </td>
                  <td className="px-4 py-3 text-[var(--pos-text-2)]">{r.location}</td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--pos-text-1)]">
                    {r.onHand} {r.unit}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--pos-text-2)]">
                    {r.par} {r.unit}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${STATUS_PILL[r.status]}`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StockAdjustments() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Inventory Management"
        title="Stock adjustments"
        subtitle="Post waste, spoilage, receiving corrections, and count variances. Draft lines below are illustrative until sync is enabled."
        icon={Factory}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Adjustment header
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--pos-text-2)]">
                Reference
              </span>
              <input
                readOnly
                value="ADJ-2026-04-001"
                className="mt-1 h-10 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 font-mono text-[12px] text-[var(--pos-text-1)]"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-[var(--pos-text-2)]">
                Effective date
              </span>
              <input
                readOnly
                value="Apr 1, 2026"
                className="mt-1 h-10 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)]"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-[11px] font-medium text-[var(--pos-text-2)]">
                Reason summary
              </span>
              <input
                placeholder="e.g. End-of-week receiving + count correction"
                className="mt-1 h-10 w-full rounded-[8px] border border-solid [border-color:var(--pos-input-border)] bg-[var(--pos-input-bg)] px-3 text-[12px] text-[var(--pos-text-1)] placeholder:text-[var(--pos-icon-muted)] focus:border-[var(--pos-text-1)] focus:outline-none"
              />
            </label>
          </div>
        </div>

        <div className={`rounded-[14px] bg-[var(--pos-card)] p-4 ${border0}`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Posting
          </p>
          <p className="mt-3 text-[12px] leading-snug text-[var(--pos-text-2)]">
            Adjustments update the stock ledger and optionally create audit entries for
            managers.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <PrimaryButton showPlus={false}>Post adjustment</PrimaryButton>
            <GhostButton>Save as draft</GhostButton>
          </div>
        </div>
      </div>

      <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Lines
          </p>
          <GhostButton>Add line</GhostButton>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-solid [border-color:var(--pos-border-hairline)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Item</th>
                <th className="px-4 py-2.5 text-right">Qty before</th>
                <th className="px-4 py-2.5 text-right">Δ</th>
                <th className="px-4 py-2.5 text-right">Qty after</th>
                <th className="px-4 py-2.5">Note</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_ADJUST_LINES.map((l) => (
                <tr
                  key={l.id}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)]"
                >
                  <td className="px-4 py-3 font-medium text-[var(--pos-text-1)]">
                    {l.item}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--pos-text-2)]">
                    {l.before}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--pos-text-1)]">
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[var(--pos-text-1)]">
                    {l.before + l.delta}
                  </td>
                  <td className="max-w-[240px] px-4 py-3 text-[11px] text-[var(--pos-text-2)]">
                    {l.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Transfers() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Inventory Management"
        title="Transfers between locations"
        subtitle="Move stock between stores, kitchens, and staging areas. Track in-transit batches and reconcile on receipt."
        icon={ArrowLeftRight}
      />

      <Toolbar className="justify-between">
        <p className="text-[12px] text-[var(--pos-text-2)]">
          Showing transfers for <span className="font-medium text-[var(--pos-text-1)]">Downtown · Floor service</span>
        </p>
        <PrimaryButton>New transfer</PrimaryButton>
      </Toolbar>

      <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} overflow-hidden`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Transfer batches
          </p>
        </div>
        <div className="divide-y divide-[var(--pos-border-hairline)]">
          {DEMO_TRANSFERS.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--pos-sidebar)]/60"
            >
              <div className="min-w-0">
                <p className="font-mono text-[13px] font-semibold text-[var(--pos-text-1)]">
                  {t.id}
                </p>
                <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
                  {t.from} → {t.to} · {t.lines} lines
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--pos-text-2)]">{t.created}</p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${TRANSFER_PILL[t.status]}`}
              >
                {t.status.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PhysicalCount() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-auto pr-1">
      <PageHeader
        section="Inventory Management"
        title="Physical / cycle count"
        subtitle="Start location-scoped counts, track progress, and resolve variances into adjustments."
        icon={ClipboardList}
      />

      <Toolbar className="justify-between">
        <GhostButton>Count templates</GhostButton>
        <PrimaryButton>Start new count</PrimaryButton>
      </Toolbar>

      <div className={`rounded-[14px] bg-[var(--pos-card)] ${border0} overflow-hidden`}>
        <div className="border-b border-solid [border-color:var(--pos-divider)] px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]">
            Sessions
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-solid [border-color:var(--pos-border-hairline)] text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--pos-text-2)]">
                <th className="px-4 py-2.5">Count ID</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Owner</th>
                <th className="px-4 py-2.5">Progress</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Started</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_COUNTS.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-solid [border-color:var(--pos-border-hairline)] transition-colors hover:bg-[var(--pos-sidebar)]/60"
                >
                  <td className="px-4 py-3 font-mono font-medium text-[var(--pos-text-1)]">
                    {c.id}
                  </td>
                  <td className="px-4 py-3 text-[var(--pos-text-1)]">{c.location}</td>
                  <td className="px-4 py-3 text-[var(--pos-text-2)]">{c.owner}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`h-2 flex-1 max-w-[120px] overflow-hidden rounded-full bg-[var(--pos-sidebar)] ${border0}`}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--pos-text-1)]/25"
                          style={{ width: `${c.progressPct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[11px] text-[var(--pos-text-2)]">
                        {c.progressPct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-semibold capitalize ${COUNT_PILL[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-[var(--pos-text-2)]">
                    {c.started}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function InventoryModuleView({ leafId }: { leafId: string }) {
  switch (leafId) {
    case "inv-overview":
      return <StockOverview />;
    case "inv-adjust":
      return <StockAdjustments />;
    case "inv-transfers":
      return <Transfers />;
    case "inv-count":
      return <PhysicalCount />;
    default:
      return <StockOverview />;
  }
}
