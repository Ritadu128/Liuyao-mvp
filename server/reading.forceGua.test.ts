import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 直接测试 loadForceGuaFixture 的核心逻辑（不依赖 tRPC 上下文）
function loadForceGuaFixture(forceGua: string | undefined) {
  if (!forceGua) return null;
  const fixturePath = path.resolve(__dirname, 'test-fixtures', `${forceGua}.json`);
  if (!fs.existsSync(fixturePath)) return null;
  try {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

describe('FORCE_GUA 测试模式', () => {
  it('FORCE_GUA 未设置时返回 null', () => {
    expect(loadForceGuaFixture(undefined)).toBeNull();
    expect(loadForceGuaFixture('')).toBeNull();
  });

  it('FORCE_GUA=01 时正确加载乾为天 fixture', () => {
    const fixture = loadForceGuaFixture('01');
    expect(fixture).not.toBeNull();
    expect(fixture?.key).toBe('01');
    expect(fixture?.name).toBe('乾为天');
    expect(fixture?.bits).toBe('111111');
    expect(fixture?.gua_ci).toContain('元，亨，利，贞');
    expect(fixture?.xiang_yue).toContain('天行健');
    expect(fixture?.yao_ci?.['1']).toContain('潜龙');
    expect(fixture?.yao_ci?.['5']).toContain('飞龙在天');
  });

  it('FORCE_GUA=99（不存在）时返回 null', () => {
    expect(loadForceGuaFixture('99')).toBeNull();
  });

  it('01.json 包含全部 6 条爻辞', () => {
    const fixture = loadForceGuaFixture('01');
    expect(Object.keys(fixture?.yao_ci ?? {})).toHaveLength(6);
    for (let i = 1; i <= 6; i++) {
      expect(fixture?.yao_ci?.[String(i)]).toBeTruthy();
    }
  });
});
