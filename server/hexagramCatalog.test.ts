import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import hexagramMap from '../client/public/data/hexagrams_map.json';
import { deriveHexagramFromLines, HEXAGRAM_IDENTITY_BY_BITS } from '../shared/hexagram';

const KING_WEN_NAMES = [
  '乾为天', '坤为地', '水雷屯', '山水蒙', '水天需', '天水讼', '地水师', '水地比',
  '风天小畜', '天泽履', '地天泰', '天地否', '天火同人', '火天大有', '地山谦', '雷地豫',
  '泽雷随', '山风蛊', '地泽临', '风地观', '火雷噬嗑', '山火贲', '山地剥', '地雷复',
  '天雷无妄', '山天大畜', '山雷颐', '泽风大过', '坎为水', '离为火', '泽山咸', '雷风恒',
  '天山遁', '雷天大壮', '火地晋', '地火明夷', '风火家人', '火泽睽', '水山蹇', '雷水解',
  '山泽损', '风雷益', '泽天夬', '天风姤', '泽地萃', '地风升', '泽水困', '水风井',
  '泽火革', '火风鼎', '震为雷', '艮为山', '风山渐', '雷泽归妹', '雷火丰', '火山旅',
  '巽为风', '兑为泽', '风水涣', '水泽节', '风泽中孚', '雷山小过', '水火既济', '火水未济',
] as const;

const POSITION_PREFIXES = ['初', '二', '三', '四', '五', '上'] as const;

describe('六十四卦数据完整性', () => {
  it('按初爻到上爻存储，前三位为下卦、后三位为上卦', () => {
    const entries = Object.entries(hexagramMap.hexagrams);
    expect(entries).toHaveLength(64);

    const keys = new Set<string>();
    const numbers = new Set<number>();
    for (const [bits, info] of entries) {
      expect(bits).toMatch(/^[01]{6}$/);
      expect(info.lower).toBe(hexagramMap.trigrams[bits.slice(0, 3) as keyof typeof hexagramMap.trigrams].name);
      expect(info.upper).toBe(hexagramMap.trigrams[bits.slice(3, 6) as keyof typeof hexagramMap.trigrams].name);
      expect(info.name).toBe(KING_WEN_NAMES[info.number - 1]);
      expect(info.key).toBe(String(info.number).padStart(2, '0'));
      keys.add(info.key);
      numbers.add(info.number);
    }
    expect(keys.size).toBe(64);
    expect(numbers.size).toBe(64);
    expect(HEXAGRAM_IDENTITY_BY_BITS).toEqual(Object.fromEntries(
      entries.map(([bits, info]) => [bits, { key: info.key, name: info.name }]),
    ));
  });

  it('64 份经文与卦表匹配，384 条爻辞的阴阳和爻位一致', () => {
    for (const [bits, info] of Object.entries(hexagramMap.hexagrams)) {
      const textPath = path.resolve(process.cwd(), 'client/public/data/texts', `${info.key}.json`);
      const text = JSON.parse(fs.readFileSync(textPath, 'utf8')) as {
        key: string;
        name: string;
        bits: string;
        gua_ci: string;
        xiang_yue: string;
        yao_ci: Record<string, string>;
      };
      expect(text.key).toBe(info.key);
      expect(text.name).toBe(info.name);
      expect(text.bits).toBe(bits);
      expect(text.gua_ci.length).toBeGreaterThan(0);
      expect(text.xiang_yue.length).toBeGreaterThan(0);

      for (let position = 1; position <= 6; position += 1) {
        const polarity = bits[position - 1] === '1' ? '九' : '六';
        const expectedPrefix = position === 1 || position === 6
          ? `${POSITION_PREFIXES[position - 1]}${polarity}`
          : `${polarity}${POSITION_PREFIXES[position - 1]}`;
        expect(text.yao_ci[String(position)]).toMatch(new RegExp(`^${expectedPrefix}[：:]`));
      }
    }
  });

  it('复现用户截图：雷天大壮三爻动，变为雷泽归妹', () => {
    const result = deriveHexagramFromLines([7, 7, 9, 7, 8, 8]);
    expect(result).not.toBeNull();
    expect(result?.originalBits).toBe('111100');
    expect(result?.changedBits).toBe('110100');
    expect(result?.movingLines).toEqual([3]);
    expect(hexagramMap.hexagrams[result!.originalBits as keyof typeof hexagramMap.hexagrams]).toMatchObject({
      key: '34', name: '雷天大壮', lower: '乾', upper: '震',
    });
    expect(hexagramMap.hexagrams[result!.changedBits as keyof typeof hexagramMap.hexagrams]).toMatchObject({
      key: '54', name: '雷泽归妹', lower: '兑', upper: '震',
    });
  });

  it('固定校验易混淆的无妄、大畜、随、损', () => {
    expect(hexagramMap.hexagrams['100111']).toMatchObject({ key: '25', name: '天雷无妄' });
    expect(hexagramMap.hexagrams['111001']).toMatchObject({ key: '26', name: '山天大畜' });
    expect(hexagramMap.hexagrams['100110']).toMatchObject({ key: '17', name: '泽雷随' });
    expect(hexagramMap.hexagrams['110001']).toMatchObject({ key: '41', name: '山泽损' });
  });
});
