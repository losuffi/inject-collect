import { describe, it, expect } from 'vitest';
import { analyzeGray, rgbaToGray } from '../quality';

function fill(w: number, h: number, f: (x: number, y: number) => number) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = f(x, y);
  return g;
}

describe('照片质量检查', () => {
  it('灰度转换', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const g = rgbaToGray(rgba);
    expect(g[0]).toBeCloseTo(255);
    expect(g[1]).toBe(0);
  });

  it('过暗', () => {
    const q = analyzeGray(fill(64, 64, (x, y) => ((x + y) % 2 ? 40 : 20)), 64, 64);
    expect(q.flags).toContain('dark');
  });

  it('过亮', () => {
    const q = analyzeGray(fill(64, 64, (x, y) => ((x + y) % 2 ? 250 : 230)), 64, 64);
    expect(q.flags).toContain('bright');
  });

  it('平滑无细节判为模糊，纹理清晰不判模糊', () => {
    const blurry = analyzeGray(fill(64, 64, (x) => 100 + x * 0.5), 64, 64);
    expect(blurry.flags).toEqual(['blurry']);
    const sharp = analyzeGray(fill(64, 64, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? 160 : 90), 64, 64);
    expect(sharp.flags).toEqual([]);
    expect(sharp.sharpness).toBeGreaterThan(blurry.sharpness);
  });
});
