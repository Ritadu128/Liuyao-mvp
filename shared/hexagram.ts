export const VALID_LINE_VALUES = [6, 7, 8, 9] as const;

export type CanonicalLineValue = (typeof VALID_LINE_VALUES)[number];

export type DerivedHexagram = {
  lines: CanonicalLineValue[];
  originalBits: string;
  changedBits: string;
  movingLines: number[];
};

export type HexagramIdentity = { key: string; name: string };

/** 服务端校验使用的六十四卦身份表；位序与 deriveHexagramFromLines 完全一致。 */
export const HEXAGRAM_IDENTITY_BY_BITS: Record<string, HexagramIdentity> = {
  '100000': { key: '24', name: '地雷复' },
  '100001': { key: '27', name: '山雷颐' },
  '100010': { key: '03', name: '水雷屯' },
  '100011': { key: '42', name: '风雷益' },
  '100100': { key: '51', name: '震为雷' },
  '100101': { key: '21', name: '火雷噬嗑' },
  '100110': { key: '17', name: '泽雷随' },
  '100111': { key: '25', name: '天雷无妄' },
  '101000': { key: '36', name: '地火明夷' },
  '101001': { key: '22', name: '山火贲' },
  '101010': { key: '63', name: '水火既济' },
  '101011': { key: '37', name: '风火家人' },
  '101100': { key: '55', name: '雷火丰' },
  '101101': { key: '30', name: '离为火' },
  '101110': { key: '49', name: '泽火革' },
  '101111': { key: '13', name: '天火同人' },
  '110000': { key: '19', name: '地泽临' },
  '110001': { key: '41', name: '山泽损' },
  '110010': { key: '60', name: '水泽节' },
  '110011': { key: '61', name: '风泽中孚' },
  '110100': { key: '54', name: '雷泽归妹' },
  '110101': { key: '38', name: '火泽睽' },
  '110110': { key: '58', name: '兑为泽' },
  '110111': { key: '10', name: '天泽履' },
  '111000': { key: '11', name: '地天泰' },
  '111001': { key: '26', name: '山天大畜' },
  '111010': { key: '05', name: '水天需' },
  '111011': { key: '09', name: '风天小畜' },
  '111100': { key: '34', name: '雷天大壮' },
  '111101': { key: '14', name: '火天大有' },
  '111110': { key: '43', name: '泽天夬' },
  '111111': { key: '01', name: '乾为天' },
  '000100': { key: '16', name: '雷地豫' },
  '001100': { key: '62', name: '雷山小过' },
  '010100': { key: '40', name: '雷水解' },
  '011100': { key: '32', name: '雷风恒' },
  '000101': { key: '35', name: '火地晋' },
  '001101': { key: '56', name: '火山旅' },
  '010101': { key: '64', name: '火水未济' },
  '011101': { key: '50', name: '火风鼎' },
  '000110': { key: '45', name: '泽地萃' },
  '001110': { key: '31', name: '泽山咸' },
  '010110': { key: '47', name: '泽水困' },
  '011110': { key: '28', name: '泽风大过' },
  '000111': { key: '12', name: '天地否' },
  '001111': { key: '33', name: '天山遁' },
  '010111': { key: '06', name: '天水讼' },
  '011111': { key: '44', name: '天风姤' },
  '000000': { key: '02', name: '坤为地' },
  '010001': { key: '04', name: '山水蒙' },
  '010000': { key: '07', name: '地水师' },
  '000010': { key: '08', name: '水地比' },
  '001000': { key: '15', name: '地山谦' },
  '011001': { key: '18', name: '山风蛊' },
  '000011': { key: '20', name: '风地观' },
  '000001': { key: '23', name: '山地剥' },
  '010010': { key: '29', name: '坎为水' },
  '001010': { key: '39', name: '水山蹇' },
  '011000': { key: '46', name: '地风升' },
  '011010': { key: '48', name: '水风井' },
  '001001': { key: '52', name: '艮为山' },
  '001011': { key: '53', name: '风山渐' },
  '011011': { key: '57', name: '巽为风' },
  '010011': { key: '59', name: '风水涣' },
};

export function isCanonicalLineValue(value: unknown): value is CanonicalLineValue {
  return typeof value === 'number'
    && VALID_LINE_VALUES.includes(value as CanonicalLineValue);
}

/**
 * 六爻统一采用“初爻到上爻”的存储顺序：
 * - index 0 / bits[0] 是初爻，index 5 / bits[5] 是上爻；
 * - bits[0..2] 是下卦，bits[3..5] 是上卦；
 * - 7、9 为阳，6、8 为阴；6、9 为动爻，只翻转动爻得到变卦。
 */
export function deriveHexagramFromLines(values: readonly unknown[]): DerivedHexagram | null {
  if (values.length !== 6 || !values.every(isCanonicalLineValue)) return null;

  const lines = [...values] as CanonicalLineValue[];
  const originalBits = lines
    .map(value => value === 7 || value === 9 ? '1' : '0')
    .join('');
  const changedBits = lines
    .map(value => {
      const isYang = value === 7 || value === 9;
      const isMoving = value === 6 || value === 9;
      return (isMoving ? !isYang : isYang) ? '1' : '0';
    })
    .join('');
  const movingLines = lines
    .map((value, index) => value === 6 || value === 9 ? index + 1 : null)
    .filter((position): position is number => position !== null);

  return { lines, originalBits, changedBits, movingLines };
}
