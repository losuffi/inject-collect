import { useEffect, useState } from 'preact/hooks';
import { getMeta, getSettings, listCases, setMeta, type Settings } from '../lib/db';
import { readBackup, restoreBackup, type BackupContents } from '../lib/backup';
import { formatBytes, isIOS, isStandalone } from '../lib/platform';
import { markBackedUp, runBackup } from '../lib/jobs';
import { FileJobSheet } from '../components/FileJob';
import { Sheet, Toast } from '../components/common';
import { IconBack } from '../components/icons';
import { useToast } from '../hooks';
import './export.css';

export function SettingsScreen() {
  const [s, setS] = useState<Settings | null>(null);
  const [est, setEst] = useState<{ usage?: number; quota?: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [pendingImport, setPendingImport] = useState<{ data: BackupContents; overwrite: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [toast, showToast] = useToast();

  async function refreshStorage() {
    setEst((await navigator.storage?.estimate?.()) ?? null);
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
  }

  useEffect(() => {
    getSettings().then(setS);
    getMeta<string>('lastBackupAt').then((v) => setLastBackup(v ?? null));
    void refreshStorage();
  }, []);

  function edit(p: Partial<Settings>) {
    const next = { ...s!, ...p };
    setS(next);
    void setMeta('settings', next);
  }

  async function pickBackup(file: File | undefined) {
    if (!file) return;
    try {
      const data = await readBackup(new Uint8Array(await file.arrayBuffer()));
      const existing = new Set((await listCases()).map((c) => c.id));
      setPendingImport({ data, overwrite: data.json.cases.filter((c) => existing.has(c.id)).length });
    } catch (e) {
      showToast(e instanceof Error ? e.message : '无法读取备份文件');
    }
  }

  async function confirmImport() {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const r = await restoreBackup(pendingImport.data);
      showToast(`已导入 ${r.cases} 例、${r.photos} 张照片`);
      setPendingImport(null);
      getSettings().then(setS);
      void refreshStorage();
    } catch (e) {
      showToast(`导入失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div class="sub">
      <header class="subhead-bar">
        <a class="back" href="#/"><IconBack />病例</a>
        <span style={{ fontSize: 15, fontWeight: 500 }}>设置</span>
        <span />
      </header>
      <main class="page" style={{ gap: 20 }}>
        <section class="stack" style={{ gap: 10 }}>
          <h2 class="h2" style={{ fontSize: 16 }}>采集信息</h2>
          {s && (
            <div class="grid2">
              <label class="field">采集人编号
                <input class="input mono" value={s.collector} placeholder="INJ-07" autoComplete="off"
                  onInput={(e) => edit({ collector: e.currentTarget.value.trim() })} />
              </label>
              <label class="field">机构编号
                <input class="input mono" value={s.institution} placeholder="SH-02" autoComplete="off"
                  onInput={(e) => edit({ institution: e.currentTarget.value.trim() })} />
              </label>
            </div>
          )}
          <p class="muted" style={{ margin: 0, fontSize: 12 }}>只显示在首页，不进入数据集。请用编号，不要填姓名。</p>
        </section>

        <section class="card stack" style={{ gap: 10 }}>
          <h2 class="h2" style={{ fontSize: 16 }}>备份与恢复</h2>
          <span class="muted" style={{ fontSize: 13 }}>
            上次备份：{lastBackup ? new Date(lastBackup).toLocaleString('zh-CN', { hour12: false }) : '从未备份'}
          </span>
          <p class="notice" style={{ fontSize: 12 }}>完整备份包含全部病例、照片和同意书编号，用于换手机或防止浏览器清理数据。请存放在安全的位置，不要外传。</p>
          <button class="btn primary" onClick={() => setBackingUp(true)}>完整备份</button>
          <label class="btn filebtn">导入备份
            <input type="file" accept=".zip,application/zip" onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              void pickBackup(f);
            }} />
          </label>
        </section>

        <section class="card stack" style={{ gap: 8, fontSize: 13 }}>
          <h2 class="h2" style={{ fontSize: 16 }}>本机存储</h2>
          <div class="between"><span class="muted">已用</span>
            <span class="mono">{est?.usage !== undefined ? formatBytes(est.usage) : '—'}{est?.quota ? ` / ${formatBytes(est.quota)}` : ''}</span>
          </div>
          <div class="between"><span class="muted">持久存储</span>
            {persisted ? <span class="ok-text">已开启</span> : (
              <button class="linkbtn" onClick={async () => {
                const ok = await navigator.storage?.persist?.();
                setPersisted(!!ok);
                showToast(ok ? '已开启持久存储' : '浏览器未允许，请添加到主屏幕后再试，并定期备份');
              }}>未开启，点此申请</button>
            )}
          </div>
          {isIOS() && !isStandalone() && (
            <p class="notice" style={{ fontSize: 12 }}>
              iPhone 请在 Safari 点「分享」→「添加到主屏幕」，从主屏幕图标打开。未添加时，Safari 可能清理长期未访问网站的数据。
            </p>
          )}
          <p class="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            照片和记录只保存在这台设备的浏览器里，不会上传到任何服务器。清除浏览器数据或卸载会导致数据丢失，请每周备份。
          </p>
        </section>
      </main>

      {backingUp && (
        <FileJobSheet title="完整备份" run={runBackup}
          onSaved={() => { void markBackedUp(); setLastBackup(new Date().toISOString()); }}
          onClose={() => setBackingUp(false)} />
      )}

      {pendingImport && (
        <Sheet label="导入备份" onClose={importing ? undefined : () => setPendingImport(null)}>
          <h3>导入备份</h3>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            备份时间 <span class="mono">{new Date(pendingImport.data.json.exportedAt).toLocaleString('zh-CN', { hour12: false })}</span>，
            共 {pendingImport.data.json.cases.length} 例。
            {pendingImport.overwrite > 0 && <b class="warn-text"> 其中 {pendingImport.overwrite} 例与本机编号相同，会被备份中的版本覆盖。</b>}
            本机其他病例保留不变。
          </p>
          <button class="btn primary" disabled={importing} onClick={confirmImport}>{importing ? '正在导入…' : '确认导入'}</button>
          <button class="btn" disabled={importing} onClick={() => setPendingImport(null)}>取消</button>
        </Sheet>
      )}
      <Toast msg={toast} />
    </div>
  );
}
