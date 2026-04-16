const bdt = new Intl.NumberFormat('en-BD', {
  style: 'currency',
  currency: 'BDT',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Bangladeshi Taka using ৳ symbol via locale when available. */
export function formatBDT(amount: number): string {
  return bdt.format(amount).replace('BDT', '৳').replace(/\s+/g, ' ');
}

export function formatExpenseDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(dt);
}

export type CsvColumnKey =
  | 'date'
  | 'description'
  | 'category'
  | 'quantity'
  | 'unitPrice'
  | 'totalAmount'
  | 'paymentMethod';

const CSV_HEADERS: Record<CsvColumnKey, string> = {
  date: 'Date',
  description: 'Description',
  category: 'Category',
  quantity: 'Quantity',
  unitPrice: 'Unit price (৳)',
  totalAmount: 'Total (৳)',
  paymentMethod: 'Payment method',
};

export function buildExpensesCsv<T extends Record<CsvColumnKey, string>>(
  rows: T[],
  columns: CsvColumnKey[],
): string {
  const header = columns.map((c) => CSV_HEADERS[c]).join(',');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const cell = row[c] ?? '';
        const safe = String(cell).replace(/"/g, '""');
        return safe.includes(',') || safe.includes('"') || safe.includes('\n')
          ? `"${safe}"`
          : safe;
      })
      .join(','),
  );
  return [header, ...lines].join('\n');
}
