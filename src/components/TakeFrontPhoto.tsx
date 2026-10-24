import { useState } from 'preact/hooks';
import type { Case } from '../lib/model';
import { importPhoto, placePhoto } from '../lib/photos';
import { FLAG_LABELS } from '../lib/quality';
import { IconCamera } from './icons';

/** 第 2 步里直接拍术前正面照（还没有正面照时用），拍完即可在上面标注针孔 */
export function TakeFrontPhoto({ update, flush, onDone }: {
  update: (fn: (c: Case) => Case) => void; flush: () => void; onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const photo = await importPhoto(file, 'pre', 'front');
      update((x) => placePhoto(x, photo).next);
      flush();
      if (photo.quality.flags.length) {
        alert(`正面照${photo.quality.flags.map((f) => FLAG_LABELS[f]).join('、')}，建议在第 3 步重拍`);
      }
      onDone?.();
    } catch (e) {
      alert(`照片处理失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <label class={`btn filebtn ${busy ? '' : 'primary'}`} style={{ height: 40, fontSize: 14 }}>
      <IconCamera size={16} />{busy ? '处理中…' : '拍术前正面照'}
      <input type="file" accept="image/*" capture="environment" disabled={busy}
        onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; void take(f); }} />
    </label>
  );
}
