const STORAGE_KEY = "universal_pos_pending_menu_categories";

export function readPendingMenuCategories(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  } catch {
    return [];
  }
}

export function writePendingMenuCategories(names: string[]): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(names));
}

export function addPendingMenuCategory(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = readPendingMenuCategories();
  const lower = trimmed.toLowerCase();
  if (existing.some((n) => n.toLowerCase() === lower)) return;
  writePendingMenuCategories([...existing, trimmed]);
}

export function removePendingMenuCategory(name: string): void {
  const lower = name.trim().toLowerCase();
  writePendingMenuCategories(
    readPendingMenuCategories().filter((n) => n.toLowerCase() !== lower),
  );
}
