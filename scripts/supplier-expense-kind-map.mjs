/**
 * Legacy cashbooks that are NOT kitchen/item vendors.
 * Keep in sync with apps/api/src/modules/expenses/expense.util.ts
 */
export const OTHER_EXPENSE_SUPPLIER_NAMES = [
  'Boosting',
  'Maintainence',
  'Rent',
  'Staff Snacks',
  'Gas',
  'ALL Vlogger',
  'Ahmudul Haque Anik',
  'Shohel',
  'Hardware and Accessories',
  'WASA - Water Bill',
  'Vat Tax',
];

const OTHER = new Set(OTHER_EXPENSE_SUPPLIER_NAMES.map((n) => n.toLowerCase()));

export function expenseKindForSupplierName(name) {
  if (name && OTHER.has(String(name).trim().toLowerCase())) return 'other_expense';
  return 'item_purchase';
}
