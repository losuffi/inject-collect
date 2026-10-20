// 瞳孔坐标系（SPEC 4.3）：两瞳中点为原点，瞳孔连线为 x 轴，瞳距 = 1，y 轴向下。
import type { Vec } from './model';

export type Pupils = { left: Vec; right: Vec };

function frame(p: Pupils) {
  // 按图像 x 排序，保证 x 轴始终从图像左侧指向右侧，与点击顺序无关
  const [a, b] = p.left.x <= p.right.x ? [p.left, p.right] : [p.right, p.left];
  const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ex = { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
  const ey = { x: -ex.y, y: ex.x };
  const o = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { o, ex, ey, d };
}

const clean = (n: number) => (Math.abs(n) < 1e-12 ? 0 : n);

export function toNorm(px: Vec, pupils: Pupils): Vec {
  const { o, ex, ey, d } = frame(pupils);
  const vx = px.x - o.x;
  const vy = px.y - o.y;
  return { x: clean((vx * ex.x + vy * ex.y) / d), y: clean((vx * ey.x + vy * ey.y) / d) };
}

export function fromNorm(n: Vec, pupils: Pupils): Vec {
  const { o, ex, ey, d } = frame(pupils);
  return { x: o.x + d * (n.x * ex.x + n.y * ey.x), y: o.y + d * (n.x * ex.y + n.y * ey.y) };
}

/** 像素位移 → 瞳孔坐标系下的单位方向向量；位移为 0 时返回 undefined */
export function toNormDirection(v: Vec, pupils: Pupils): { dx: number; dy: number } | undefined {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return undefined;
  const { ex, ey } = frame(pupils);
  return { dx: clean((v.x * ex.x + v.y * ex.y) / len), dy: clean((v.x * ey.x + v.y * ey.y) / len) };
}

/** 瞳孔坐标系方向 → 像素方向（单位长度） */
export function fromNormDirection(d: { dx: number; dy: number }, pupils: Pupils): Vec {
  const { ex, ey } = frame(pupils);
  return { x: d.dx * ex.x + d.dy * ey.x, y: d.dx * ex.y + d.dy * ey.y };
}

const SECTORS = ['向右', '向右下', '向下', '向左下', '向左', '向左上', '向上', '向右上'];

/** 方向的中文描述（图像中的方向） */
export function directionLabel(d: { dx: number; dy: number } | undefined, fan: boolean): string {
  if (!d) return fan ? '扇形' : '未画';
  const a = Math.atan2(d.dy, d.dx); // y 向下
  const i = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return SECTORS[i] + (fan ? '扇形' : '');
}
