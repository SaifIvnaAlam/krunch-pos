import { Shell } from '../../../components/app/Shell';
import { Card, CardContent, CardHeader } from '../../../components/ui/card';
import {
  addDaysToDateKey,
  getClosingBalanceForDate,
  getDailyEntry,
} from '../../../lib/dailyEntryStore';
import { DailyEntryForm } from './DailyEntryForm';

function todayKeyUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function DailyEntryPage({
  searchParams,
}: {
  searchParams: { date?: string; saved?: string };
}) {
  const dateKey =
    typeof searchParams.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : todayKeyUtc();

  const prevKey = addDaysToDateKey(dateKey, -1);
  const [existing, prevClosing] = await Promise.all([
    getDailyEntry(dateKey),
    getClosingBalanceForDate(prevKey),
  ]);

  const suggestedOpening = prevClosing ?? 0;
  const initial = existing
    ? {
        openingBalance: existing.openingBalance,
        cashSale: existing.cashSale,
        bankSale: existing.bankSale,
        bkashSale: existing.bkashSale,
        pathaoSale: existing.pathaoSale,
        foodiSale: existing.foodiSale,
        foodpandaSale: existing.foodpandaSale,
      }
    : {
        openingBalance: suggestedOpening,
        cashSale: 0,
        bankSale: 0,
        bkashSale: 0,
        pathaoSale: 0,
        foodiSale: 0,
        foodpandaSale: 0,
      };

  const saved = searchParams.saved === '1';

  return (
    <main className="min-h-screen bg-page">
      <Shell title="Daily Entry Form">
        <Card className="rounded-bento">
          <CardHeader>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-label">
              Cash &amp; channels
            </p>
            <h2 className="mt-2 text-base font-semibold text-white">
              Record the day&apos;s opening position and sales
            </h2>
            <div className="mt-1 text-[12px] text-caption">
              Remaining balance carries forward as the next day&apos;s suggested
              opening balance.
            </div>
          </CardHeader>
          <CardContent>
            <DailyEntryForm
              dateKey={dateKey}
              prevDateKey={prevKey}
              carriedOpening={prevClosing}
              initial={initial}
              saved={saved}
            />
          </CardContent>
        </Card>
      </Shell>
    </main>
  );
}
