import type { Case, Photo } from '../lib/model';
import { treatmentColor } from '../lib/model';
import { cropAround } from '../lib/geometry';
import { thumbKey } from '../lib/db';
import { useBlobUrl } from '../hooks';

/**
 * 在术前正面照（缩略图）上显示进针点。
 * treatmentId：只突出这条记录的点并裁切到它们周围；不传则显示全部点。
 */
export function PointsPreview({ c, photo, treatmentId, aspect, label }: {
  c: Case; photo: Photo; treatmentId?: string; aspect: number; label: string;
}) {
  // 单条记录的预览是局部放大，用原图才清晰；全脸小图用缩略图即可
  const url = useBlobUrl(treatmentId ? photo.blobKey : thumbKey(photo.blobKey));
  const W = photo.width, H = photo.height;
  const all = c.points.filter((p) => p.photoId === photo.id);
  const mine = treatmentId ? all.filter((p) => p.treatmentId === treatmentId) : all;
  const pupils = c.pupils?.photoId === photo.id ? [c.pupils.left, c.pupils.right] : [];
  // 单条记录：裁到它的点周围；全部：裁到脸部（瞳孔 + 所有点）
  const box = cropAround(treatmentId ? mine.map((p) => p.px) : [...pupils, ...all.map((p) => p.px)], W, H, aspect, W * 0.6);
  const r = box.w * 0.02;

  return (
    <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid slice" class="pts-preview"
      style={{ aspectRatio: String(aspect) }} role="img" aria-label={label}>
      <rect x={0} y={0} width={W} height={H} fill="#D3DCE0" />
      {url && <image href={url} width={W} height={H} preserveAspectRatio="none" />}
      {all.map((p) => {
        const on = !treatmentId || p.treatmentId === treatmentId;
        return (
          <circle key={p.id} cx={p.px.x} cy={p.px.y} r={on ? r : r * 0.6} fill={treatmentColor(c, p.treatmentId)[0]}
            stroke="#fff" stroke-width={r * 0.3} opacity={on ? 1 : 0.4} />
        );
      })}
    </svg>
  );
}
