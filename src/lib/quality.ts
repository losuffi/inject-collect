// 照片质量检查（SPEC 4.2）：平均亮度 + 拉普拉斯方差。只标记，不阻止保存。
import type { QualityFlag } from './model';

/** 分析时把照片缩到这个长边，阈值按此尺寸标定 */
export const ANALYSIS_SIZE = 512;
export const DARK_BELOW = 70;
export const BRIGHT_ABOVE = 215;
/** 高光溢出（≥250）像素占比超过此值判为过曝 */
export const CLIPPED_ABOVE = 0.3;
// 阈值需用真实照片再校准
export const BLURRY_BELOW = 25;

export function rgbaToGray(rgba: Uint8ClampedArray): Float32Array {
  const g = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) {
    g[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return g;
}

export function analyzeGray(g: Float32Array, w: number, h: number) {
  let sum = 0, clipped = 0;
  for (let i = 0; i < g.length; i++) {
    sum += g[i];
    if (g[i] >= 250) clipped++;
  }
  const brightness = sum / g.length;

  // 4 邻域拉普拉斯
  let n = 0, m = 0, m2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const l = g[i - 1] + g[i + 1] + g[i - w] + g[i + w] - 4 * g[i];
      n++;
      m += l;
      m2 += l * l;
    }
  }
  const mean = n ? m / n : 0;
  const sharpness = n ? m2 / n - mean * mean : 0;

  const flags: QualityFlag[] = [];
  if (brightness < DARK_BELOW) flags.push('dark');
  else if (brightness > BRIGHT_ABOVE || clipped / g.length > CLIPPED_ABOVE) flags.push('bright');
  if (sharpness < BLURRY_BELOW) flags.push('blurry');
  return { brightness: Math.round(brightness * 10) / 10, sharpness: Math.round(sharpness * 10) / 10, flags };
}

export const FLAG_LABELS: Record<QualityFlag, string> = { dark: '偏暗', bright: '过曝', blurry: '模糊' };
