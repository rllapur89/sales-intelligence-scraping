import {
  barPercents,
  barRects,
  labelIndexes,
  linePoints,
  niceCeil,
  scale,
  ticks,
  toAreaPath,
  toLinePath,
} from './chart-geometry';

describe('chart geometry', () => {
  it('niceCeil rounds up to 1, 2, 5, 10 times a power of ten', () => {
    expect([0, -4, NaN].map(niceCeil)).toEqual([1, 1, 1]);
    expect([1, 1.2, 2, 3, 5, 6, 10, 73, 101].map(niceCeil)).toEqual([
      1, 2, 2, 5, 5, 10, 10, 100, 200,
    ]);
  });

  it('scale clamps into the range and survives an empty domain', () => {
    expect(scale(5, 10, 100)).toBe(50);
    expect(scale(50, 10, 100)).toBe(100);
    expect(scale(-5, 10, 100)).toBe(0);
    expect(scale(5, 0, 100)).toBe(0);
    expect(scale(NaN, 10, 100)).toBe(0);
  });

  it('barPercents scales to the max, keeps a visible minimum and leaves zero at zero', () => {
    expect(barPercents([10, 5, 0])).toEqual([100, 50, 0]);
    expect(barPercents([1000, 1])).toEqual([100, 2]);
    expect(barPercents([0, 0])).toEqual([0, 0]);
    expect(barPercents([5], 10)).toEqual([50]);
    expect(barPercents([])).toEqual([]);
  });

  it('barRects lays bars out left to right from the baseline', () => {
    const rects = barRects([5, 10, 0], 100, 50, 5, 10);
    expect(rects).toEqual([
      { x: 0, y: 25, width: 30, height: 25 },
      { x: 35, y: 0, width: 30, height: 50 },
      { x: 70, y: 50, width: 30, height: 0 },
    ]);
    expect(barRects([], 100, 50, 5)).toEqual([]);
  });

  it('barRects derives a nice maximum when none is given', () => {
    expect(barRects([3], 10, 100, 0)[0].height).toBe(60);
  });

  it('linePoints spans the width, a single point is centred, zero is the baseline', () => {
    expect(linePoints([0, 10], 100, 50, 10)).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 0 },
    ]);
    expect(linePoints([4], 100, 50, 8)).toEqual([{ x: 50, y: 25 }]);
    expect(linePoints([], 100, 50)).toEqual([]);
    expect(linePoints([0, 0], 100, 50).map((p) => p.y)).toEqual([50, 50]);
  });

  it('builds line and area paths', () => {
    const pts = [
      { x: 0, y: 50 },
      { x: 100, y: 0 },
    ];
    expect(toLinePath(pts)).toBe('M 0 50 L 100 0');
    expect(toAreaPath(pts, 50)).toBe('M 0 50 L 100 0 L 100 50 L 0 50 Z');
    expect(toLinePath([])).toBe('');
    expect(toAreaPath([], 50)).toBe('');
  });

  it('ticks run from 0 to the max', () => {
    expect(ticks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(ticks(10, 2)).toEqual([0, 5, 10]);
  });

  it('labelIndexes keeps everything when it fits and spreads evenly otherwise', () => {
    expect(labelIndexes(3, 5)).toEqual([0, 1, 2]);
    expect(labelIndexes(30, 5)).toEqual([0, 7, 15, 22, 29]);
    expect(labelIndexes(30, 1)).toEqual([0]);
    expect(labelIndexes(0, 5)).toEqual([]);
    expect(labelIndexes(5, 0)).toEqual([]);
  });
});
