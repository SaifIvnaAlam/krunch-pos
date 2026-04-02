import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { CatalogItem, MenuAddon } from "../../data/demoMenuCatalog";
import {
  computeLineUnitPrice,
  defaultOrderLineConfig,
  type OrderLineConfig,
} from "../../data/demoMenuCatalog";

const border0 =
  "border-[0.5px] border-solid [border-color:var(--pos-border-hairline)]";

/** @deprecated Use OrderLineConfig from demoMenuCatalog */
export type LineConfig = OrderLineConfig;

function formatMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function summarizeVariants(item: CatalogItem, cfg: OrderLineConfig): string {
  const parts: string[] = [];
  for (const g of item.variantGroups) {
    const cid = cfg.variantChoiceIds[g.id];
    const ch = g.choices.find((c) => c.id === cid);
    if (ch) parts.push(ch.name);
  }
  return parts.join(" · ");
}

function SubOptionRow({
  addon,
  selected,
  onToggle,
  accent,
  dense,
}: {
  addon: MenuAddon;
  selected: boolean;
  onToggle: () => void;
  accent: "success" | "info";
  dense?: boolean;
}) {
  const stripe =
    accent === "success"
      ? "border-l-[4px] border-solid border-[#6bca9a]"
      : "border-l-[4px] border-solid border-[#5b9bd6]";
  const idleBg =
    accent === "success"
      ? "bg-[#c8efd8]/30 dark:bg-[#2e9b65]/12"
      : "bg-[#c8def5]/35 dark:bg-[#2f6dae]/15";

  const py = dense ? "py-2" : "py-3";
  const textSz = dense ? "text-[12px]" : "text-[13px]";

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative ml-3 flex w-[calc(100%-12px)] items-center gap-2 rounded-[10px] border border-solid px-3 ${py} text-left transition-colors ${stripe} ${
        selected
          ? "[border-color:var(--pos-text-1)] [border-width:1.5px] [border-left-width:4px] bg-[var(--pos-sidebar)]"
          : `[border-color:var(--pos-border-medium)] ${idleBg} hover:[border-color:var(--pos-border-strong)]`
      }`}
    >
      <span
        className="pointer-events-none absolute -left-3 top-1/2 h-px w-3 -translate-y-1/2 bg-[var(--pos-divider)]"
        aria-hidden
      />
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-solid ${
          selected
            ? "border-[var(--pos-text-1)] bg-[var(--pos-text-1)]"
            : "border-[var(--pos-input-border)] bg-[var(--pos-card)]"
        }`}
        aria-hidden
      >
        {selected ? (
          <Check
            className="size-3 text-white dark:text-[#141413]"
            strokeWidth={2}
          />
        ) : null}
      </span>
      <span className={`min-w-0 flex-1 ${textSz} text-[var(--pos-text-1)]`}>
        {addon.name}
      </span>
      <span className="shrink-0 font-mono text-[11px] text-[var(--pos-text-2)]">
        {addon.priceCents > 0 ? `+৳${formatMoney(addon.priceCents)}` : "Free"}
      </span>
    </button>
  );
}

export function ItemOptionsBody({
  item,
  value,
  onChange,
  dense,
}: {
  item: CatalogItem;
  value: OrderLineConfig;
  onChange: (next: OrderLineConfig) => void;
  dense?: boolean;
}) {
  const looseAddons = useMemo(
    () => item.addons.filter((a) => !a.parentGroupId),
    [item],
  );

  const toggleAddon = (id: string) => {
    const on = value.addonIds.includes(id);
    onChange({
      ...value,
      addonIds: on
        ? value.addonIds.filter((x) => x !== id)
        : [...value.addonIds, id],
    });
  };

  const setVariant = (groupId: string, choiceId: string) => {
    onChange({
      ...value,
      variantChoiceIds: { ...value.variantChoiceIds, [groupId]: choiceId },
    });
  };

  const gapMain = dense ? "gap-5" : "gap-8";
  const stepLabel = dense ? "text-[9px]" : "text-[10px]";
  const h3 = dense
    ? "text-[14px] font-medium tracking-[-0.01em]"
    : "text-[18px] font-medium tracking-[-0.01em]";
  const h4 = dense ? "text-[13px] font-medium" : "text-[15px] font-medium";
  const groupPad = dense ? "p-3" : "p-4";
  const choicePad = dense ? "px-3 py-3" : "px-4 py-4";
  const choiceText = dense ? "text-[12px]" : "text-[13px]";

  const hasConfigurable =
    item.variantGroups.length > 0 || looseAddons.length > 0;

  if (!hasConfigurable) {
    return (
      <p className="text-[12px] text-[var(--pos-text-2)]">
        No options for this item.
      </p>
    );
  }

  return (
    <div className={`flex flex-col ${gapMain}`}>
      {item.variantGroups.length > 0 ? (
        <section
          className={dense ? "border-l-2 border-solid border-[var(--pos-text-1)] pl-3" : "border-l-4 border-solid border-[var(--pos-text-1)] pl-4"}
          aria-labelledby={dense ? undefined : "options-heading"}
        >
          <p className={`${stepLabel} font-semibold uppercase tracking-[0.1em] text-[var(--pos-text-2)]`}>
            {dense ? "Options" : "Step 1 · options"}
          </p>
          {!dense ? (
            <>
              <h3
                id="options-heading"
                className={`mt-2 ${h3} text-[var(--pos-text-1)]`}
              >
                Choose each option
              </h3>
              <p className="mt-1 text-[13px] text-[var(--pos-text-2)]">
                One selection per group. Sub-options under a group only apply
                with that group.
              </p>
            </>
          ) : null}

          <div className={`${dense ? "mt-3" : "mt-6"} flex flex-col gap-4`}>
            {item.variantGroups.map((g, idx) => {
              const tiedAddons = item.addons.filter(
                (a) => a.parentGroupId === g.id,
              );
              const selectedChoice = g.choices.find(
                (c) => c.id === value.variantChoiceIds[g.id],
              );
              return (
                <div key={g.id} className="flex flex-col gap-2">
                  <div
                    className={`rounded-[12px] bg-[var(--pos-sidebar)] ${groupPad} ${border0}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-[var(--pos-text-1)] font-mono text-[11px] font-medium text-[var(--pos-primary-fg)] dark:bg-[var(--pos-nav-active-bg)] dark:text-[var(--pos-nav-active-fg)]">
                          {idx + 1}
                        </span>
                        <h4 className={`${h4} text-[var(--pos-text-1)]`}>
                          {g.name}
                        </h4>
                      </div>
                      <span className="shrink-0 rounded-full border border-solid [border-color:var(--pos-border-medium)] bg-[var(--pos-card)] px-2 py-0.5 text-[10px] text-[var(--pos-text-2)]">
                        {g.required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-1.5">
                      {g.choices.map((ch) => {
                        const sel = value.variantChoiceIds[g.id] === ch.id;
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setVariant(g.id, ch.id)}
                            className={`flex w-full items-center gap-2 rounded-[10px] border border-solid bg-[var(--pos-card)] ${choicePad} text-left ${choiceText} transition-colors ${
                              sel
                                ? "[border-color:var(--pos-text-1)] [border-width:1.5px]"
                                : "[border-color:var(--pos-border-medium)] hover:[border-color:var(--pos-border-strong)]"
                            }`}
                          >
                            <span
                              className={`flex size-4 shrink-0 items-center justify-center rounded-full border-2 border-solid ${
                                sel
                                  ? "border-[var(--pos-text-1)]"
                                  : "border-[var(--pos-input-border)]"
                              }`}
                              aria-hidden
                            >
                              {sel ? (
                                <span className="size-1.5 rounded-full bg-[var(--pos-text-1)]" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1 text-[var(--pos-text-1)]">
                              {ch.name}
                            </span>
                            {ch.priceDeltaCents !== 0 ? (
                              <span className="shrink-0 font-mono text-[11px] text-[var(--pos-text-2)]">
                                {ch.priceDeltaCents > 0 ? "+৳" : "৳"}
                                {formatMoney(Math.abs(ch.priceDeltaCents))}
                              </span>
                            ) : (
                              <span className="shrink-0 text-[10px] text-[var(--pos-text-2)]">
                                Incl.
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {tiedAddons.length > 0 ? (
                    <div
                      className="ml-1 border-l-2 border-dashed border-[#6bca9a] pl-3"
                      role="group"
                      aria-label={`Sub-options for ${g.name}`}
                    >
                      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#1a5c40]">
                        With {g.name}: {selectedChoice?.name ?? "—"}
                      </p>
                      {!dense ? (
                        <p className="mt-1 text-[11px] text-[var(--pos-text-2)]">
                          Extras linked to this option only.
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-col gap-1.5">
                        {tiedAddons.map((a) => (
                          <SubOptionRow
                            key={a.id}
                            addon={a}
                            selected={value.addonIds.includes(a.id)}
                            onToggle={() => toggleAddon(a.id)}
                            accent="success"
                            dense={dense}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {looseAddons.length > 0 ? (
        <section
          className={`border-t border-solid [border-color:var(--pos-divider)] ${dense ? "pt-4" : "pt-8"}`}
          aria-labelledby={dense ? undefined : "suboptions-loose-heading"}
        >
          <div className={dense ? "border-l-2 border-solid border-[#5b9bd6] pl-3" : "border-l-4 border-solid border-[#5b9bd6] pl-4"}>
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#2f6dae]">
              {item.variantGroups.length > 0 ? "Whole item" : "Add-ons"}
            </p>
            {!dense ? (
              <h3
                id="suboptions-loose-heading"
                className="mt-2 text-[15px] font-medium text-[var(--pos-text-1)]"
              >
                Add-ons for this item
              </h3>
            ) : null}
            <p className="mt-1 text-[10px] text-[var(--pos-text-2)]">
              {item.variantGroups.length > 0
                ? "Applies to the full line."
                : "Optional extras."}
            </p>
            <div className="mt-3 flex flex-col gap-1.5">
              {looseAddons.map((a) => (
                <SubOptionRow
                  key={a.id}
                  addon={a}
                  selected={value.addonIds.includes(a.id)}
                  onToggle={() => toggleAddon(a.id)}
                  accent="info"
                  dense={dense}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function ItemOptionsModal({
  item,
  open,
  onClose,
  onConfirm,
}: {
  item: CatalogItem | null;
  open: boolean;
  onClose: () => void;
  onConfirm: (cfg: OrderLineConfig, unitPriceCents: number, summary: string) => void;
}) {
  const [cfg, setCfg] = useState<OrderLineConfig | null>(null);

  useEffect(() => {
    if (item) setCfg(defaultOrderLineConfig(item));
  }, [item]);

  const unitPrice = useMemo(() => {
    if (!item || !cfg) return 0;
    return computeLineUnitPrice(item, cfg);
  }, [item, cfg]);

  if (!open || !item || !cfg) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-options-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`max-h-[min(88vh,680px)] w-full max-w-[420px] overflow-y-auto rounded-[20px] bg-[var(--pos-card)] p-6 ${border0} [border-width:1.5px] [border-color:var(--pos-border-strong)]`}
      >
        <h2
          id="item-options-title"
          className="text-[18px] font-medium tracking-[-0.01em] text-[var(--pos-text-1)]"
        >
          {item.name}
        </h2>
        <p className="mt-1 font-mono text-[13px] text-[var(--pos-text-2)]">
          Base ৳{formatMoney(item.priceCents)}
        </p>

        <div className="mt-6">
          <ItemOptionsBody item={item} value={cfg} onChange={setCfg} />
        </div>

        <div className="mt-8 flex flex-col gap-2 border-t border-solid [border-color:var(--pos-divider)] pt-6">
          <div className="flex items-center justify-between text-[14px] font-medium text-[var(--pos-text-1)]">
            <span>Line price</span>
            <span className="font-mono">৳{formatMoney(unitPrice)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-solid [border-color:var(--pos-input-border)] bg-transparent text-[13px] font-medium text-[var(--pos-text-1)] transition-colors hover:[border-color:var(--pos-border-strong)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const summary = summarizeVariants(item, cfg);
                onConfirm(cfg, unitPrice, summary);
                onClose();
              }}
              className="flex h-10 flex-1 items-center justify-center rounded-[10px] bg-[var(--pos-primary-bg)] text-[13px] font-medium text-[var(--pos-primary-fg)] transition-colors hover:bg-[var(--pos-primary-hover)]"
            >
              Add to order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
