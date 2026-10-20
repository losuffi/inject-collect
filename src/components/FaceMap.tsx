import type { Case } from '../lib/model';
import { treatmentColor } from '../lib/model';

// 示意脸：两瞳在 (24,31) 与 (36,31)，瞳距 12 个单位，正好把瞳孔坐标映射上去
const toMap = (n: { x: number; y: number }) => ({ x: 30 + n.x * 12, y: 31 + n.y * 12 });

/** 面部位点汇总示意图（第 2 步） */
export function FaceMap({ c, width = 96 }: { c: Case; width?: number }) {
  return (
    <svg width={width} height={(width * 72) / 60} viewBox="0 0 60 72" role="img" style={{ flex: 'none' }}
      aria-label={`面部注射位点示意：共 ${c.points.length} 个进针点`}>
      <ellipse cx="30" cy="36" rx="18" ry="24" fill="none" stroke="#9AA6A3" stroke-width="1.2" />
      <path d="M21 31h6M33 31h6M30 34v9l-2 1" fill="none" stroke="#9AA6A3" stroke-width="1.2" stroke-linecap="round" />
      {c.points.map((p) => {
        const m = toMap(p.norm);
        if (m.x < 0 || m.x > 60 || m.y < 0 || m.y > 72) return null;
        return <circle key={p.id} cx={m.x} cy={m.y} r="1.4" fill={treatmentColor(c, p.treatmentId)[0]} />;
      })}
    </svg>
  );
}
