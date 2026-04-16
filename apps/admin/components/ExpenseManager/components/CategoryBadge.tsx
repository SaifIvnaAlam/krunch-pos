import { clsx } from 'clsx';
import type { ExpenseCategory } from '@/lib/expenseTypes';

const categoryStyle: Record<
  ExpenseCategory,
  string
> = {
  Food: 'bg-mint-bg text-mint-ink',
  Utilities: 'bg-sky-bg text-sky-ink',
  Rent: 'bg-peach-bg text-peach-ink',
  Staff: 'bg-lavender-bg text-lavender-ink',
  Maintenance: 'bg-sage-bg text-sage-ink',
  Other: 'bg-chip text-caption',
};

export function CategoryBadge({ category }: { category: ExpenseCategory }) {
  return (
    <span
      className={clsx(
        'inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold',
        categoryStyle[category],
      )}
    >
      {category}
    </span>
  );
}
