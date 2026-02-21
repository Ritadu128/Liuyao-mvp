import { describe, expect, it } from 'vitest';
import {
  throwOnce,
  throwAllSix,
  computeHexagram,
  getLineDisplay,
  serializeLines,
  deserializeLines,
  rebuildHexagram,
} from '../client/src/lib/liuyao';
import type { LineValue } from '../client/src/lib/liuyao';

describe('throwOnce', () => {
  it('should return a valid LineValue (6,7,8,9)', () => {
    for (let i = 0; i < 100; i++) {
      const result = throwOnce();
      expect([6, 7, 8, 9]).toContain(result.sum);
    }
  });

  it('should have 3 coins each 0 or 1', () => {
    const result = throwOnce();
    expect(result.coins).toHaveLength(3);
    result.coins.forEach(c => expect([0, 1]).toContain(c));
  });

  it('sum should equal coin values (3 for heads, 2 for tails)', () => {
    for (let i = 0; i < 50; i++) {
      const result = throwOnce();
      const expected = result.coins.reduce((acc, c) => acc + (c === 1 ? 3 : 2), 0);
      expect(result.sum).toBe(expected);
    }
  });

  it('6 and 9 should be moving lines', () => {
    // Manually test with known values
    const moving6: LineValue = 6;
    const moving9: LineValue = 9;
    const static7: LineValue = 7;
    const static8: LineValue = 8;
    expect(getLineDisplay(moving6).isMoving).toBe(true);
    expect(getLineDisplay(moving9).isMoving).toBe(true);
    expect(getLineDisplay(static7).isMoving).toBe(false);
    expect(getLineDisplay(static8).isMoving).toBe(false);
  });

  it('9=老阳 should be yang, 6=老阴 should be yin', () => {
    expect(getLineDisplay(9).isYang).toBe(true);
    expect(getLineDisplay(7).isYang).toBe(true);
    expect(getLineDisplay(6).isYang).toBe(false);
    expect(getLineDisplay(8).isYang).toBe(false);
  });
});

describe('throwAllSix', () => {
  it('should return exactly 6 throws', () => {
    const results = throwAllSix();
    expect(results).toHaveLength(6);
  });

  it('all throws should have valid line values', () => {
    const results = throwAllSix();
    results.forEach(r => {
      expect([6, 7, 8, 9]).toContain(r.sum);
    });
  });
});

describe('computeHexagram', () => {
  it('should compute originalBits correctly (1=yang, 0=yin)', () => {
    // 6爻全阳（全部9=老阳）
    const allYang = throwAllSix().map(() => ({ coins: [1, 1, 1] as [0|1,0|1,0|1], sum: 9 as LineValue, isMoving: true, isYang: true, changedIsYang: false }));
    const result = computeHexagram(allYang);
    expect(result.originalBits).toBe('111111');
    expect(result.changedBits).toBe('000000'); // 老阳→变阴
    expect(result.movingLines).toHaveLength(6);
  });

  it('should compute changedBits by flipping only moving lines', () => {
    // 爻1=9(老阳动), 爻2-6=7(少阳不动)
    const throws = [
      { coins: [1,1,1] as [0|1,0|1,0|1], sum: 9 as LineValue, isMoving: true, isYang: true, changedIsYang: false },
      { coins: [1,1,0] as [0|1,0|1,0|1], sum: 7 as LineValue, isMoving: false, isYang: true, changedIsYang: true },
      { coins: [1,1,0] as [0|1,0|1,0|1], sum: 7 as LineValue, isMoving: false, isYang: true, changedIsYang: true },
      { coins: [1,1,0] as [0|1,0|1,0|1], sum: 7 as LineValue, isMoving: false, isYang: true, changedIsYang: true },
      { coins: [1,1,0] as [0|1,0|1,0|1], sum: 7 as LineValue, isMoving: false, isYang: true, changedIsYang: true },
      { coins: [1,1,0] as [0|1,0|1,0|1], sum: 7 as LineValue, isMoving: false, isYang: true, changedIsYang: true },
    ];
    const result = computeHexagram(throws);
    expect(result.originalBits).toBe('111111');
    expect(result.changedBits).toBe('011111'); // 只有爻1(index 0)翻转，bits[0]=爻1翻转为0
    expect(result.movingLines).toEqual([1]);
  });

  it('should detect no moving lines when all are 7 or 8', () => {
    const throws = Array.from({ length: 6 }, () => ({
      coins: [1, 1, 0] as [0|1,0|1,0|1],
      sum: 7 as LineValue,
      isMoving: false,
      isYang: true,
      changedIsYang: true,
    }));
    const result = computeHexagram(throws);
    expect(result.movingLines).toHaveLength(0);
    expect(result.hasMoving).toBe(false);
    expect(result.originalBits).toBe(result.changedBits);
  });
});

describe('serializeLines / deserializeLines', () => {
  it('should round-trip correctly', () => {
    const lines: LineValue[] = [6, 7, 8, 9, 7, 8];
    const json = serializeLines(lines);
    const restored = deserializeLines(json);
    expect(restored).toEqual(lines);
  });
});

describe('rebuildHexagram', () => {
  it('should rebuild hexagram from lines', () => {
    const lines: LineValue[] = [9, 7, 8, 6, 7, 8];
    const result = rebuildHexagram(lines);
    expect(result.lines).toEqual(lines);
    expect(result.movingLines).toContain(1); // 爻1=9(动)
    expect(result.movingLines).toContain(4); // 爻4=6(动)
    expect(result.originalBits[0]).toBe('1'); // 爻1=9=阳
    expect(result.originalBits[3]).toBe('0'); // 爻4=6=阴
  });
});

describe('getLineDisplay', () => {
  it('6=老阴 should show ×', () => {
    const d = getLineDisplay(6);
    expect(d.label).toBe('老阴');
    expect(d.isMoving).toBe(true);
    expect(d.isYang).toBe(false);
  });
  it('9=老阳 should show ○', () => {
    const d = getLineDisplay(9);
    expect(d.label).toBe('老阳');
    expect(d.isMoving).toBe(true);
    expect(d.isYang).toBe(true);
  });
  it('7=少阳 should not be moving', () => {
    const d = getLineDisplay(7);
    expect(d.isMoving).toBe(false);
    expect(d.isYang).toBe(true);
  });
  it('8=少阴 should not be moving', () => {
    const d = getLineDisplay(8);
    expect(d.isMoving).toBe(false);
    expect(d.isYang).toBe(false);
  });
});
