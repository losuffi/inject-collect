import { useEffect, useState } from 'preact/hooks';

/** 数字输入：保留用户正在输入的文本（如 "0."），合法时才回写数值 */
export function NumberField(props: {
  value: number;
  onChange: (n: number) => void;
  class?: string;
  style?: Record<string, string | number>;
  ariaLabel: string;
  format?: (n: number) => string;
}) {
  const fmt = props.format ?? String;
  const [text, setText] = useState(fmt(props.value));
  useEffect(() => {
    if (parseFloat(text) !== props.value) setText(props.value ? fmt(props.value) : '');
  }, [props.value]);
  return (
    <input
      class={props.class}
      style={props.style}
      inputMode="decimal"
      aria-label={props.ariaLabel}
      value={text}
      placeholder="0"
      onInput={(e) => {
        const t = e.currentTarget.value.replace(/[^\d.]/g, '');
        setText(t);
        const n = parseFloat(t);
        props.onChange(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
      onBlur={() => setText(props.value ? fmt(props.value) : '')}
    />
  );
}
