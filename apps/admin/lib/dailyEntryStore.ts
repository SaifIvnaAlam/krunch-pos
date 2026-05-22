import { promises as fs } from 'fs';
import path from 'path';

export type DailyEntryRecord = {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
  remainingBalance: number;
  updatedAt: string;
};

type DailyEntryFileShape = {
  entries: Record<string, DailyEntryRecord>;
};

const dataDir = path.join(process.cwd(), '.data');
const dataFile = path.join(dataDir, 'daily-entries.json');

async function ensureFile(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    const initial: DailyEntryFileShape = { entries: {} };
    await fs.writeFile(dataFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function readFile(): Promise<DailyEntryFileShape> {
  await ensureFile();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw) as DailyEntryFileShape;
}

async function writeFile(data: DailyEntryFileShape): Promise<void> {
  await ensureFile();
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const parts = dateKey.split('-').map((x) => parseInt(x, 10));
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function computeRemainingBalance(entry: {
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
}): number {
  return (
    entry.openingBalance +
    entry.cashSale +
    entry.bankSale +
    entry.bkashSale +
    entry.pathaoSale +
    entry.foodiSale +
    entry.foodpandaSale
  );
}

export async function getDailyEntry(dateKey: string): Promise<DailyEntryRecord | null> {
  const file = await readFile();
  return file.entries[dateKey] ?? null;
}

/** Closing (remaining) balance for that calendar day, if an entry exists. */
export async function getClosingBalanceForDate(dateKey: string): Promise<number | null> {
  const row = await getDailyEntry(dateKey);
  return row ? row.remainingBalance : null;
}

export async function saveDailyEntry(input: {
  date: string;
  openingBalance: number;
  cashSale: number;
  bankSale: number;
  bkashSale: number;
  pathaoSale: number;
  foodiSale: number;
  foodpandaSale: number;
}): Promise<DailyEntryRecord> {
  const remainingBalance = computeRemainingBalance(input);
  const record: DailyEntryRecord = {
    ...input,
    remainingBalance,
    updatedAt: new Date().toISOString(),
  };
  const file = await readFile();
  file.entries[record.date] = record;
  await writeFile(file);
  return record;
}
