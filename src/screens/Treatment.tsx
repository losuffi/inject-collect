import type { StepProps } from './types';
import {
  AREAS, CATEGORIES, LAYERS, TOOLS, areaLabel, sideLabel, treatmentColor, unitFor,
  type AreaCode, type Case, type Category, type LayerCode, type Side, type Treatment,
} from '../lib/model';
import { formatDose, setFollowupDate } from '../lib/caseLogic';
import { uid } from '../lib/ids';
import { caseHref } from '../router';
import { FaceMap } from '../components/FaceMap';
import { NumberField } from '../components/NumberField';
import { TextSelect } from '../components/TextSelect';
import './steps.css';

export function TreatmentStep({ c, update }: StepProps) {
  const patch = (id: string, p: Partial<Treatment>) =>
    update((x) => ({ ...x, treatments: x.treatments.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  // iOS 的日期选择器有时只触发 change；改治疗日后复诊天数随之重算
  function setTreatmentDate(v: string) {
    if (!v || v === c.treatmentDate) return;
    update((x) => {
      const next = { ...x, treatmentDate: v };
      return next.followup ? setFollowupDate(next, next.followup.date) : next;
    });
  }

  function add() {
    const prev = c.treatments[c.treatments.length - 1];
    const t: Treatment = {
      id: uid('t_'), area: prev?.area ?? 'chin', side: 'mid', category: prev?.category ?? 'HA', product: prev?.product ?? '',
      lot: prev?.lot ?? '', dose: 0, unit: unitFor(prev?.category ?? 'HA'), layer: prev?.layer ?? 'supraperiosteal', tool: prev?.tool ?? '',
    };
    update((x) => ({ ...x, treatments: [...x.treatments, t] }));
    requestAnimationFrame(() => document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  function remove(t: Treatment) {
    const n = c.points.filter((p) => p.treatmentId === t.id).length;
    const what = `${areaLabel(t.area)} · ${sideLabel(t.area, t.side)}`;
    if (!confirm(n ? `删除“${what}”？它的 ${n} 个进针点标注也会一起删除。` : `删除“${what}”？`)) return;
    update((x) => ({
      ...x,
      treatments: x.treatments.filter((y) => y.id !== t.id),
      points: x.points.filter((p) => p.treatmentId !== t.id),
    }));
  }

  return (
    <main class="page" style={{ gap: 16 }}>
      <div class="between" style={{ alignItems: 'flex-end' }}>
        <h2 class="h2">注射记录</h2>
        <label class="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
          治疗日
          <input type="date" class="inline-date mono" value={c.treatmentDate}
            onInput={(e) => setTreatmentDate(e.currentTarget.value)} onChange={(e) => setTreatmentDate(e.currentTarget.value)} />
        </label>
      </div>

      <div class="card row" style={{ gap: 14, padding: 12 }}>
        <FaceMap c={c} />
        <div class="stack" style={{ gap: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)' }}>
          {c.treatments.map((t) => (
            <span key={t.id} class="row" style={{ gap: 6 }}>
              <span class="dot" style={{ background: treatmentColor(c, t.id)[0] }} />
              <span>
                {areaLabel(t.area)}{t.side !== 'mid' && sideLabel(t.area, t.side)} · {c.points.filter((p) => p.treatmentId === t.id).length} 个进针点
              </span>
            </span>
          ))}
          <span class="muted" style={{ fontSize: 12 }}>位点在第 3 步“针位标注”里直接点在术前照上，这里自动汇总</span>
        </div>
      </div>

      {c.treatments.map((t) => (
        <TreatmentCard key={t.id} c={c} t={t} onPatch={(p) => patch(t.id, p)} onRemove={() => remove(t)} />
      ))}

      <button class="btn dashed" onClick={add}>+ 添加一条注射</button>
      <p class="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
        填充类用 mL，肉毒素用 U，选择类别后单位自动切换。同一部位分左右打的，分两条记录。
      </p>
      <a class="btn primary big" href={caseHref(c.id, 'photos')}>下一步：拍照</a>
    </main>
  );
}

function scaleMax(t: Treatment): number {
  if (t.unit === 'U') return Math.max(20, Math.ceil(t.dose / 10) * 10);
  return Math.max(1, Math.ceil(t.dose));
}

function TreatmentCard({ c, t, onPatch, onRemove }: {
  c: Case; t: Treatment; onPatch: (p: Partial<Treatment>) => void; onRemove: () => void;
}) {
  const [color, fill] = treatmentColor(c, t.id);
  const max = scaleMax(t);
  const pct = Math.min(100, (t.dose / max) * 100);
  const pointCount = c.points.filter((p) => p.treatmentId === t.id).length;
  const tools = t.tool && !TOOLS.includes(t.tool) ? [...TOOLS, t.tool] : TOOLS;

  function setCategory(category: Category) {
    const unit = unitFor(category);
    const p: Partial<Treatment> = { category, unit };
    if (unit !== t.unit) p.dose = 0; // 单位变了，原剂量没有意义
    if (category === 'BoNT') Object.assign(p, { layer: 'intramuscular', tool: t.tool || '锐针 30G' });
    onPatch(p);
  }

  return (
    <article class="card tcard" id={t.id}>
      <div class="between">
        <div class="row" style={{ gap: 8, minWidth: 0 }}>
          <span class="dot" style={{ background: color }} />
          <TextSelect class="title" ariaLabel="部位" value={t.area} onChange={(area: AreaCode) => onPatch({ area })}
            options={AREAS.map((a) => ({ value: a.code, label: a.label }))} />
          <b style={{ fontSize: 16 }}>·</b>
          <TextSelect class="title" ariaLabel="左右" value={t.side} onChange={(side: Side) => onPatch({ side })}
            options={[{ value: 'mid', label: sideLabel(t.area, 'mid') }, { value: 'L', label: '左侧' }, { value: 'R', label: '右侧' }]} />
        </div>
        <select class="badge brand pillselect" aria-label="类别" value={t.category} onChange={(e) => setCategory(e.currentTarget.value as Category)}>
          {CATEGORIES.map((k) => <option key={k.code} value={k.code}>{k.label}</option>)}
        </select>
      </div>

      <div class="grid2" style={{ fontSize: 12 }}>
        <label class="field" style={{ gap: 4 }}>产品与型号
          <input class="input small" value={t.product} placeholder="产品名称 型号" onInput={(e) => onPatch({ product: e.currentTarget.value })} />
        </label>
        <label class="field" style={{ gap: 4 }}>批号
          <input class="input small mono" value={t.lot} placeholder="批号" autoComplete="off" onInput={(e) => onPatch({ lot: e.currentTarget.value })} />
        </label>
      </div>

      <div class="stack" style={{ gap: 6 }}>
        <div class="between" style={{ alignItems: 'baseline' }}>
          <span class="muted" style={{ fontSize: 12 }}>剂量</span>
          <span class="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <NumberField class="dose-input mono" ariaLabel="剂量" value={t.dose} onChange={(dose) => onPatch({ dose })}
              format={(n) => formatDose(n, t.unit)} />
            <span class="mono muted" style={{ fontSize: 14 }}>{t.unit}</span>
          </span>
        </div>
        <div class="gauge">
          <div class="gauge-fill" style={{ width: `${pct}%`, background: fill }} />
          <div class="gauge-ticks" aria-hidden="true">
            {Array.from({ length: 11 }, (_, i) => <span key={i} style={{ height: i === 5 ? 11 : i % 2 ? 5 : 8 }} />)}
          </div>
          <input type="range" min={0} max={max} step={t.unit === 'U' ? 1 : 0.05} value={t.dose} aria-label="拖动调整剂量"
            onInput={(e) => onPatch({ dose: Math.round(parseFloat(e.currentTarget.value) * 100) / 100 })} />
        </div>
        <div class="between mono muted" style={{ fontSize: 11 }}>
          <span>0</span><span>{formatDose(max / 2, t.unit)}</span><span>{formatDose(max, t.unit)} {t.unit}</span>
        </div>
      </div>

      <div class="grid3 muted" style={{ fontSize: 12 }}>
        <div class="stack" style={{ gap: 2 }}>层次
          <TextSelect ariaLabel="层次" value={t.layer} onChange={(layer: LayerCode) => onPatch({ layer })}
            options={LAYERS.map((l) => ({ value: l.code, label: l.label }))} />
        </div>
        <div class="stack" style={{ gap: 2 }}>工具
          <TextSelect ariaLabel="工具" value={t.tool} onChange={(tool) => onPatch({ tool })}
            options={tools.map((x) => ({ value: x, label: x }))} />
        </div>
        <div class="stack" style={{ gap: 2 }}>进针点
          <b class="mono" style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{pointCount}</b>
        </div>
      </div>
      <button class="linkbtn" style={{ alignSelf: 'flex-end', color: 'var(--muted)', fontSize: 12 }} onClick={onRemove}>删除这条</button>
    </article>
  );
}
