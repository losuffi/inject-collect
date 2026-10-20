// 针位标注（SPEC 4.3）：
// 先点两只瞳孔作为坐标基准 → ① 点击放置进针点（可拖动移点）→ ② 从点拖出方向 → 下方面板填写详情。
// 支持撤销、双指缩放、单指平移（缩放后）。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ANGLES, LAYERS, TECHNIQUES, areaLabel, layerLabel, sideLabel, treatmentColor,
  type Case, type InjectionPoint, type Photo, type Vec, type Technique, type LayerCode,
} from '../lib/model';
import { formatDose, pointDoseIssues } from '../lib/caseLogic';
import { directionLabel, fromNormDirection, toNorm, toNormDirection } from '../lib/geometry';
import { uid } from '../lib/ids';
import { useBlobUrl } from '../hooks';
import { IconUndo } from './icons';
import { NumberField } from './NumberField';
import { OptionGroup } from './common';
import { TextSelect } from './TextSelect';

type Mode = 'pupils' | 'point' | 'direction';
type Snapshot = Pick<Case, 'points' | 'pupils'>;
type Gesture =
  | { kind: 'tap'; start: Vec; hit?: string; moved: boolean }
  | { kind: 'move'; id: string }
  | { kind: 'dir'; id: string }
  | { kind: 'pupil'; which: 'left' | 'right' }
  | { kind: 'pan'; last: Vec }
  | { kind: 'pinch'; d0: number; s0: number; anchor: Vec };

const HIT = 22; // 屏幕像素
const DRAG = 6;

export function Annotator({ c, photo, update }: { c: Case; photo: Photo; update: (fn: (c: Case) => Case) => void }) {
  const url = useBlobUrl(photo.blobKey);
  const W = photo.width, H = photo.height;
  const pupils = c.pupils?.photoId === photo.id ? c.pupils : undefined;
  const points = c.points.filter((p) => p.photoId === photo.id);

  const [mode, setMode] = useState<Mode>(pupils ? 'point' : 'pupils');
  const [pending, setPending] = useState<Vec | null>(null); // 已点的第一只瞳孔
  const [selected, setSelected] = useState<string | null>(null);
  const [lastTreatment, setLastTreatment] = useState<string | undefined>(c.treatments[0]?.id);
  const [view, setView] = useState({ s: 1, tx: 0, ty: 0 });
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [boxW, setBoxW] = useState(320);

  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Vec>());
  const gesture = useRef<Gesture | null>(null);

  useEffect(() => {
    if (!pupils && mode !== 'pupils') setMode('pupils');
  }, [!!pupils]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.getBoundingClientRect().width || 320));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** 一个屏幕像素对应的图像像素数 */
  const k = W / boxW / view.s;

  function snapshot() {
    setHistory((h) => [...h.slice(-49), { points: c.points, pupils: c.pupils }]);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setPending(null);
    update((x) => ({ ...x, points: last.points, pupils: last.pupils }));
    if (selected && !last.points.some((p) => p.id === selected)) setSelected(null);
  }

  // ---- 坐标换算 ----
  function toViewBox(e: { clientX: number; clientY: number }): Vec {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  }
  function toImage(e: { clientX: number; clientY: number }): Vec {
    const v = toViewBox(e);
    return { x: (v.x - view.tx) / view.s, y: (v.y - view.ty) / view.s };
  }
  const clampImg = (p: Vec): Vec => ({ x: Math.min(W, Math.max(0, p.x)), y: Math.min(H, Math.max(0, p.y)) });
  const screenDist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y) / k;

  function clampView(v: { s: number; tx: number; ty: number }) {
    const s = Math.min(6, Math.max(1, v.s));
    return { s, tx: Math.min(0, Math.max(W - W * s, v.tx)), ty: Math.min(0, Math.max(H - H * s, v.ty)) };
  }

  function hitPoint(img: Vec): string | undefined {
    let best: { id: string; d: number } | undefined;
    for (const p of points) {
      const d = screenDist(p.px, img);
      if (d < HIT && (!best || d < best.d)) best = { id: p.id, d };
    }
    return best?.id;
  }

  function hitPupil(img: Vec): 'left' | 'right' | undefined {
    if (!pupils) return undefined;
    if (screenDist(pupils.left, img) < HIT) return 'left';
    if (screenDist(pupils.right, img) < HIT) return 'right';
    return undefined;
  }

  // ---- 修改病例 ----
  function setPoint(id: string, p: Partial<InjectionPoint>) {
    update((x) => ({ ...x, points: x.points.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  }

  function setPupils(left: Vec, right: Vec) {
    const pp = { photoId: photo.id, left, right };
    update((x) => ({
      ...x,
      pupils: pp,
      // 基准变了，所有点的归一化坐标和方向一起重算
      points: x.points.map((p) => {
        if (p.photoId !== photo.id) return p;
        const dir = p.direction && x.pupils ? fromNormDirection(p.direction, x.pupils) : undefined;
        return { ...p, norm: toNorm(p.px, pp), direction: dir ? toNormDirection(dir, pp) : p.direction };
      }),
    }));
  }

  function addPoint(img: Vec) {
    if (!pupils) return;
    const t = c.treatments.find((x) => x.id === lastTreatment) ?? c.treatments[0];
    if (!t) return;
    const used = c.points.filter((p) => p.treatmentId === t.id).reduce((s, p) => s + p.dose, 0);
    const remaining = Math.max(0, Math.round((t.dose - used) * 100) / 100);
    const p: InjectionPoint = {
      id: uid('pt_'), treatmentId: t.id, photoId: photo.id, px: img, norm: toNorm(img, pupils), fan: false,
      angle: 45, layer: t.layer, technique: 'bolus', dose: remaining,
    };
    snapshot();
    update((x) => ({ ...x, points: [...x.points, p] }));
    setSelected(p.id);
  }

  // ---- 手势 ----
  function onDown(e: PointerEvent) {
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      // 指针已失效时忽略
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const mid = { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 };
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), s0: view.s, anchor: toImage(mid) };
      return;
    }
    if (pointers.current.size > 2) return;
    const img = toImage(e);
    const hit = hitPoint(img);
    const selPoint = points.find((p) => p.id === selected);
    if (mode === 'pupils') {
      const which = hitPupil(img);
      gesture.current = which ? { kind: 'pupil', which } : { kind: 'tap', start: { x: e.clientX, y: e.clientY }, moved: false };
      if (which) snapshot();
    } else if (mode === 'point' && hit) {
      setSelected(hit);
      snapshot();
      gesture.current = { kind: 'move', id: hit };
    } else if (mode === 'direction' && (hit || (selPoint && screenDist(selPoint.px, img) < HIT * 2))) {
      // 方向模式：从点上（或已选点附近）拖动
      const id = hit ?? selPoint!.id;
      setSelected(id);
      snapshot();
      gesture.current = { kind: 'dir', id };
    } else {
      gesture.current = { kind: 'tap', start: { x: e.clientX, y: e.clientY }, hit, moved: false };
    }
  }

  function onMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!b) return;
      const s = Math.min(6, Math.max(1, (g.s0 * Math.hypot(a.x - b.x, a.y - b.y)) / g.d0));
      const mid = toViewBox({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      // 让双指起始时中点下的图像位置保持在当前中点下
      setView(clampView({ s, tx: mid.x - g.anchor.x * s, ty: mid.y - g.anchor.y * s }));
      return;
    }
    const img = clampImg(toImage(e));
    if (g.kind === 'tap') {
      if (Math.hypot(e.clientX - g.start.x, e.clientY - g.start.y) > DRAG) {
        gesture.current = view.s > 1 ? { kind: 'pan', last: toViewBox(e) } : null;
      }
    } else if (g.kind === 'pan') {
      const v = toViewBox(e);
      setView((cur) => clampView({ ...cur, tx: cur.tx + v.x - g.last.x, ty: cur.ty + v.y - g.last.y }));
      g.last = v;
    } else if (g.kind === 'move' && pupils) {
      setPoint(g.id, { px: img, norm: toNorm(img, pupils) });
    } else if (g.kind === 'dir' && pupils) {
      const p = points.find((q) => q.id === g.id);
      if (!p) return;
      const v = { x: img.x - p.px.x, y: img.y - p.px.y };
      if (Math.hypot(v.x, v.y) / k > 12) setPoint(g.id, { direction: toNormDirection(v, pupils) });
    } else if (g.kind === 'pupil' && pupils) {
      const other = g.which === 'left' ? pupils.right : pupils.left;
      if (g.which === 'left') setPupils(img, other);
      else setPupils(other, img);
    }
  }

  function onUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) {
      // 双指松开一指后不再继续缩放
      if (g?.kind === 'pinch') gesture.current = null;
      return;
    }
    gesture.current = null;
    if (!g || g.kind !== 'tap') return;
    const img = clampImg(toImage(e));
    if (mode === 'pupils') {
      if (!pending) setPending(img);
      else {
        snapshot();
        setPupils(pending, img);
        setPending(null);
        setMode('point');
      }
    } else if (g.hit) {
      setSelected(g.hit);
    } else if (mode === 'point') {
      addPoint(img);
    } else {
      setSelected(null);
    }
  }

  function onCancel(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    gesture.current = null;
  }

  // ---- 绘制 ----
  const sel = points.find((p) => p.id === selected);
  const r = 9 * k;
  const issues = pointDoseIssues(c);
  const numbering = useMemo(() => new Map(points.map((p, i) => [p.id, i + 1])), [points]);

  function arrow(p: InjectionPoint, color: string) {
    if (!p.direction || !pupils) return null;
    const d = Math.hypot(pupils.right.x - pupils.left.x, pupils.right.y - pupils.left.y);
    const u = fromNormDirection(p.direction, pupils);
    const L = Math.max(d * 0.3, 36 * k);
    const end = { x: p.px.x + u.x * L, y: p.px.y + u.y * L };
    const head = (ang: number) => {
      const c2 = Math.cos(ang), s2 = Math.sin(ang);
      const hx = -u.x * c2 + u.y * s2, hy = -u.x * s2 - u.y * c2;
      return `L${end.x + hx * 9 * k} ${end.y + hy * 9 * k}`;
    };
    const fan = (ang: number) => {
      const c2 = Math.cos(ang), s2 = Math.sin(ang);
      const fx = u.x * c2 - u.y * s2, fy = u.x * s2 + u.y * c2;
      return <path d={`M${p.px.x} ${p.px.y}L${p.px.x + fx * L * 0.95} ${p.px.y + fy * L * 0.95}`} stroke={color}
        stroke-width={1.4 * k} stroke-dasharray={`${3 * k} ${3 * k}`} stroke-linecap="round" />;
    };
    return (
      <g>
        {p.fan && fan(0.42)}
        {p.fan && fan(-0.42)}
        <path d={`M${p.px.x} ${p.px.y}L${end.x} ${end.y}`} stroke={color} stroke-width={2.4 * k} stroke-linecap="round" />
        <path d={`M${end.x} ${end.y}${head(0.5)}M${end.x} ${end.y}${head(-0.5)}`} stroke={color} stroke-width={2.4 * k}
          stroke-linecap="round" fill="none" />
      </g>
    );
  }

  const noTreatments = c.treatments.length === 0;

  return (
    <section class="card annot">
      <div class="between" style={{ alignItems: 'baseline' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>针位标注 · 术前正面照</h2>
        <span class="mono muted" style={{ fontSize: 12 }}>{points.length} 个点</span>
      </div>

      {noTreatments ? (
        <p class="notice">先在第 2 步添加注射记录，进针点要归属到某一条记录。</p>
      ) : mode === 'pupils' ? (
        <div class="pupil-tip">
          <span>{pending ? '再点另一只瞳孔中心' : pupils ? '拖动瞳孔标记微调，或依次重新点两只瞳孔' : '先依次点两只瞳孔中心，作为坐标基准'}</span>
          {pupils && <button class="linkbtn" onClick={() => { setPending(null); setMode('point'); }}>完成</button>}
        </div>
      ) : (
        <div class="row" style={{ gap: 6 }}>
          <button class={`opt modebtn ${mode === 'point' ? 'on' : ''}`} onClick={() => setMode('point')}>① 点进针点</button>
          <button class={`opt modebtn ${mode === 'direction' ? 'on' : ''}`} onClick={() => setMode('direction')}>② 拖出方向</button>
          <button class="opt undo" aria-label="撤销" disabled={!history.length} onClick={undo}><IconUndo /></button>
        </div>
      )}

      <div class="annot-box" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          class={`annot-svg mode-${mode}`}
          role="img"
          aria-label={`术前正面照，${points.length} 个进针点`}
          onPointerDown={noTreatments ? undefined : onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancel}
        >
          <rect width={W} height={H} fill="#D3DCE0" />
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.s})`}>
            {url && <image href={url} width={W} height={H} />}
            {pupils && (
              <g>
                <path d={`M${pupils.left.x} ${pupils.left.y}L${pupils.right.x} ${pupils.right.y}`} stroke="#1C6670"
                  stroke-width={1.2 * k} stroke-dasharray={`${4 * k} ${4 * k}`} />
                {(['left', 'right'] as const).map((w) => (
                  <g key={w}>
                    <circle cx={pupils[w].x} cy={pupils[w].y} r={(mode === 'pupils' ? 10 : 6) * k} fill="none" stroke="#1C6670" stroke-width={1.6 * k} />
                    <path d={`M${pupils[w].x - 3 * k} ${pupils[w].y}h${6 * k}M${pupils[w].x} ${pupils[w].y - 3 * k}v${6 * k}`} stroke="#1C6670" stroke-width={1.2 * k} />
                  </g>
                ))}
                <text x={Math.max(pupils.left.x, pupils.right.x) + 8 * k} y={(pupils.left.y + pupils.right.y) / 2 - 10 * k}
                  font-size={10 * k} font-family="IBM Plex Mono, monospace" fill="#124A51">基准：瞳孔连线</text>
              </g>
            )}
            {pending && (
              <circle cx={pending.x} cy={pending.y} r={10 * k} fill="none" stroke="#1C6670" stroke-width={2 * k} />
            )}
            {points.map((p) => {
              const [color] = treatmentColor(c, p.treatmentId);
              const isSel = p.id === selected;
              return (
                <g key={p.id}>
                  {arrow(p, color)}
                  <circle cx={p.px.x} cy={p.px.y} r={isSel ? r : r * 0.6} fill={color} stroke="#fff" stroke-width={(isSel ? 2 : 1.4) * k} />
                  {isSel && (
                    <text x={p.px.x} y={p.px.y + 3.5 * k} text-anchor="middle" font-size={10 * k} font-family="IBM Plex Mono, monospace" fill="#fff">
                      {numbering.get(p.id)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {!url && <span class="annot-loading">载入照片…</span>}
        {view.s > 1 && (
          <button class="zoom-reset mono" onClick={() => setView({ s: 1, tx: 0, ty: 0 })}>{view.s.toFixed(1)}× 复位</button>
        )}
      </div>

      {pupils && mode !== 'pupils' && (
        <div class="between" style={{ fontSize: 12 }}>
          <span class="muted">双指缩放，点住进针点可拖动</span>
          <button class="linkbtn" style={{ fontSize: 12 }} onClick={() => { setMode('pupils'); setSelected(null); }}>调整瞳孔基准</button>
        </div>
      )}

      {sel && pupils && (
        <PointPanel c={c} p={sel} n={numbering.get(sel.id)!}
          onChange={(patch) => {
            if (patch.treatmentId) setLastTreatment(patch.treatmentId);
            setPoint(sel.id, patch);
          }}
          onDelete={() => {
            snapshot();
            update((x) => ({ ...x, points: x.points.filter((q) => q.id !== sel.id) }));
            setSelected(null);
          }}
        />
      )}

      {pupils && issues.length > 0 && (
        <ul class="dose-issues">
          {issues.map((i) => {
            const t = c.treatments.find((x) => x.id === i.treatmentId)!;
            const name = `${areaLabel(t.area)}${t.side !== 'mid' ? sideLabel(t.area, t.side) : ''}`;
            return (
              <li key={i.treatmentId}>
                <span class="dot" style={{ background: treatmentColor(c, t.id)[0] }} />
                {i.count === 0 ? (
                  <span>{name}：还没有标注进针点</span>
                ) : (
                  <span>{name}：各点合计 <b class="mono">{formatDose(i.sum, t.unit)}</b> / 记录 <b class="mono">{formatDose(i.dose, t.unit)} {t.unit}</b></span>
                )}
                {i.count > 0 && (
                  <button class="linkbtn" onClick={() => {
                    snapshot();
                    update((x) => distribute(x, t.id));
                  }}>平均分配</button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p class="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
        点的位置会换算成以瞳孔连线为基准、瞳距为单位的坐标，不同人的脸可以直接比较。各点剂量合计会自动核对注射记录里的总量。
      </p>
    </section>
  );
}

/** 把记录总量平均分到它的各个点（最后一个点吸收舍入误差） */
function distribute(c: Case, treatmentId: string): Case {
  const t = c.treatments.find((x) => x.id === treatmentId)!;
  const ids = c.points.filter((p) => p.treatmentId === treatmentId).map((p) => p.id);
  const step = t.unit === 'U' ? 0.5 : 0.01;
  const each = Math.floor(t.dose / ids.length / step) * step;
  const last = Math.round((t.dose - each * (ids.length - 1)) * 100) / 100;
  return {
    ...c,
    points: c.points.map((p) => {
      const i = ids.indexOf(p.id);
      if (i < 0) return p;
      return { ...p, dose: i === ids.length - 1 ? last : Math.round(each * 100) / 100 };
    }),
  };
}

function AngleDiagram({ angle }: { angle: number }) {
  // 皮肤截面示意：表皮线 y=34，针从 (54,34) 以给定夹角刺入
  const a = (angle * Math.PI) / 180;
  const ex = 54, ey = 34;
  const out = { x: ex - 40 * Math.cos(a), y: ey - 40 * Math.sin(a) };
  const inn = { x: ex + 22 * Math.cos(a), y: ey + 22 * Math.sin(a) + (angle === 0 ? 3 : 0) };
  return (
    <svg width="88" height="100" viewBox="0 0 88 100" role="img" aria-label={`示意：针与皮肤约 ${angle} 度`}
      style={{ flex: 'none', background: '#F3F5F4', borderRadius: 8 }}>
      <rect x="0" y="34" width="88" height="66" fill="#F0D9C2" />
      <rect x="0" y="34" width="88" height="6" fill="#E8C9AE" />
      <rect x="0" y="82" width="88" height="18" fill="#E3E9E7" />
      <path d="M0 34H88" stroke="#7B5A44" stroke-width="1" />
      <path d={`M${out.x} ${angle === 0 ? ey + 3 : out.y}L${inn.x} ${inn.y}`} stroke="#1C6670" stroke-width="2.4" stroke-linecap="round" />
      {angle > 0 && <path d={`M${ex - 14} ${ey} A14 14 0 0 1 ${ex - 14 * Math.cos(a)} ${ey - 14 * Math.sin(a)}`} fill="none" stroke="#18211F" stroke-width="1" />}
      <text x="84" y="16" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="11" fill="#18211F">{angle === 0 ? '≈0°' : `${angle}°`}</text>
      <text x="84" y="96" text-anchor="end" font-size="8" fill="#5B6866">骨</text>
    </svg>
  );
}

function PointPanel({ c, p, n, onChange, onDelete }: {
  c: Case; p: InjectionPoint; n: number; onChange: (p: Partial<InjectionPoint>) => void; onDelete: () => void;
}) {
  const t = c.treatments.find((x) => x.id === p.treatmentId);
  const unit = t?.unit ?? 'mL';
  return (
    <div class="ppanel">
      <div class="between">
        <b style={{ fontSize: 15 }}>点 {n} · {t ? areaLabel(t.area) : '—'}</b>
        <span class="mono muted" style={{ fontSize: 12 }}>({p.norm.x.toFixed(2)}, {p.norm.y.toFixed(2)}) 瞳距</span>
      </div>
      <div class="row" style={{ gap: 12 }}>
        <AngleDiagram angle={p.angle} />
        <div class="stack" style={{ gap: 6, flex: 1 }}>
          <span class="muted" style={{ fontSize: 12 }}>进针角度（针与皮肤）</span>
          <OptionGroup class="grid2 angles" optClass="mono" style={{ gap: 6 }}
            options={ANGLES.map((a) => ({ value: a.value, label: a.label }))}
            value={p.angle} onChange={(angle) => onChange({ angle })} />
        </div>
      </div>
      <div class="pgrid muted">
        <div class="stack" style={{ gap: 2 }}>方向
          <button class={`dirbtn ${p.fan ? 'on' : ''}`} aria-pressed={p.fan} onClick={() => onChange({ fan: !p.fan })} title="切换扇形">
            {directionLabel(p.direction, p.fan)}
            <span class="fan-tag">{p.fan ? '扇形✓' : '扇形'}</span>
          </button>
        </div>
        <div class="stack" style={{ gap: 2 }}>层次
          <TextSelect ariaLabel="层次" value={p.layer} onChange={(layer: LayerCode) => onChange({ layer })}
            options={LAYERS.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
        <div class="stack" style={{ gap: 2 }}>手法
          <TextSelect ariaLabel="手法" value={p.technique} onChange={(technique: Technique) => onChange({ technique })}
            options={TECHNIQUES.map((x) => ({ value: x.code, label: x.label }))} />
        </div>
        <div class="stack" style={{ gap: 2 }}>本点剂量
          <span class="row" style={{ gap: 3 }}>
            <NumberField class="pdose mono" ariaLabel="本点剂量" value={p.dose} onChange={(dose) => onChange({ dose })}
              format={(v) => formatDose(v, unit)} />
            <span class="mono" style={{ fontSize: 12, color: 'var(--ink)' }}>{unit}</span>
          </span>
        </div>
      </div>
      <div class="between" style={{ fontSize: 12 }}>
        <span class="row muted" style={{ gap: 6 }}>归属
          <TextSelect ariaLabel="归属注射记录" value={p.treatmentId}
            onChange={(treatmentId) => {
              const nt = c.treatments.find((x) => x.id === treatmentId);
              onChange({ treatmentId, layer: nt?.layer ?? p.layer });
            }}
            options={c.treatments.map((x) => ({
              value: x.id, label: `${areaLabel(x.area)} · ${sideLabel(x.area, x.side)} · ${layerLabel(x.layer)}`,
            }))} />
        </span>
        <button class="linkbtn" style={{ color: 'var(--danger)', fontSize: 12 }} onClick={onDelete}>删除此点</button>
      </div>
    </div>
  );
}
