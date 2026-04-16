'use server';

import { redirect } from 'next/navigation';
import { saveDailyEntry } from '../../../lib/dailyEntryStore';

function parseMoney(raw: FormDataEntryValue | null): number {
  const s = String(raw ?? '')
    .replace(/,/g, '')
    .trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export async function saveDailyEntryAction(formData: FormData) {
  const date = String(formData.get('date') || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

  await saveDailyEntry({
    date,
    openingBalance: parseMoney(formData.get('openingBalance')),
    cashSale: parseMoney(formData.get('cashSale')),
    bankSale: parseMoney(formData.get('bankSale')),
    bkashSale: parseMoney(formData.get('bkashSale')),
    pathaoSale: parseMoney(formData.get('pathaoSale')),
    foodiSale: parseMoney(formData.get('foodiSale')),
    foodpandaSale: parseMoney(formData.get('foodpandaSale')),
  });

  redirect(`/app/daily-entry?date=${encodeURIComponent(date)}&saved=1`);
}
