/**
 * 六爻占卜计算引擎 - 纯函数实现
 *
 * 规则：
 * - 每次投掷 3 枚硬币，正面=3，反面=2
 * - 求和：6=老阴（动爻）、7=少阳、8=少阴、9=老阳（动爻）
 * - 从下往上记录（爻1为最下，爻6为最上）
 * - 变卦：只翻转动爻（老阴→阳，老阳→阴）
 */

export type LineValue = 6 | 7 | 8 | 9;

export interface ThrowResult {
  coins: [0 | 1, 0 | 1, 0 | 1]; // 0=反面(2), 1=正面(3)
  sum: LineValue;
  isMoving: boolean;
  isYang: boolean; // 本卦：阳爻
  changedIsYang: boolean; // 变卦：阳爻
}

export interface HexagramResult {
  lines: LineValue[]; // 6爻值，index 0=爻1(最下)，index 5=爻6(最上)
  originalBits: string; // 6位二进制，从下到上，1=阳，0=阴
  changedBits: string; // 变卦 6位二进制
  movingLines: number[]; // 动爻位置（1-based，从下到上）
  hasMoving: boolean;
}

/**
 * 投掷一次（3枚硬币），返回爻值
 * 使用 Math.random() 模拟，deterministic 逻辑不依赖 LLM
 */
export function throwOnce(): ThrowResult {
  const coins: [0 | 1, 0 | 1, 0 | 1] = [
    Math.random() < 0.5 ? 1 : 0,
    Math.random() < 0.5 ? 1 : 0,
    Math.random() < 0.5 ? 1 : 0,
  ];
  // 正面=3，反面=2
  const sum = (coins[0] === 1 ? 3 : 2) +
              (coins[1] === 1 ? 3 : 2) +
              (coins[2] === 1 ? 3 : 2);
  const lineValue = sum as LineValue;
  const isMoving = lineValue === 6 || lineValue === 9;
  // 7=少阳(阳)，8=少阴(阴)，9=老阳(阳→变阴)，6=老阴(阴→变阳)
  const isYang = lineValue === 7 || lineValue === 9;
  const changedIsYang = isMoving ? !isYang : isYang;

  return { coins, sum: lineValue, isMoving, isYang, changedIsYang };
}

/**
 * 一次性生成 6 爻
 */
export function throwAllSix(): ThrowResult[] {
  return Array.from({ length: 6 }, () => throwOnce());
}

/**
 * 将 6 爻结果转换为卦象数据
 */
export function computeHexagram(throws: ThrowResult[]): HexagramResult {
  const lines = throws.map(t => t.sum) as LineValue[];

  // 本卦二进制：1=阳，0=阴，从下到上（index 0 = 爻1）
  const originalBits = throws.map(t => t.isYang ? '1' : '0').join('');

  // 变卦二进制
  const changedBits = throws.map(t => t.changedIsYang ? '1' : '0').join('');

  // 动爻位置（1-based）
  const movingLines = throws
    .map((t, i) => t.isMoving ? i + 1 : null)
    .filter((v): v is number => v !== null);

  return {
    lines,
    originalBits,
    changedBits,
    movingLines,
    hasMoving: movingLines.length > 0,
  };
}

/**
 * 根据爻值获取爻的显示信息
 */
export function getLineDisplay(value: LineValue): {
  label: string;
  symbol: string;
  isYang: boolean;
  isMoving: boolean;
  description: string;
} {
  switch (value) {
    case 6:
      return { label: '老阴', symbol: '-- ×', isYang: false, isMoving: true, description: '老阴（动）' };
    case 7:
      return { label: '少阳', symbol: '———', isYang: true, isMoving: false, description: '少阳' };
    case 8:
      return { label: '少阴', symbol: '-- -', isYang: false, isMoving: false, description: '少阴' };
    case 9:
      return { label: '老阳', symbol: '——○', isYang: true, isMoving: true, description: '老阳（动）' };
  }
}

/**
 * 将 LineValue 数组转换为可存储的 JSON 字符串
 */
export function serializeLines(lines: LineValue[]): string {
  return JSON.stringify(lines);
}

/**
 * 从 JSON 字符串恢复 LineValue 数组
 */
export function deserializeLines(json: string): LineValue[] {
  return JSON.parse(json) as LineValue[];
}

/**
 * 从 LineValue 数组重建 HexagramResult（用于历史记录展示）
 */
export function rebuildHexagram(lines: LineValue[]): HexagramResult {
  const throws: ThrowResult[] = lines.map(sum => {
    const isMoving = sum === 6 || sum === 9;
    const isYang = sum === 7 || sum === 9;
    return {
      coins: [0, 0, 0],
      sum,
      isMoving,
      isYang,
      changedIsYang: isMoving ? !isYang : isYang,
    };
  });
  return computeHexagram(throws);
}
