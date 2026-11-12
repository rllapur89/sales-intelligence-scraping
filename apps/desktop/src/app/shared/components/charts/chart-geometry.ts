/** Pure geometry shared by the hand-written SVG/CSS charts. No DOM, no Angular. */

export interface ChartDatum {
  label: string;
  value: number;
  /** Extra text shown next to the value (e.g. "avg score 71.5"). */
  detail?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Rounds `max` up to 1, 2, 5 or 10 times a power of ten so axis ticks look clean. 1 for <= 0. */
export function niceCeil(max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const normalized = max / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** `value` scaled into `[0, size]` for a `[0, max]` domain; 0 when the domain is empty. */
export function scale(value: number, max: number, size: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.min(size, Math.max(0, (value / max) * size));
}

/** Width in percent of each horizontal bar. Non-zero values keep a visible minimum of 2%. */
export function barPercents(values: readonly number[], max?: number): number[] {
  const top = max ?? Math.max(0, ...values);
  return values.map((value) => {
    const percent = scale(value, top, 100);
    return value > 0 ? Math.max(2, percent) : 0;
  });
}

/** Vertical bars filling `width` x `height`, `gap` units apart; a bar of 0 has height 0. */
export function barRects(
  values: readonly number[],
  width: number,
  height: number,
  gap: number,
  max?: number,
): Rect[] {
  if (values.length === 0) return [];
  const top = max ?? niceCeil(Math.max(0, ...values));
  const barWidth = Math.max(0, (width - gap * (values.length - 1)) / values.length);
  return values.map((value, index) => {
    const barHeight = scale(value, top, height);
    return {
      x: round(index * (barWidth + gap)),
      y: round(height - barHeight),
      width: round(barWidth),
      height: round(barHeight),
    };
  });
}

/** Points of a line over `width` x `height`; a single value sits in the middle. */
export function linePoints(
  values: readonly number[],
  width: number,
  height: number,
  max?: number,
): Point[] {
  const top = max ?? niceCeil(Math.max(0, ...values));
  return values.map((value, index) => ({
    x: round(values.length === 1 ? width / 2 : (index / (values.length - 1)) * width),
    y: round(height - scale(value, top, height)),
  }));
}

export function toLinePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

/** Closed path under the line down to the baseline `height`. Empty for no points. */
export function toAreaPath(points: readonly Point[], height: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${toLinePath(points)} L ${last.x} ${height} L ${first.x} ${height} Z`;
}

/** Evenly spaced axis ticks from 0 to `max` (inclusive), `count` intervals. */
export function ticks(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, i) => round((max / count) * i));
}

/** Indexes of at most `limit` labels, spread evenly and always including first and last. */
export function labelIndexes(length: number, limit: number): number[] {
  if (length <= 0 || limit <= 0) return [];
  if (length <= limit) return Array.from({ length }, (_, i) => i);
  if (limit === 1) return [0];
  const out = new Set<number>();
  for (let i = 0; i < limit; i++) out.add(Math.round((i * (length - 1)) / (limit - 1)));
  return [...out];
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
