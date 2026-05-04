import { getSelectedCount, isSelected, BulkSelection } from './lead.model';

describe('getSelectedCount', () => {
  it('include mode: returns ids set size', () => {
    const sel: BulkSelection = { mode: 'include', ids: new Set(['a', 'b']), totalCount: 10 };
    expect(getSelectedCount(sel)).toBe(2);
  });

  it('exclude mode: returns totalCount minus excluded', () => {
    const sel: BulkSelection = { mode: 'exclude', ids: new Set(['a', 'b']), totalCount: 10 };
    expect(getSelectedCount(sel)).toBe(8);
  });

  it('include mode with empty set: returns 0', () => {
    const sel: BulkSelection = { mode: 'include', ids: new Set(), totalCount: 10 };
    expect(getSelectedCount(sel)).toBe(0);
  });

  it('exclude mode with empty set: returns totalCount', () => {
    const sel: BulkSelection = { mode: 'exclude', ids: new Set(), totalCount: 5 };
    expect(getSelectedCount(sel)).toBe(5);
  });
});

describe('isSelected', () => {
  it('include mode: returns true when id in set', () => {
    const sel: BulkSelection = { mode: 'include', ids: new Set(['a', 'b']), totalCount: 10 };
    expect(isSelected(sel, 'a')).toBe(true);
  });

  it('include mode: returns false when id not in set', () => {
    const sel: BulkSelection = { mode: 'include', ids: new Set(['a']), totalCount: 10 };
    expect(isSelected(sel, 'z')).toBe(false);
  });

  it('exclude mode: returns true when id NOT excluded', () => {
    const sel: BulkSelection = { mode: 'exclude', ids: new Set(['excluded']), totalCount: 10 };
    expect(isSelected(sel, 'other')).toBe(true);
  });

  it('exclude mode: returns false when id is excluded', () => {
    const sel: BulkSelection = { mode: 'exclude', ids: new Set(['excluded']), totalCount: 10 };
    expect(isSelected(sel, 'excluded')).toBe(false);
  });
});
