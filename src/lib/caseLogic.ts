// 病例的派生状态与摘要，纯函数，界面和导出共用。
import {
  type Case, type CaseStatus, type Phase, type View, type Followup,
  STANDARD_VIEWS, EXPRESSION_VIEWS, MAX_ML, areaLabel, categoryLabel,
} from './model';
import { addDays, daysBetween, isoDate } from './dates';

export function newCase(id: string, now: Date): Case {
  const today = isoDate(now);
  return {
    id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: 'draft',
    consent: { research: false, aiTraining: false, formNo: '', signedOn: today },
    subject: {
      ageBand: null, sex: null, fitzpatrick: null, smoker: false, priorInjection: 'none',
      priorWhen: '', priorArea: '', priorProduct: '',
    },
    treatmentDate: today,
    treatments: [],
    points: [],
    photos: [],
  };
}

export const hasBoNT = (c: Case) => c.treatments.some((t) => t.category === 'BoNT');

/** 每个阶段必拍的角度：5 个标准角度；肉毒素病例另加 3 张表情照 */
export function requiredViews(c: Case): View[] {
  return hasBoNT(c) ? [...STANDARD_VIEWS, ...EXPRESSION_VIEWS] : STANDARD_VIEWS;
}

export function photoFor(c: Case, phase: Phase, view: View) {
  return c.photos.find((p) => p.phase === phase && p.view === view);
}

export function photoProgress(c: Case, phase: Phase) {
  const req = requiredViews(c);
  return { done: req.filter((v) => photoFor(c, phase, v)).length, total: req.length };
}

export function flaggedCount(c: Case, phase?: Phase): number {
  return c.photos.filter((p) => (!phase || p.phase === phase) && p.quality.flags.length > 0).length;
}

export function consentDone(c: Case): boolean {
  const { consent: k, subject: s } = c;
  return k.research && !!k.formNo.trim() && !!k.signedOn && !!s.ageBand && !!s.sex && !!s.fitzpatrick;
}

export function treatmentsDone(c: Case): boolean {
  return c.treatments.length > 0 && c.treatments.every((t) => t.dose > 0);
}

export function prePhotosDone(c: Case): boolean {
  const p = photoProgress(c, 'pre');
  return p.done === p.total;
}

export function stepDone(c: Case): [boolean, boolean, boolean, boolean] {
  return [consentDone(c), treatmentsDone(c), prePhotosDone(c), c.status === 'complete'];
}

/** 根据内容推导状态；“已完成”只能由用户在第 4 步设置，前置条件被破坏时回退 */
export function deriveStatus(c: Case): CaseStatus {
  const ready = consentDone(c) && treatmentsDone(c) && prePhotosDone(c);
  if (!ready) return 'draft';
  return c.status === 'complete' ? 'complete' : 'awaiting_followup';
}

export function draftReason(c: Case): string {
  if (!consentDone(c)) return '缺同意';
  if (!treatmentsDone(c)) return '缺记录';
  if (!prePhotosDone(c)) return '缺术前照';
  return '';
}

export function caseTitle(c: Case): string {
  const areas = [...new Set(c.treatments.map((t) => t.area))];
  return areas.length ? areas.map(areaLabel).join(' · ') : '未填写部位';
}

export function formatDose(n: number, unit: 'mL' | 'U'): string {
  const r = Math.round(n * 100) / 100;
  if (unit === 'U') return String(Math.round(r * 10) / 10);
  return Number.isInteger(r * 10) ? r.toFixed(1) : r.toFixed(2);
}

export function doseSummary(c: Case): string {
  const groups = new Map<string, { label: string; unit: 'mL' | 'U'; doses: number[] }>();
  for (const t of c.treatments) {
    const g = groups.get(t.category) ?? { label: categoryLabel(t.category), unit: t.unit, doses: [] };
    g.doses.push(t.dose);
    groups.set(t.category, g);
  }
  return [...groups.values()]
    .map(({ label, unit, doses }) => {
      const f = doses.map((d) => formatDose(d, unit));
      const body = f.length > 1 && f.every((x) => x === f[0]) ? `${f.length} × ${f[0]}` : f.join(' + ');
      return `${label} ${body} ${unit}`;
    })
    .join('；');
}

/** 建议复诊窗口（天）：玻尿酸/其他 14–28，纯肉毒素 14 天左右 */
export function followupWindow(c: Case): { start: number; end: number } {
  const onlyBoNT = c.treatments.length > 0 && c.treatments.every((t) => t.category === 'BoNT');
  return onlyBoNT ? { start: 10, end: 18 } : { start: 14, end: 28 };
}

export function suggestedFollowupDate(c: Case): string {
  return addDays(c.treatmentDate, 14);
}

export function emptyFollowup(date: string, treatmentDate: string): Followup {
  return { date, dayN: daysBetween(treatmentDate, date), gais: null, satisfaction: null, adverse: [], note: '' };
}

export function setFollowupDate(c: Case, date: string): Case {
  const f = c.followup ?? emptyFollowup(date, c.treatmentDate);
  return { ...c, followup: { ...f, date, dayN: daysBetween(c.treatmentDate, date) } };
}

export function inWindow(c: Case): boolean {
  if (!c.followup) return false;
  const w = followupWindow(c);
  return c.followup.dayN >= w.start && c.followup.dayN <= w.end;
}

export function followupChecks(c: Case) {
  const pre = photoProgress(c, 'pre');
  const fu = photoProgress(c, 'followup');
  const consent = consentDone(c);
  const treatments = treatmentsDone(c);
  const evaluation = !!c.followup?.gais && !!c.followup?.satisfaction;
  const basics = consent && treatments && pre.done === pre.total;
  return {
    consent,
    treatments,
    pre,
    followupPhotos: fu,
    window: inWindow(c),
    evaluation,
    skipped: !!c.followupSkipped,
    // 复诊窗口只做标记，不阻止完成；无复诊的病例不检查复诊照和评估
    canComplete: basics && (!!c.followupSkipped || (fu.done === fu.total && evaluation)),
  };
}

/** 剂量上限：mL 不超过 MAX_ML，U 不设上限 */
export function clampDose(n: number, unit: 'mL' | 'U'): number {
  const v = Math.max(0, Number.isFinite(n) ? n : 0);
  return unit === 'mL' ? Math.min(MAX_ML, v) : v;
}

/** 同一条注射记录下各点剂量之和与记录总量不一致的情况 */
export function pointDoseIssues(c: Case) {
  return c.treatments
    .map((t) => {
      const pts = c.points.filter((p) => p.treatmentId === t.id);
      const sum = Math.round(pts.reduce((s, p) => s + p.dose, 0) * 1000) / 1000;
      return { treatmentId: t.id, sum, dose: t.dose, count: pts.length };
    })
    .filter((x) => Math.abs(x.sum - x.dose) > 1e-6);
}
