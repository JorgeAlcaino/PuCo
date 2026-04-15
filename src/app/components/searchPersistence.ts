const SNAPSHOT_TTL_MS = 72 * 60 * 60 * 1000;

export interface SearchSnapshot<TFilters, TItem> {
  timestamp: number;
  filters: TFilters;
  listado: TItem[];
  total: number;
  warning?: string;
}

export function saveSearchSnapshot<TFilters, TItem>(
  storageKey: string,
  snapshot: SearchSnapshot<TFilters, TItem>,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    // Ignore storage quota and privacy mode errors.
  }
}

export function loadSearchSnapshot<TFilters, TItem>(
  storageKey: string,
): SearchSnapshot<TFilters, TItem> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SearchSnapshot<TFilters, TItem>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.listado)) return null;
    if (typeof parsed.timestamp !== 'number') return null;

    if (Date.now() - parsed.timestamp > SNAPSHOT_TTL_MS) {
      localStorage.removeItem(storageKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
