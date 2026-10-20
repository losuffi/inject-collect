import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import type { Case, CaseStatus } from '../lib/model';
import { stepDone } from '../lib/caseLogic';
import { caseHref, STEPS, type Step } from '../router';
import { IconBack, IconCheck } from './icons';

const STEP_LABELS: Record<Step, string> = { consent: '1 同意', treatment: '2 记录', photos: '3 照片', followup: '4 复诊' };

export function StatusBadge({ status }: { status: CaseStatus }) {
  if (status === 'complete') return <span class="badge ok">已完成</span>;
  if (status === 'awaiting_followup') return <span class="badge warn">待复诊</span>;
  return <span class="badge gray">草稿</span>;
}

/** 病例页顶部：返回、编号、状态，以及可自由跳转的 1–4 步骤条 */
export function CaseHeader({ c, step }: { c: Case; step: Step }) {
  const done = stepDone(c);
  return (
    <header class="casehead">
      <div class="top">
        <a class="back" href="#/"><IconBack />病例</a>
        <span class="mono" style={{ fontSize: 15 }}>{c.id}</span>
        <StatusBadge status={c.status} />
      </div>
      <nav class="steps" aria-label="步骤">
        {STEPS.map((s, i) => (
          <a key={s} href={caseHref(c.id, s)} class={s === step ? 'on' : ''} aria-current={s === step ? 'step' : undefined}>
            {STEP_LABELS[s]}
            {done[i] && s !== step && <IconCheck />}
            {done[i] && <span class="sr-only">（已完成）</span>}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function Sheet({ onClose, children, label }: { onClose?: () => void; children: ComponentChildren; label: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  return msg ? <div class="toast" role="status">{msg}</div> : null;
}

/** 选项组：单选按钮的外观 */
export function OptionGroup<T extends string | number>(props: {
  options: { value: T; label: ComponentChildren; aria?: string }[];
  value: T | null | undefined;
  onChange: (v: T) => void;
  class?: string;
  optClass?: string;
  style?: Record<string, string | number>;
}) {
  return (
    <div class={props.class} style={props.style} role="radiogroup">
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === props.value}
          aria-label={o.aria}
          class={`opt ${props.optClass ?? ''} ${o.value === props.value ? 'on' : ''}`}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
