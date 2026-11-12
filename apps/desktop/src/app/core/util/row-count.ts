export const DEFAULT_MOCK_ROWS = 1200;
export const MAX_MOCK_ROWS = 200_000;

/**
 * Reads the `?rows=N` query parameter that sizes the mock lead list, so the grid benchmark can
 * load 50,000 rows without a backend. Anything invalid falls back to the default, and the value
 * is capped so a typo cannot freeze the tab.
 */
export function parseRowCount(
  search: string | undefined,
  fallback: number = DEFAULT_MOCK_ROWS,
  max: number = MAX_MOCK_ROWS,
): number {
  if (!search) return fallback;
  const raw = new URLSearchParams(search).get('rows');
  if (raw === null || !/^\d+$/.test(raw)) return fallback;
  const n = Number(raw);
  if (n < 1) return fallback;
  return Math.min(n, max);
}
