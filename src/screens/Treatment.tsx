import type { StepProps } from './types';
import {
  AREAS, CATEGORIES, LAYERS, MAX_ML, TOOLS, areaLabel, sideLabel, treatmentColor, unitFor,
  type AreaCode, type Case, type Category, type LayerCode, type Photo, type Side, type Treatment,
} from '../lib/model';
import { clampDose, formatDose, photoFor, pointDoseIssues, setFollowupDate } from '../lib/caseLogic';
import { uid } from '../lib/ids';
import { caseHref, go } from '../router';
import { FaceMap } from '../components/FaceMap';
import { NumberField } from '../components/NumberField';
import { TextSelect } from '../components/TextSelect';
import { PointsPreview } from '../components/PointsPreview';
import { PointEditor } from '../components/PointEditor';
import { TakeFrontPhoto } from '../components/TakeFrontPhoto';
import './steps.css';

// 标注编辑器通过 ?mark=<记录 id | all> 打开，手机返回键即可关闭
let editorPushed = false;

export function TreatmentStep({ c, update, flush, query }: StepProps) {
  const patch = (id: string, p: Partial<Treatment>) =>
    update((x) => ({ ...x, treatments: x.treatments.map((t) => (t.id === id ? { ...t, ...p } : t)) }));

  const front = photoFor(c, 'pre', 'front');
  const mark = query.get('mark');
  if (!mark) editorPushed = false; // 用返回键关闭时也复位
  const openEditor = (tid: string) => {
    editorPushed = true;
    location.hash = caseHref(c.id, 'treatment', `mark=${encodeURIComponent(tid)}`);
  };
  const closeEditor = () => {
    flush();
    if (editorPushed) {
      editorPushed = false;
      history.back();
    } else {
      go(caseHref(c.id, 'treatment'), true);
    }
  };

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

      <div class="card row" style={{ gap: 14, padding: 12, alignItems: 'flex-start' }}>
        {front ? (
          <button class="pts-summary" onClick={() => openEditor('all')} aria-label="打开正面照查看和编辑全部针孔">
            <PointsPreview c={c} photo={front} aspect={3 / 4} label={`术前正面照，共 ${c.points.length} 个针孔`} />
          </button>
        ) : (
          <FaceMap c={c} />
        )}
        <div class="stack" style={{ gap: 8, fontSize: 13, lineHeight: 1.5, color: 'var(--ink2)', minWidth: 0 }}>
          {c.treatments.map((t) => (
            <span key={t.id} class="row" style={{ gap: 6 }}>
              <span class="dot" style={{ background: treatmentColor(c, t.id)[0] }} />
              <span>
                {areaLabel(t.area)}{t.side !== 'mid' && sideLabel(t.area, t.side)} · {c.points.filter((p) => p.treatmentId === t.id).length} 个针孔
              </span>
            </span>
          ))}
          {front ? (
            <span class="muted" style={{ fontSize: 12 }}>针孔标在术前正面照上。点左侧照片查看全部，或在下面每条记录里标注。</span>
          ) : (<>
            <span class="muted" style={{ fontSize: 12 }}>拍一张术前正面照，就能把每条注射的针孔直接点在照片上。</span>
            <TakeFrontPhoto update={update} flush={flush} />
          </>)}
        </div>
      </div>

      {c.treatments.map((t) => (
        <TreatmentCard key={t.id} c={c} t={t} front={front} onMark={() => openEditor(t.id)}
          onPatch={(p) => patch(t.id, p)} onRemove={() => remove(t)} />
      ))}

      {mark && front && (mark === 'all' || c.treatments.some((t) => t.id === mark)) && (
        <PointEditor c={c} photo={front} treatmentId={mark === 'all' ? undefined : mark} update={update} onClose={closeEditor} />
      )}

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
  return MAX_ML;
}

function TreatmentCard({ c, t, front, onMark, onPatch, onRemove }: {
  c: Case; t: Treatment; front?: Photo; onMark: () => void; onPatch: (p: Partial<Treatment>) => void; onRemove: () => void;
}) {
  const [color, fill] = treatmentColor(c, t.id);
  const max = scaleMax(t);
  const pct = Math.min(100, (t.dose / max) * 100);
  const pointCount = c.points.filter((p) => p.treatmentId === t.id).length;
  const issue = pointDoseIssues(c).find((i) => i.treatmentId === t.id);
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
        <div class="between" style={{ fontSize: 12 }}>
          <span class="muted">针孔位置</span>
          {front && pointCount > 0 && <button class="linkbtn" style={{ fontSize: 12, padding: 0 }} onClick={onMark}>编辑针孔</button>}
        </div>
        {!front ? (
          <span class="muted" style={{ fontSize: 12 }}>先拍术前正面照（上方或第 3 步），再把针孔标在照片上</span>
        ) : pointCount === 0 ? (
          <button class="btn dashed small" onClick={onMark}>+ 在正面照上标注针孔</button>
        ) : (
          <button class="pts-card" onClick={onMark} aria-label={`${pointCount} 个针孔，点按编辑`}>
            <PointsPreview c={c} photo={front} treatmentId={t.id} aspect={16 / 10}
              label={`${areaLabel(t.area)}的 ${pointCount} 个针孔`} />
            <span class="pts-count mono">{pointCount} 个针孔</span>
          </button>
        )}
        {issue && issue.count > 0 && (
          <span class="warn-text" style={{ fontSize: 12 }}>
            各针孔剂量合计 <span class="mono">{formatDose(issue.sum, t.unit)}</span>，与本条总量
            <span class="mono"> {formatDose(issue.dose, t.unit)} {t.unit}</span> 不一致
          </span>
        )}
      </div>

      <div class="stack" style={{ gap: 6 }}>
        <div class="between" style={{ alignItems: 'baseline' }}>
          <span class="muted" style={{ fontSize: 12 }}>剂量</span>
          <span class="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <NumberField class="dose-input mono" ariaLabel="剂量" value={t.dose} onChange={(dose) => onPatch({ dose: clampDose(dose, t.unit) })}
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
            onInput={(e) => onPatch({ dose: clampDose(Math.round(parseFloat(e.currentTarget.value) * 100) / 100, t.unit) })} />
        </div>
        <div class="between mono muted" style={{ fontSize: 11 }}>
          <span>0</span><span>{formatDose(max / 2, t.unit)}</span><span>{formatDose(max, t.unit)} {t.unit}</span>
        </div>
        {t.unit === 'mL' && t.dose >= MAX_ML && (
          <span class="muted" style={{ fontSize: 12 }}>单条记录最多 {MAX_ML} mL，超过请再添加一条记录</span>
        )}
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
        <div class="stack" style={{ gap: 2 }}>针孔数
          <b class="mono" style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>{pointCount}</b>
        </div>
      </div>
      <button class="linkbtn" style={{ alignSelf: 'flex-end', color: 'var(--muted)', fontSize: 12 }} onClick={onRemove}>删除这条</button>
    </article>
  );
}
