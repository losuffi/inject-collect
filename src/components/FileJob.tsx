import { useEffect, useRef, useState } from 'preact/hooks';
import { Sheet } from './common';
import { formatBytes, isIOS, saveFile } from '../lib/platform';

export type JobResult = { blob: Blob; name: string; note?: string };

/**
 * 生成文件（导出 / 备份）的底部弹层：显示进度，完成后给出“保存”按钮。
 * iOS 的分享面板必须由点击触发，生成耗时较长时无法自动弹出，所以保留一次点击。
 */
export function FileJobSheet(props: {
  title: string;
  run: (progress: (done: number, total: number) => void) => Promise<JobResult>;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<JobResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const started = useRef(false);

  async function save(r: JobResult) {
    const how = await saveFile(r.blob, r.name);
    if (how !== 'cancelled') {
      setSaved(true);
      props.onSaved?.();
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    props
      .run((d, t) => setProgress(t ? d / t : 0))
      .then((r) => {
        setResult(r);
        if (!isIOS()) void save(r);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <Sheet label={props.title} onClose={result || error ? props.onClose : undefined}>
      <h3>{props.title}</h3>
      {error ? (
        <p class="notice">出错了：{error}</p>
      ) : !result ? (
        <>
          <div class="progress" aria-label="进度"><div style={{ width: `${Math.round(progress * 100)}%` }} /></div>
          <span class="muted" style={{ fontSize: 13 }}>正在打包… {Math.round(progress * 100)}%，请不要离开此页</span>
        </>
      ) : (
        <>
          <div class="stack" style={{ gap: 4, fontSize: 14 }}>
            <span class="mono">{result.name}</span>
            <span class="muted" style={{ fontSize: 13 }}>{formatBytes(result.blob.size)}{result.note ? ` · ${result.note}` : ''}</span>
          </div>
          {saved && <span class="ok-text" style={{ fontSize: 13 }}>已保存。iOS 请在分享面板选择“存储到文件”。</span>}
          <button class="btn primary" onClick={() => save(result)}>
            {isIOS() ? '分享 / 存储到文件' : saved ? '再次下载' : '下载'}
          </button>
        </>
      )}
      {(result || error) && <button class="btn" onClick={props.onClose}>关闭</button>}
    </Sheet>
  );
}
