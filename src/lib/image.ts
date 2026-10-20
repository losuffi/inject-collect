// 照片导入（SPEC 4.2）：按 EXIF 方向纠正 → 长边缩到 2400 → 重新编码 JPEG 0.9（不带 EXIF）→ 质量检查。
import { ANALYSIS_SIZE, analyzeGray, rgbaToGray } from './quality';
import type { Photo } from './model';

export const MAX_EDGE = 2400;
export const THUMB_EDGE = 360;

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    // <img> 默认按 EXIF 方向显示（image-orientation: from-image），绘制到 canvas 时同样生效。
    // 用 onload 而不是 img.decode()：后者要等渲染帧，页面在后台时会一直挂起。
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法读取这张照片'));
      img.src = url;
    });
  } finally {
    // decode 完成后像素已就绪，URL 可以释放
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function drawScaled(img: CanvasImageSource, w: number, h: number, maxEdge: number) {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * s));
  const ch = Math.max(1, Math.round(h * s));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, cw, ch);
  return { canvas, ctx, cw, ch };
}

/** 取中央 50% 宽 × 60% 高，缩到 ANALYSIS_SIZE 以内 */
function drawCenter(src: HTMLCanvasElement, w: number, h: number) {
  const sw = w * 0.5, sh = h * 0.6, sx = w * 0.25, sy = h * 0.2;
  const s = Math.min(1, ANALYSIS_SIZE / Math.max(sw, sh));
  const cw = Math.max(1, Math.round(sw * s));
  const ch = Math.max(1, Math.round(sh * s));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  return { ctx, cw, ch };
}

const toJpeg = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('照片编码失败'))), 'image/jpeg', q));

export type ProcessedPhoto = {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
  quality: Photo['quality'];
};

export async function processPhoto(file: Blob): Promise<ProcessedPhoto> {
  const img = await loadImage(file);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  const full = drawScaled(img, w, h, MAX_EDGE);
  const fullBlob = await toJpeg(full.canvas, 0.9);

  // 只分析画面中央（面部所在区域），背景不参与亮度和清晰度判断
  const a = drawCenter(full.canvas, full.cw, full.ch);
  const gray = rgbaToGray(a.ctx.getImageData(0, 0, a.cw, a.ch).data);
  const quality = analyzeGray(gray, a.cw, a.ch);

  const t = drawScaled(full.canvas, full.cw, full.ch, THUMB_EDGE);
  const thumb = await toJpeg(t.canvas, 0.8);

  // 释放画布内存（iOS 对画布总内存有限制）
  full.canvas.width = full.canvas.height = 0;
  return { full: fullBlob, thumb, width: full.cw, height: full.ch, quality };
}
