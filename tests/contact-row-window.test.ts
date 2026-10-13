import { describe, expect, test } from 'bun:test';
import { contactRowWindow } from '../src/app/contact-row-window';

describe('contact row window', () => {
  test('keeps small and empty lists fully rendered even after a large-list scroll', () => {
    expect(contactRowWindow(3, 50000, 800, 90, 58)).toEqual({ start: 0, end: 3 });
    expect(contactRowWindow(0, 50000, 800, 90, 58)).toEqual({ start: 0, end: 0 });
  });

  test('covers the viewport and an overscan buffer at the top', () => {
    const range = contactRowWindow(1000, 0, 800, 90, 58);
    expect(range.start).toBe(0);
    expect(range.end * 58 + 90).toBeGreaterThan(800);
    expect(range.end).toBeLessThan(40);
  });

  test('accounts for preceding favourites and compact density in the middle', () => {
    const range = contactRowWindow(1000, 18000, 800, 4000, 40);
    expect(range.start * 40 + 4000).toBeLessThan(18000);
    expect(range.end * 40 + 4000).toBeGreaterThan(18800);
    expect(range.end - range.start).toBeLessThan(50);
  });

  test('keeps the final row and preserves the full scroll height at the bottom', () => {
    const range = contactRowWindow(1000, 59000, 800, 90, 58);
    expect(range.end).toBe(1000);
    expect(range.start).toBeLessThan(range.end);
    const top = range.start * 58;
    const visible = (range.end - range.start) * 58;
    const bottom = (1000 - range.end) * 58;
    expect(top + visible + bottom).toBe(58000);
  });
});
