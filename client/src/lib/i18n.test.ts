import { describe, expect, it } from 'vitest';
import { enUS, zhCN } from '@/i18n/messages';
import { localizedHexagramName } from '@/i18n/hexagrams';

describe('i18n completeness and language isolation', () => {
  it('keeps every locale on exactly the same translation keys', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort());
  });

  it('does not allow Chinese characters into the English language pack', () => {
    const contaminated = Object.entries(enUS).filter(([, value]) => /[\u3400-\u9fff]/u.test(value));
    expect(contaminated).toEqual([]);
  });

  it('has an English display name for all 64 hexagrams', () => {
    for (let number = 1; number <= 64; number += 1) {
      const key = String(number).padStart(2, '0');
      const name = localizedHexagramName(key, '中文占位', 'en-US');
      expect(name).not.toMatch(/[\u3400-\u9fff]/u);
      expect(name).not.toBe(`Hexagram ${number}`);
    }
  });
});
