/** 看起来像文字的下拉框：显示当前选项文字 + 小箭头，上面覆盖透明的原生 select（手机上弹系统选择器） */
export function TextSelect<T extends string>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  class?: string;
  placeholder?: string;
}) {
  const cur = props.options.find((o) => o.value === props.value);
  return (
    <span class={`tsel ${props.class ?? ''}`}>
      <span class={cur ? '' : 'muted'}>{cur?.label ?? props.placeholder ?? '请选择'}</span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true">
        <path d="M6 9l6 6 6-6" />
      </svg>
      <select aria-label={props.ariaLabel} value={props.value} onChange={(e) => props.onChange(e.currentTarget.value as T)}>
        {!cur && <option value="">{props.placeholder ?? '请选择'}</option>}
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </span>
  );
}
