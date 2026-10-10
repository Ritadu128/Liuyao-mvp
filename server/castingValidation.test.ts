import { describe, expect, it } from 'vitest';
import { getCastingValidationError } from './routers/reading';

const correctScreenshotInput = {
  question: '此次求职能否顺利？',
  originalKey: '34',
  originalName: '雷天大壮',
  originalBits: '111100',
  changedKey: '54',
  changedName: '雷泽归妹',
  changedBits: '110100',
  movingLines: [3],
  guaCi: '利贞。',
  xiangYue: '雷在天上，大壮；君子以非礼弗履。',
  yaoCi: [{
    position: 3,
    text: '九三：小人用壮，君子用罔，贞厉，羝羊触藩，羸其角。',
  }],
  linesJson: '[7,7,9,7,8,8]',
};

describe('AI 解读前的服务端排盘校验', () => {
  it('accepts a casting whose lines, names and changed hexagram agree', () => {
    expect(getCastingValidationError(correctScreenshotInput)).toBeNull();
  });

  it('rejects the old reversed-trigram result before calling AI', () => {
    expect(getCastingValidationError({
      ...correctScreenshotInput,
      originalKey: '25',
      originalName: '天雷无妄',
      changedKey: '17',
      changedName: '泽雷随',
    })).toBe('本卦名称或卦序与六爻不一致');
  });

  it('rejects a wrong changed hexagram even when the original is correct', () => {
    expect(getCastingValidationError({
      ...correctScreenshotInput,
      changedKey: '41',
      changedName: '山泽损',
      changedBits: '110001',
    })).toBe('变卦名称、卦序或爻码与动爻变化不一致');
  });
});
