export const MAX_CANVAS_EDGE = 16_000;
export const MAX_CANVAS_PIXELS = 24_000_000;
export const MAX_EXPORT_RATIO = 2;

/**
 * 为长图导出选择不会超过浏览器常见边长或总像素限制的清晰度。
 * 目标尺寸过大时自动降低比例而非截断内容。
 */
export function calculateExportPixelRatio(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('导出尺寸无效');
  }

  const byEdge = Math.min(MAX_CANVAS_EDGE / width, MAX_CANVAS_EDGE / height);
  const byPixels = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
  return Math.min(MAX_EXPORT_RATIO, byEdge, byPixels);
}
