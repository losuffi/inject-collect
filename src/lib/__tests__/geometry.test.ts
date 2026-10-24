import { describe, it, expect } from 'vitest';
import { toNorm, fromNorm, toNormDirection, fromNormDirection, directionLabel, cropAround } from '../geometry';

describe('瞳孔坐标归一化', () => {
  const pupils = { left: { x: 100, y: 200 }, right: { x: 200, y: 200 } };

  it('两瞳中点为原点、瞳距为 1、y 轴向下', () => {
    expect(toNorm({ x: 150, y: 200 }, pupils)).toEqual({ x: 0, y: 0 });
    expect(toNorm({ x: 200, y: 200 }, pupils)).toEqual({ x: 0.5, y: 0 });
    const chin = toNorm({ x: 150, y: 431 }, pupils);
    expect(chin.x).toBeCloseTo(0);
    expect(chin.y).toBeCloseTo(2.31);
  });

  it('瞳孔点击顺序不影响结果（按图像 x 排序）', () => {
    const swapped = { left: pupils.right, right: pupils.left };
    expect(toNorm({ x: 180, y: 260 }, swapped)).toEqual(toNorm({ x: 180, y: 260 }, pupils));
  });

  it('头部倾斜时沿瞳孔连线旋转', () => {
    // 瞳孔连线旋转 90°（右瞳在左瞳正下方）→ 图像 +y 方向即为 x 轴
    const tilted = { left: { x: 100, y: 100 }, right: { x: 100, y: 200 } };
    // 按 x 排序相等时保留原顺序
    const n = toNorm({ x: 100, y: 250 }, tilted);
    expect(n.x).toBeCloseTo(1);
    expect(n.y).toBeCloseTo(0);
  });

  it('同一张脸缩放后归一化坐标不变', () => {
    const big = { left: { x: 200, y: 400 }, right: { x: 400, y: 400 } };
    const a = toNorm({ x: 330, y: 700 }, big);
    const b = toNorm({ x: 165, y: 350 }, pupils);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.y).toBeCloseTo(b.y);
  });

  it('fromNorm 是 toNorm 的逆运算', () => {
    const tilted = { left: { x: 120, y: 210 }, right: { x: 230, y: 180 } };
    const p = { x: 171.3, y: 402.9 };
    const back = fromNorm(toNorm(p, tilted), tilted);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('方向向量转换为单位向量并可逆', () => {
    const tilted = { left: { x: 120, y: 210 }, right: { x: 230, y: 180 } };
    const d = toNormDirection({ x: 0, y: -40 }, tilted)!;
    expect(Math.hypot(d.dx, d.dy)).toBeCloseTo(1);
    const px = fromNormDirection(d, tilted);
    expect(px.x / Math.hypot(px.x, px.y)).toBeCloseTo(0);
    expect(px.y / Math.hypot(px.x, px.y)).toBeCloseTo(-1);
    expect(toNormDirection({ x: 0, y: 0 }, tilted)).toBeUndefined();
  });

  it('预览裁切框：包住所有点、比例固定、不出界', () => {
    const W = 1200, H = 1600;
    expect(cropAround([], W, H, 4 / 3, 400)).toEqual({ x: 0, y: 0, w: W, h: H });
    const pts = [{ x: 500, y: 1040 }, { x: 700, y: 1090 }];
    const b = cropAround(pts, W, H, 16 / 10, 420);
    expect(b.w / b.h).toBeCloseTo(1.6);
    for (const p of pts) {
      expect(p.x).toBeGreaterThan(b.x);
      expect(p.x).toBeLessThan(b.x + b.w);
      expect(p.y).toBeGreaterThan(b.y);
      expect(p.y).toBeLessThan(b.y + b.h);
    }
    // 靠近边缘的点：框被推回图内
    const edge = cropAround([{ x: 10, y: 1590 }], W, H, 16 / 10, 420);
    expect(edge.x).toBe(0);
    expect(edge.y + edge.h).toBeCloseTo(H);
    // 很分散的点：框不超过整张图
    const wide = cropAround([{ x: 0, y: 0 }, { x: 1200, y: 1600 }], W, H, 16 / 10, 420);
    expect(wide.w).toBeLessThanOrEqual(W);
    expect(wide.h).toBeLessThanOrEqual(H);
  });

  it('方向文字描述', () => {
    expect(directionLabel({ dx: 0, dy: -1 }, false)).toBe('向上');
    expect(directionLabel({ dx: 0, dy: -1 }, true)).toBe('向上扇形');
    expect(directionLabel({ dx: 0.7, dy: 0.7 }, false)).toBe('向右下');
    expect(directionLabel(undefined, false)).toBe('未画');
  });
});
