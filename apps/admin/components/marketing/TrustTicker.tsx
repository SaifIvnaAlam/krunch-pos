const items = [
  'Full-service',
  'Quick service',
  'Cafés',
  'Bars',
  'Multi-location groups',
  'Franchise operators',
  'Hotel F&B',
  'Ghost kitchens',
];

function TickerItems({ prefix }: { prefix: string }) {
  return (
    <>
      {items.map((t, i) => (
        <span
          key={`${prefix}-${i}`}
          className="flex shrink-0 items-center gap-8 text-[12px] text-muted"
        >
          <span>{t}</span>
          <span className="text-caption" aria-hidden>
            ●
          </span>
        </span>
      ))}
    </>
  );
}

export function TrustTicker() {
  return (
    <div className="overflow-hidden rounded-[10px] border border-0 bg-card">
      <div className="krunch-ticker-track flex gap-8 py-4 pl-6">
        <TickerItems prefix="a" />
        <TickerItems prefix="b" />
      </div>
    </div>
  );
}
