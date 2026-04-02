const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

const TABLES = [
  { id: "1", seats: 2, status: "free" as const },
  { id: "2", seats: 4, status: "seated" as const, guest: "Walk-in" },
  { id: "3", seats: 4, status: "order" as const, guest: "Party A" },
  { id: "4", seats: 2, status: "bill" as const, guest: "Couple" },
  { id: "5", seats: 6, status: "free" as const },
  { id: "6", seats: 4, status: "seated" as const, guest: "Family" },
  { id: "7", seats: 2, status: "order" as const, guest: "Bar" },
  { id: "8", seats: 8, status: "free" as const },
];

const statusStyle: Record<
  (typeof TABLES)[number]["status"],
  { label: string; className: string }
> = {
  free: {
    label: "Free",
    className:
      "bg-[#c8efd8] text-[#2e9b65] [border-color:#6bca9a]",
  },
  seated: {
    label: "Seated",
    className:
      "bg-[#c8def5] text-[#2f6dae] [border-color:#5b9bd6]",
  },
  order: {
    label: "Ordering",
    className:
      "bg-[#ffe4c0] text-[#e07030] [border-color:#f5a94a]",
  },
  bill: {
    label: "Check",
    className:
      "bg-[#ffd0cc] text-[#e8472a] [border-color:#e8472a]",
  },
};

export function FloorView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-1">
      <div>
        <p className="text-[10px] font-medium tracking-[0.06em] text-[var(--pos-text-2)]">
          Operations / Floor
        </p>
        <h1 className="mt-0.5 text-[19px] font-semibold tracking-[-0.01em] text-[var(--pos-text-1)]">
          Floor
        </h1>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3">
        {TABLES.map((t) => {
          const st = statusStyle[t.status];
          return (
            <button
              key={t.id}
              type="button"
              className={`rounded-[14px] bg-[var(--pos-card)] p-4 text-left transition-colors hover:[border-color:var(--pos-border-strong)] ${border0}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[18px] font-medium text-[var(--pos-text-1)]">
                  {t.id}
                </span>
                <span className="text-[11px] text-[var(--pos-text-2)]">
                  {t.seats} seats
                </span>
              </div>
              {"guest" in t && t.guest ? (
                <p className="mt-2 truncate text-[12px] text-[var(--pos-text-3)]">
                  {t.guest}
                </p>
              ) : (
                <p className="mt-2 text-[12px] text-[var(--pos-text-2)]">
                  Available
                </p>
              )}
              <span
                className={`mt-3 inline-flex items-center gap-2 rounded-full border border-solid px-[10px] py-[3px] text-[11px] font-medium ${st.className}`}
              >
                <span className="size-[5px] shrink-0 rounded-full bg-current" />
                {st.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
