import { describe, expect, it } from 'vitest';
import {
  calculateExportPixelRatio,
  MAX_CANVAS_EDGE,
  MAX_CANVAS_PIXELS,
} from '../client/src/lib/exportImage';

describe('长图导出画布缩放', () => {
  it('为常规手机宽度的解读长图保留 2 倍清晰度', () => {
    expect(calculateExportPixelRatio(390, 2_400)).toBe(2);
  });

  it('在高分辨率屏幕宽度下仍遵守总像素限制', () => {
    const ratio = calculateExportPixelRatio(1_440, 8_000);
    expect(ratio).toBeLessThanOrEqual(2);
    expect(1_440 * ratio * 8_000 * ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('为极长内容降低比例，避免超过画布边长或总像素限制', () => {
    const width = 720;
    const height = 30_000;
    const ratio = calculateExportPixelRatio(width, height);
    expect(height * ratio).toBeLessThanOrEqual(MAX_CANVAS_EDGE + 1);
    expect(width * ratio * height * ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('为极端超长内容继续降低比例而不人为截断', () => {
    const width = 720;
    const height = 100_000;
    const ratio = calculateExportPixelRatio(width, height);
    expect(height * ratio).toBeLessThanOrEqual(MAX_CANVAS_EDGE + 1);
    expect(width * ratio * height * ratio).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('拒绝无效的导出尺寸', () => {
    expect(() => calculateExportPixelRatio(0, 1_000)).toThrow('导出尺寸无效');
    expect(() => calculateExportPixelRatio(400, Number.NaN)).toThrow('导出尺寸无效');
  });
});
