import { describe, expect, it } from 'bun:test';
import { computeJsonDiff, computeLineDiff, buildSplitRows } from '../src/lib/json-diff';

describe('json-diff', () => {
  it('handles empty inputs', () => {
    const diff = computeLineDiff([], []);
    expect(diff).toEqual([]);

    const jsonDiff = computeJsonDiff(null, null);
    expect(jsonDiff.lines).toEqual([]);
    expect(jsonDiff.stats.additions).toBe(0);
    expect(jsonDiff.stats.deletions).toBe(0);
  });

  it('detects pure addition', () => {
    const jsonDiff = computeJsonDiff(null, { name: 'Alice' });
    expect(jsonDiff.stats.additions).toBeGreaterThan(0);
    expect(jsonDiff.stats.deletions).toBe(0);
    expect(jsonDiff.lines.every((l) => l.type === 'add')).toBe(true);
  });

  it('detects pure deletion', () => {
    const jsonDiff = computeJsonDiff({ name: 'Bob' }, null);
    expect(jsonDiff.stats.deletions).toBeGreaterThan(0);
    expect(jsonDiff.stats.additions).toBe(0);
    expect(jsonDiff.lines.every((l) => l.type === 'del')).toBe(true);
  });

  it('highlights modifications with green additions and red deletions', () => {
    const before = {
      name: 'Charlie',
      phone: '+1234567890',
      status: 'active',
    };
    const after = {
      name: 'Charlie',
      phone: '+1987654321',
      status: 'active',
    };

    const result = computeJsonDiff(before, after);
    expect(result.stats.additions).toBe(1);
    expect(result.stats.deletions).toBe(1);

    const delLine = result.lines.find((l) => l.type === 'del');
    expect(delLine).toBeDefined();
    expect(delLine?.text).toContain('+1234567890');

    const addLine = result.lines.find((l) => l.type === 'add');
    expect(addLine).toBeDefined();
    expect(addLine?.text).toContain('+1987654321');
  });

  it('builds split rows aligned side-by-side', () => {
    const before = { val: 'old' };
    const after = { val: 'new' };
    const result = computeJsonDiff(before, after);

    expect(result.splitRows.length).toBeGreaterThan(0);
    const modRow = result.splitRows.find((r) => r.left.type === 'del' && r.right.type === 'add');
    expect(modRow).toBeDefined();
    expect(modRow?.left.text).toContain('old');
    expect(modRow?.right.text).toContain('new');
  });
});
