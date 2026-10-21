import type { StepProps } from './types';
import { ADVERSE, GAIS, type Case } from '../lib/model';
import { emptyFollowup, followupChecks, followupWindow, setFollowupDate, suggestedFollowupDate } from '../lib/caseLogic';
import { isExportable } from '../lib/dataset';
import { isoDate } from '../lib/dates';
import { caseHref } from '../router';
import { OptionGroup } from '../components/common';
import './steps.css';

const SCALE_DAYS = 56;

export function FollowupStep({ c, update }: StepProps) {
  const f = c.followup;
  const win = followupWindow(c);
  const checks = followupChecks(c);
  const complete = c.status === 'complete';

  const setF = (p: Partial<NonNullable<Case['followup']>>) =>
    update((x) => {
      const base = x.followup ?? emptyFollowup(isoDate(new Date()), x.treatmentDate);
      return { ...x, followup: { ...base, ...p } };
    });

  // iOS 的日期选择器有时只触发 change，所以 input / change 都监听
  const setDate = (v: string) => v && v !== f?.date && update((x) => setFollowupDate(x, v));
  const date = f?.date ?? '';
  const dayN = f?.dayN;
  const inWin = checks.window;
  const pct = (n: number) => `${(Math.min(SCALE_DAYS, Math.max(0, n)) / SCALE_DAYS) * 100}%`;

  const skipped = checks.skipped;
  const fuPhotoCount = c.photos.filter((p) => p.phase === 'followup').length;

  function toggleSkip(on: boolean) {
    if (on && (f || fuPhotoCount)) {
      const what = [f && '复诊评估', fuPhotoCount && `${fuPhotoCount} 张复诊照`].filter(Boolean).join('和');
      if (!confirm(`本例已有${what}。标记为无复诊后，这些内容会保留在本机，但不会导出到数据集。确定吗？`)) return;
    }
    update((x) => ({ ...x, followupSkipped: on }));
  }

  return (
    <main class="page" style={{ gap: 20 }}>
      <label class={`checkcard skipcard ${skipped ? 'on' : ''}`}>
        <input type="checkbox" role="switch" checked={skipped} onChange={(e) => toggleSkip(e.currentTarget.checked)} />
        <span class="stack" style={{ gap: 2 }}>
          <b style={{ fontWeight: 500 }}>本例无复诊</b>
          <span class="muted" style={{ fontSize: 12 }}>
            求美者未复诊、失访或无法获得复诊信息时打开。可以不填复诊信息直接完成病例，数据集中标记为无复诊数据。
          </span>
        </span>
      </label>

      {!skipped && (<>
      <section class="stack" style={{ gap: 10 }}>
        <h2 class="h2">复诊时间</h2>
        <div class="card row fu-time">
          <label class="stack" style={{ gap: 2, flex: 1 }}>
            <span class="muted" style={{ fontSize: 12 }}>复诊日期</span>
            <input type="date" class="fu-date mono" value={date} min={c.treatmentDate}
              onInput={(e) => setDate(e.currentTarget.value)} onChange={(e) => setDate(e.currentTarget.value)} />
          </label>
          <div class="vline" />
          <div class="stack" style={{ gap: 2, flex: 1 }}>
            <span class="muted" style={{ fontSize: 12 }}>距治疗</span>
            {dayN === undefined ? (
              <button class="linkbtn" style={{ textAlign: 'left', fontSize: 14 }}
                onClick={() => update((x) => setFollowupDate(x, isoDate(new Date())))}>设为今天</button>
            ) : (
              <span class={`mono ${inWin ? 'ok-text' : 'warn-text'}`} style={{ fontSize: 18 }}>第 {dayN} 天</span>
            )}
          </div>
        </div>
        <div class="stack" style={{ gap: 6 }}>
          <div class="wbar" aria-hidden="true">
            <div class="wbar-win" style={{ left: pct(win.start), width: `calc(${pct(win.end)} - ${pct(win.start)})` }} />
            {dayN !== undefined && <div class="wbar-mark" style={{ left: pct(dayN) }} />}
          </div>
          <div class="between mono muted" style={{ fontSize: 11 }}>
            <span>0</span><span>14</span><span>28</span><span>42</span><span>56 天</span>
          </div>
          <span class="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            建议窗口：玻尿酸 14–28 天，肉毒素 14 天左右。超出窗口的病例会被标记。
            {!f && <>建议复诊日 <span class="mono">{suggestedFollowupDate(c)}</span>。</>}
            {dayN !== undefined && !inWin && <b class="warn-text">本例不在建议窗口内（{win.start}–{win.end} 天）。</b>}
          </span>
        </div>
      </section>

      <fieldset class="stack" style={{ gap: 6 }}>
        <legend class="legend big">注射师评估（GAIS）</legend>
        {GAIS.slice(0, 3).map((g) => <GaisBtn key={g.value} g={g} on={f?.gais === g.value} onPick={() => setF({ gais: g.value })} />)}
        <div class="grid2" style={{ gap: 6 }}>
          {GAIS.slice(3).map((g) => <GaisBtn key={g.value} g={g} on={f?.gais === g.value} onPick={() => setF({ gais: g.value })} />)}
        </div>
      </fieldset>

      <fieldset>
        <legend class="legend big">求美者满意度</legend>
        <OptionGroup class="sat" optClass="mono"
          options={([1, 2, 3, 4, 5] as const).map((v) => ({ value: v, label: String(v), aria: `${v} 分` }))}
          value={f?.satisfaction} onChange={(satisfaction) => setF({ satisfaction })} />
        <div class="between muted" style={{ fontSize: 11, marginTop: 4 }}><span>很不满意</span><span>非常满意</span></div>
      </fieldset>

      <fieldset>
        <legend class="legend big">不良反应</legend>
        <div class="wrap">
          {ADVERSE.map((a) => {
            const on = !!f?.adverse.includes(a.code);
            return (
              <button key={a.code} class={`opt pill ${on ? 'on' : ''}`} aria-pressed={on}
                onClick={() => setF({ adverse: on ? f!.adverse.filter((x) => x !== a.code) : [...(f?.adverse ?? []), a.code] })}>
                {a.label}{on && ' ✓'}
              </button>
            );
          })}
        </div>
        <input class="input" style={{ marginTop: 10, fontSize: 14 }} placeholder="备注（可选）" value={f?.note ?? ''}
          onInput={(e) => setF({ note: e.currentTarget.value })} />
      </fieldset>
      </>)}

      <section class="card stack" style={{ gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>入库检查</h2>
        <ul class="checks">
          <Check label="同意书" ok={checks.consent} href={caseHref(c.id, 'consent')} />
          <Check label="注射记录" ok={checks.treatments} href={caseHref(c.id, 'treatment')} />
          <Check label="术前照" ok={checks.pre.done === checks.pre.total} text={`${checks.pre.done}/${checks.pre.total}`} href={caseHref(c.id, 'photos')} />
          {skipped ? (
            <li><span>复诊</span><b class="muted" style={{ fontWeight: 500 }}>无复诊 · 跳过</b></li>
          ) : (<>
            <Check label="复诊照" ok={checks.followupPhotos.done === checks.followupPhotos.total}
              text={`${checks.followupPhotos.done}/${checks.followupPhotos.total}`} href={caseHref(c.id, 'photos', 'phase=followup')} />
            <Check label="复诊窗口" ok={checks.window} soft />
            <Check label="评估" ok={checks.evaluation} />
          </>)}
        </ul>
        {!isExportable(c) && (
          <p class="muted" style={{ margin: 0, fontSize: 12 }}>本例未勾选 AI 训练用途，完成后只保存在本机，不进入数据集。</p>
        )}
      </section>

      {complete ? (
        <div class="stack" style={{ gap: 8 }}>
          <div class="done-banner">
            病例已完成{skipped ? '（无复诊）' : ''}{isExportable(c) ? '，下次导出时会进入数据集' : ''}
          </div>
          <button class="btn" onClick={() => update((x) => ({ ...x, status: 'awaiting_followup' }))}>撤回为待复诊，继续修改</button>
        </div>
      ) : (
        <button class="btn primary big" disabled={!checks.canComplete}
          onClick={() => update((x) => ({ ...x, status: 'complete' }))}>
          {skipped ? '完成病例（无复诊）' : isExportable(c) ? '完成病例，加入数据集' : '完成病例'}
        </button>
      )}
      {!complete && !checks.canComplete && (
        <span class="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: -12 }}>
          {skipped ? '同意书、注射记录、术前照齐全后才能完成' : '入库检查全部通过后才能完成（复诊窗口仅提示）'}
        </span>
      )}
    </main>
  );
}

function GaisBtn({ g, on, onPick }: { g: { value: number; label: string }; on: boolean; onPick: () => void }) {
  return (
    <button class={`opt gais ${on ? 'on' : ''}`} role="radio" aria-checked={on} onClick={onPick}>
      <span>{g.label}</span><span class="mono">{g.value}</span>
    </button>
  );
}

function Check({ label, ok, text, href, soft }: { label: string; ok: boolean; text?: string; href?: string; soft?: boolean }) {
  const mark = <b class={`mono ${ok ? 'ok-text' : 'warn-text'}`} style={{ fontWeight: 500 }}>{text ?? (ok ? '✓' : soft ? '超出' : '✗')}</b>;
  return (
    <li>
      {href && !ok ? <a href={href}>{label}</a> : <span>{label}</span>}
      {mark}
    </li>
  );
}
