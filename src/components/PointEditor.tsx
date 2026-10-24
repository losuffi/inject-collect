import { useEffect } from 'preact/hooks';
import type { Case, Photo } from '../lib/model';
import { Annotator } from './Annotator';

/** 全屏针孔标注：从注射记录卡片打开，只编辑这一条记录的点（不传 treatmentId 则编辑全部） */
export function PointEditor({ c, photo, treatmentId, update, onClose }: {
  c: Case; photo: Photo; treatmentId?: string; update: (fn: (c: Case) => Case) => void; onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div class="editor-overlay" role="dialog" aria-modal="true" aria-label="在正面照上标注针孔">
      <header class="editor-head">
        <span style={{ fontSize: 15, fontWeight: 500 }}>在正面照上标注针孔</span>
        <button class="btn primary small" style={{ padding: '0 18px' }} onClick={onClose}>完成</button>
      </header>
      <div class="editor-body">
        <Annotator c={c} photo={photo} update={update} activeTreatmentId={treatmentId} />
      </div>
    </div>
  );
}
