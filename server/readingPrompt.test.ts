import { describe, expect, it } from 'vitest';
import { getReadingRelevanceRules } from './readingPromptRules';

describe('AI 解读问题相关性提示词', () => {
  it('保留原问题并要求先直接回答，不猜测 ta 身份', () => {
    const prompt = getReadingRelevanceRules('zh-CN');

    expect(prompt).toContain('综合解读开头两句话必须直接回应用户真正想问的事情');
    expect(prompt).toContain('不得猜测人物身份、动机或用户未说明的关系');
  });

  it('禁止把古代婚姻和敌对情境生搬硬套到考试问题', () => {
    const prompt = getReadingRelevanceRules('zh-CN');

    expect(prompt).toContain('不得把古代人物关系直接套到现实人物上');
    expect(prompt).toContain('考试问题应围绕复习范围、资料、确认方式、准备程度和不确定性展开');
    expect(prompt).toContain('不得转成无关的感情或人际冲突分析');
  });

  it('英文版采用同一套问题相关性约束', () => {
    const prompt = getReadingRelevanceRules('en-US');

    expect(prompt).toContain("Read the user's exact question literally");
    expect(prompt).toContain('never map those roles literally onto the user\'s life');
  });
});
