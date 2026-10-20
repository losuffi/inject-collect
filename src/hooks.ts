import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Case } from './lib/model';
import { getBlob, getCase, putCase } from './lib/db';
import { deriveStatus } from './lib/caseLogic';

/**
 * 加载并编辑一个病例。每次修改立即更新界面，并在 400ms 后自动写入 IndexedDB；
 * 离开页面 / 切到后台时立刻写入。没有“保存”按钮。
 */
export function useCase(id: string) {
  const [c, setC] = useState<Case | null | undefined>(undefined); // undefined = 加载中，null = 不存在
  const latest = useRef<Case | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const dirty = useRef(false);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    if (dirty.current && latest.current) {
      dirty.current = false;
      void putCase(latest.current);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    getCase(id).then((x) => {
      if (!alive) return;
      latest.current = x ?? null;
      setC(x ?? null);
    });
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      alive = false;
      flush();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [id, flush]);

  const update = useCallback((fn: (c: Case) => Case) => {
    const cur = latest.current;
    if (!cur) return;
    const next0 = fn(cur);
    const next = { ...next0, status: deriveStatus(next0), updatedAt: new Date().toISOString() };
    latest.current = next;
    setC(next);
    dirty.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 400);
  }, [flush]);

  return [c, update, flush] as const;
}

/** 从 IndexedDB 读取照片并生成 object URL，卸载时释放 */
export function useBlobUrl(key: string | undefined): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!key) {
      setUrl(undefined);
      return;
    }
    let u: string | undefined;
    let alive = true;
    getBlob(key).then((b) => {
      if (!alive || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [key]);
  return url;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return [msg, show] as const;
}
