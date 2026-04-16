'use client';

import { Pencil } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { saveDailyEntryAction } from './actions';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';

function parseMoneyInput(s: string): number {
  const n = Number(s.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

type Props = {
  dateKey: string;
  prevDateKey: string;
  carriedOpening: number | null;
  initial: {
    openingBalance: number;
    cashSale: number;
    bankSale: number;
    bkashSale: number;
    pathaoSale: number;
    foodiSale: number;
    foodpandaSale: number;
  };
  saved?: boolean;
};

export function DailyEntryForm({
  dateKey,
  prevDateKey,
  carriedOpening,
  initial,
  saved,
}: Props) {
  const [openingBalance, setOpeningBalance] = useState(
    String(initial.openingBalance),
  );
  const [openingEdit, setOpeningEdit] = useState(false);
  const openingInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpeningBalance(String(initial.openingBalance));
  }, [initial.openingBalance]);

  useEffect(() => {
    if (openingEdit) openingInputRef.current?.focus();
  }, [openingEdit]);

  const openingAmount = parseMoneyInput(openingBalance);
  const [cashSale, setCashSale] = useState(String(initial.cashSale));
  const [bankSale, setBankSale] = useState(String(initial.bankSale));
  const [bkashSale, setBkashSale] = useState(String(initial.bkashSale));
  const [pathaoSale, setPathaoSale] = useState(String(initial.pathaoSale));
  const [foodiSale, setFoodiSale] = useState(String(initial.foodiSale));
  const [foodpandaSale, setFoodpandaSale] = useState(
    String(initial.foodpandaSale),
  );

  const salesTotal = useMemo(() => {
    return (
      parseMoneyInput(cashSale) +
      parseMoneyInput(bankSale) +
      parseMoneyInput(bkashSale) +
      parseMoneyInput(pathaoSale) +
      parseMoneyInput(foodiSale) +
      parseMoneyInput(foodpandaSale)
    );
  }, [
    cashSale,
    bankSale,
    bkashSale,
    pathaoSale,
    foodiSale,
    foodpandaSale,
  ]);

  const remaining = useMemo(() => {
    return openingAmount + salesTotal;
  }, [openingAmount, salesTotal]);

  const statCard =
    'rounded-[14px] border border-0 bg-elevated p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]';
  const statTitle = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-label';
  const statValue =
    'font-sans text-[1.35rem] font-semibold leading-none tabular-nums text-white';
  const statHint = 'mt-2 text-[11px] leading-snug text-caption';
  const statAmountRow = 'mt-2 flex min-h-[2.25rem] items-center gap-2';
  const editOpeningBtn =
    'inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-caption transition-colors hover:bg-white/[0.06] hover:text-white';

  const fieldLabel = 'mb-1 text-[12px] text-label';

  return (
    <form action={saveDailyEntryAction} className="space-y-4">
      <input type="hidden" name="date" value={dateKey} />
      {saved ? (
        <div className="rounded-xl border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] px-4 py-3 text-[13px] text-[#86efac]">
          Saved. This day&apos;s remaining balance ({formatMoney(remaining)}) will
          suggest the opening balance for the next day.
        </div>
      ) : null}

      <div className="rounded-xl border border-0 bg-elevated px-3 py-2.5 text-[12px] leading-relaxed text-caption">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[11px] text-label opacity-80">
              Date
            </span>
            <Input
              className="h-8 w-[10.5rem] shrink-0 py-0 text-[12px]"
              type="date"
              title="Change date to load or start that day's entry"
              value={dateKey}
              onChange={(e) => {
                const next = e.target.value;
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) {
                  window.location.href = `/app/daily-entry?date=${encodeURIComponent(next)}`;
                }
              }}
            />
          </label>
          <span
            className="hidden h-3 w-px shrink-0 bg-[rgba(255,255,255,0.12)] sm:block"
            aria-hidden
          />
          <span className="min-w-0">
            <span className="text-label opacity-80">Prev day</span>{' '}
            <span className="font-mono text-[11px] text-white tabular-nums">
              {prevDateKey}
            </span>
            {' · '}
            closing{' '}
            <span className="font-mono text-white tabular-nums">
              {carriedOpening === null ? '—' : formatMoney(carriedOpening)}
            </span>
            <span className="text-caption"> — opening below follows this.</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={statCard}>
          <div className={statTitle}>Opening</div>
          <div className={statAmountRow}>
            {openingEdit ? (
              <Input
                ref={openingInputRef}
                className="h-10 flex-1 text-[1.35rem] font-semibold tabular-nums"
                inputMode="decimal"
                autoComplete="off"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                onBlur={() => setOpeningEdit(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setOpeningEdit(false);
                  }
                }}
                aria-label="Opening balance"
              />
            ) : (
              <>
                <div className={`${statValue} min-w-0 flex-1`}>
                  {formatMoney(openingAmount)}
                </div>
                <button
                  type="button"
                  className={editOpeningBtn}
                  aria-label="Edit opening balance"
                  onClick={() => setOpeningEdit(true)}
                >
                  <Pencil className="size-4" strokeWidth={2} />
                </button>
              </>
            )}
          </div>
          <p className={statHint}>
            Carried from previous day&apos;s closing — use the pencil to adjust
          </p>
        </div>
        <div className={statCard}>
          <div className={statTitle}>Sales</div>
          <div className={statValue}>{formatMoney(salesTotal)}</div>
          <p className={statHint}>Total across cash, bank, and delivery channels</p>
        </div>
        <div className={statCard}>
          <div className={statTitle}>Remaining</div>
          <div className={statValue}>{formatMoney(remaining)}</div>
          <p className={statHint}>Opening + sales — saved as today&apos;s closing</p>
        </div>
      </div>
      <input
        type="hidden"
        name="openingBalance"
        value={openingBalance.replace(/,/g, '').trim()}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className={fieldLabel}>Cash sale</div>
          <Input
            name="cashSale"
            inputMode="decimal"
            value={cashSale}
            onChange={(e) => setCashSale(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div className={fieldLabel}>Bank sale</div>
          <Input
            name="bankSale"
            inputMode="decimal"
            value={bankSale}
            onChange={(e) => setBankSale(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div className={fieldLabel}>bKash sale</div>
          <Input
            name="bkashSale"
            inputMode="decimal"
            value={bkashSale}
            onChange={(e) => setBkashSale(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div className={fieldLabel}>Pathao sale</div>
          <Input
            name="pathaoSale"
            inputMode="decimal"
            value={pathaoSale}
            onChange={(e) => setPathaoSale(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div className={fieldLabel}>Foodi sale</div>
          <Input
            name="foodiSale"
            inputMode="decimal"
            value={foodiSale}
            onChange={(e) => setFoodiSale(e.target.value)}
            placeholder="0"
          />
        </div>
        <div>
          <div className={fieldLabel}>Foodpanda sale</div>
          <Input
            name="foodpandaSale"
            inputMode="decimal"
            value={foodpandaSale}
            onChange={(e) => setFoodpandaSale(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <Button type="submit">Save daily entry</Button>
    </form>
  );
}
