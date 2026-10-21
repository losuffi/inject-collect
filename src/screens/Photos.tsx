import { useState } from 'preact/hooks';
import type { StepProps } from './types';
import {
  EXPRESSION_VIEWS, PHASE_LABELS, STANDARD_VIEWS, VIEW_LABELS, type Case, type Phase, type Photo, type View,
} from '../lib/model';
import { hasBoNT, photoFor, photoProgress } from '../lib/caseLogic';
import { annotationCount, discardPhotoBlobs, importPhoto, placePhoto, removePhoto } from '../lib/photos';
import { FLAG_LABELS } from '../lib/quality';
import { thumbKey } from '../lib/db';
import { useBlobUrl, useToast } from '../hooks';
import { caseHref, go } from '../router';
import { Annotator } from '../components/Annotator';
import { Sheet, Toast } from '../components/common';
import { IconCamera } from '../components/icons';
import './photos.css';

const PHASES: Phase[] = ['pre', 'immediate', 'followup'];

export function PhotosStep({ c, update, flush, query }: StepProps) {
  const phase = (PHASES as string[]).includes(query.get('phase') ?? '') ? (query.get('phase') as Phase) : 'pre';
  const [busy, setBusy] = useState<Set<View>>(new Set());
  const [open, setOpen] = useState<Photo | null>(null);
  const [toast, showToast] = useToast();
  const bont = hasBoNT(c);

  const setPhase = (p: Phase) => go(caseHref(c.id, 'photos', p === 'pre' ? '' : `phase=${p}`), true);

  async function take(view: View, file: File | undefined) {
    if (!file) return;
    const old = photoFor(c, phase, view);
    const lost = old ? annotationCount(c, old.id) : 0;
    if (lost && !confirm(`重拍会清除这张照片上的 ${c.points.filter((p) => p.photoId === old!.id).length} 个进针点和瞳孔基准，确定吗？`)) return;
    setBusy((b) => new Set(b).add(view));
    try {
      const photo = await importPhoto(file, phase, view);
      let replaced: Photo | undefined;
      update((x) => {
        const r = placePhoto(x, photo);
        replaced = r.replaced;
        return r.next;
      });
      flush();
      if (replaced) void discardPhotoBlobs(replaced);
      if (photo.quality.flags.length) {
        showToast(`${VIEW_LABELS[view]}：${photo.quality.flags.map((f) => FLAG_LABELS[f]).join('、')}，建议重拍`);
      }
    } catch (e) {
      showToast(`照片处理失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(view);
        return n;
      });
    }
  }

  function remove(p: Photo) {
    const n = annotationCount(c, p.id);
    if (!confirm(n ? '删除这张照片？上面的针位标注和瞳孔基准也会删除。' : '删除这张照片？')) return;
    update((x) => removePhoto(x, p));
    flush();
    void discardPhotoBlobs(p);
    setOpen(null);
  }

  const counter = (p: Phase) => {
    const pr = photoProgress(c, p);
    if (p === 'immediate') return { text: String(c.photos.filter((x) => x.phase === p).length), warn: false };
    if (p === 'followup' && c.followupSkipped) return { text: '跳过', warn: false };
    return { text: `${pr.done}/${pr.total}`, warn: p === 'pre' && pr.done < pr.total };
  };
  const front = photoFor(c, 'pre', 'front');
  const tileProps = { c, phase, busy, onTake: take, onOpen: setOpen };

  return (
    <main class="page" style={{ gap: 16, paddingTop: 16 }}>
      <div class="phase-tabs" role="tablist">
        {PHASES.map((p) => {
          const k = counter(p);
          return (
            <button key={p} role="tab" aria-selected={p === phase} class={p === phase ? 'on' : ''} onClick={() => setPhase(p)}>
              {PHASE_LABELS[p]} <span class={`mono ${k.warn ? 'warn-text' : ''}`}>{k.text}</span>
            </button>
          );
        })}
      </div>

      <section class="stack" style={{ gap: 8 }}>
        <h2 class="subhead">五个标准角度 · {phase === 'immediate' ? '选拍' : '必拍'}</h2>
        <div class="tiles">
          {STANDARD_VIEWS.map((v) => <PhotoTile key={v} view={v} {...tileProps} />)}
        </div>
      </section>

      {phase === 'pre' && (front ? (
        <Annotator key={front.id} c={c} photo={front} update={update} />
      ) : (
        <section class="card muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <b style={{ color: 'var(--ink)', fontSize: 16 }}>针位标注 · 术前正面照</b>
          <p style={{ margin: '6px 0 0' }}>先拍术前正面照，然后在照片上点瞳孔和进针点。</p>
        </section>
      ))}

      <section class="stack" style={{ gap: 8 }}>
        <h2 class="subhead">表情照 · 肉毒素病例必拍，本例{bont ? '必拍' : '选拍'}</h2>
        <div class="tiles">
          {EXPRESSION_VIEWS.map((v) => <PhotoTile key={v} view={v} square {...tileProps} />)}
        </div>
      </section>

      {phase === 'followup' && (
        <section class="overlay-tip">
          <svg width="64" height="84" viewBox="0 0 60 80" aria-hidden="true" style={{ flex: 'none' }}>
            <rect width="60" height="80" rx="6" fill="#18211F" />
            <ellipse cx="30" cy="40" rx="16" ry="22" fill="none" stroke="#7FD0D8" stroke-width="1.2" stroke-dasharray="3 2" />
            <path d="M22 36h5M33 36h5" stroke="#7FD0D8" stroke-width="1.2" />
            <path d="M30 10v60M8 36h44" stroke="#FFFFFF" stroke-width="0.4" opacity="0.5" />
          </svg>
          <div class="stack" style={{ gap: 4 }}>
            <b style={{ fontSize: 14 }}>对照术前构图拍复诊照</b>
            <span>未拍的格子里淡淡显示术前同角度照片。对齐眼睛和下巴的位置、保持同样距离再按快门，前后照片才能逐像素比较。</span>
          </div>
        </section>
      )}

      <details class="card rules" open={phase === 'pre' && c.photos.length === 0}>
        <summary>拍摄规范</summary>
        <ul>
          <li>卸妆，头发后拢露出额头和耳朵，摘眼镜和耳饰</li>
          <li>浅灰纯色背景，同一房间、同一光源，关掉顶灯避免混光</li>
          <li>用后置摄像头，距离固定 1 米左右，镜头与眼睛平齐</li>
          <li>复诊照与术前照用同一台手机、同一位置</li>
        </ul>
        <p>导入照片时自动去除定位等元数据，统一压缩到长边 2400 像素，并检查亮度和清晰度。</p>
      </details>

      <a class="btn primary big" href={caseHref(c.id, 'followup')}>下一步：复诊</a>

      {open && (
        <PhotoSheet c={c} photo={open} onClose={() => setOpen(null)} onDelete={() => remove(open)}
          onRetake={(f) => { setOpen(null); void take(open.view, f); }} />
      )}
      <Toast msg={toast} />
    </main>
  );
}

type TileProps = {
  c: Case; phase: Phase; view: View; square?: boolean; busy: Set<View>;
  onTake: (v: View, f: File | undefined) => void; onOpen: (p: Photo) => void;
};

function PhotoTile({ c, phase, view, square, busy, onTake, onOpen }: TileProps) {
  const photo = photoFor(c, phase, view);
  const thumb = useBlobUrl(photo ? thumbKey(photo.blobKey) : undefined);
  const guide = phase === 'followup' && !photo ? photoFor(c, 'pre', view) : undefined;
  const guideUrl = useBlobUrl(guide ? thumbKey(guide.blobKey) : undefined);
  const flags = photo?.quality.flags ?? [];
  const required = phase !== 'immediate' && (STANDARD_VIEWS.includes(view) || hasBoNT(c));
  const isBusy = busy.has(view);

  return (
    <figure class="tile">
      {photo ? (
        <button class={`tile-box ${square ? 'sq' : ''} ${flags.length ? 'flagged' : ''}`} onClick={() => onOpen(photo)}
          aria-label={`${VIEW_LABELS[view]}，已拍${flags.length ? '，' + flags.map((f) => FLAG_LABELS[f]).join('、') : ''}，点按查看或重拍`}>
          {thumb && <img src={thumb} alt="" />}
          {flags.length ? (
            <span class="flag">{flags.map((f) => FLAG_LABELS[f]).join('、')} · 建议重拍</span>
          ) : (
            <span class="ok-dot">✓</span>
          )}
          {isBusy && <span class="tile-busy">处理中…</span>}
        </button>
      ) : (
        <label class={`tile-box empty ${square ? 'sq' : ''}`}>
          {guideUrl && <img src={guideUrl} alt="" class="guide" />}
          <Silhouette view={view} />
          <span class="row" style={{ gap: 4, color: 'var(--brand)', position: 'relative' }}>
            {isBusy ? '处理中…' : <><IconCamera />拍摄</>}
          </span>
          <input type="file" accept="image/*" capture="environment" aria-label={`拍摄${VIEW_LABELS[view]}`} disabled={isBusy}
            onChange={(e) => { const f = e.currentTarget.files?.[0]; e.currentTarget.value = ''; onTake(view, f); }} />
        </label>
      )}
      <figcaption class={!photo && required ? 'warn-text' : ''}>
        {VIEW_LABELS[view]}{!photo && required ? ' · 未拍' : ''}
      </figcaption>
    </figure>
  );
}

function PhotoSheet({ c, photo, onClose, onDelete, onRetake }: {
  c: Case; photo: Photo; onClose: () => void; onDelete: () => void; onRetake: (f: File) => void;
}) {
  const url = useBlobUrl(photo.blobKey);
  const q = photo.quality;
  const n = c.points.filter((p) => p.photoId === photo.id).length;
  const pick = (e: Event) => {
    const f = (e.currentTarget as HTMLInputElement).files?.[0];
    if (f) onRetake(f);
  };
  return (
    <Sheet label={`${PHASE_LABELS[photo.phase]} ${VIEW_LABELS[photo.view]}`} onClose={onClose}>
      <h3>{PHASE_LABELS[photo.phase]} · {VIEW_LABELS[photo.view]}</h3>
      <div class="sheet-photo">{url && <img src={url} alt={`${VIEW_LABELS[photo.view]}照片`} />}</div>
      <div class="mono muted" style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>{photo.width}×{photo.height}</span>
        <span>亮度 {Math.round(q.brightness)}</span>
        <span>清晰度 {Math.round(q.sharpness)}</span>
        {q.flags.length > 0 && <span class="warn-text">{q.flags.map((f) => FLAG_LABELS[f]).join('、')}</span>}
      </div>
      {n > 0 && <p class="notice">这张照片上有 {n} 个针位标注，重拍或删除会一并清除。</p>}
      <div class="grid2">
        <label class="btn primary filebtn"><IconCamera size={16} />重拍
          <input type="file" accept="image/*" capture="environment" onChange={pick} />
        </label>
        <label class="btn filebtn">从相册选择
          <input type="file" accept="image/*" onChange={pick} />
        </label>
      </div>
      <button class="btn danger" onClick={onDelete}>删除这张照片</button>
    </Sheet>
  );
}

function Silhouette({ view }: { view: View }) {
  const common = { fill: 'none', stroke: '#9AA6A3', 'stroke-width': 1.4, 'stroke-linecap': 'round' as const };
  if (view === 'l90' || view === 'r90') {
    return (
      <svg width="44" height="58" viewBox="0 0 60 80" aria-hidden="true" style={{ position: 'relative', transform: view === 'l90' ? 'scaleX(-1)' : undefined }}>
        <path d="M24 16 C14 16 10 26 10 38 C10 54 16 66 26 68 L32 68 L34 62 L38 60 L36 56 L40 52 L36 48 L42 42 L36 36 C38 24 34 16 24 16Z" {...common} />
      </svg>
    );
  }
  const inner: Record<string, string> = {
    front: 'M21 31h6M33 31h6M30 34v9l-2 1M25 51h10',
    l45: 'M20 31h5M30 31h5M24 34l-4 8h4M21 51q4 2 9 0',
    r45: 'M35 31h5M25 31h5M36 34l4 8h-4M30 51q5 2 9 0',
    frown: 'M20 27l7 3M40 27l-7 3M28 21v5M32 21v5M22 33h5M33 33h5M25 51h10',
    raise: 'M20 26q3-4 7 0M33 26q3-4 7 0M22 17h16M23 20h14M22 33h5M33 33h5M25 51h10',
    smile: 'M21 31h6M33 31h6M21 47q9 9 18 0M17 33l3 2M43 33l-3 2',
  };
  return (
    <svg width="44" height="52" viewBox="0 0 60 70" aria-hidden="true" style={{ position: 'relative' }}>
      <ellipse cx="30" cy="35" rx="18" ry="24" {...common} />
      <path d={inner[view]} {...common} />
    </svg>
  );
}
