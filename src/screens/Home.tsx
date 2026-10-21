import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Case, CaseStatus } from '../lib/model';
import { getMeta, getSettings, listCases, putCase, setMeta, type Settings } from '../lib/db';
import {
  caseTitle, doseSummary, draftReason, flaggedCount, newCase, photoProgress, stepDone, suggestedFollowupDate,
} from '../lib/caseLogic';
import { nextCaseId } from '../lib/ids';
import { mmdd } from '../lib/dates';
import { formatBytes, isIOS, isStandalone } from '../lib/platform';
import { caseHref, go, type Step } from '../router';
import { IconDownload, IconGear, IconLock, IconPlus } from '../components/icons';
import { FileJobSheet } from '../components/FileJob';
import { markBackedUp, runBackup } from '../lib/jobs';
import './home.css';

type Filter = 'all' | CaseStatus;
const DAY = 86400000;

export function Home() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null | undefined>(undefined);
  const [usage, setUsage] = useState<number | null>(null);
  const [backingUp, setBackingUp] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(true);

  useEffect(() => {
    listCases().then((cs) => setCases(cs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))));
    getSettings().then(setSettings);
    getMeta<string>('lastBackupAt').then((v) => setLastBackup(v ?? null));
    getMeta<boolean>('installHintDismissed').then((v) => setHintDismissed(!!v));
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null));
  }, []);

  const counts = useMemo(() => {
    const n = { complete: 0, awaiting_followup: 0, draft: 0 };
    for (const c of cases ?? []) n[c.status]++;
    return n;
  }, [cases]);

  async function create() {
    const all = await listCases();
    const c = newCase(nextCaseId(new Date(), all.map((x) => x.id)), new Date());
    await putCase(c);
    go(caseHref(c.id, 'consent'));
  }

  const backupDays = lastBackup ? Math.floor((Date.now() - Date.parse(lastBackup)) / DAY) : null;
  const showBackup = !!cases?.length && lastBackup !== undefined && (backupDays === null || backupDays >= 7);
  const showInstall = isIOS() && !isStandalone() && !hintDismissed;
  const list = (cases ?? []).filter((c) => filter === 'all' || c.status === filter);
  const who = settings && (settings.collector || settings.institution)
    ? `采集人 ${settings.collector || '—'} · 机构 ${settings.institution || '—'}`
    : '采集人、机构编号未设置';

  return (
    <div class="home">
      <header class="home-head">
        <div class="between">
          <a class="who mono" href="#/settings">{who}</a>
          <a class="iconbtn" href="#/settings" aria-label="设置"><IconGear /></a>
        </div>
        <h1>病例</h1>
        <div class="counts">
          <span><b class="mono ok-text">{counts.complete}</b> 已完成</span>
          <span><b class="mono warn-text">{counts.awaiting_followup}</b> 待复诊</span>
          <span><b class="mono">{counts.draft}</b> 草稿</span>
        </div>
        <div class="grid2">
          <button class="btn primary" onClick={create}><IconPlus />新建病例</button>
          <a class="btn" href="#/export"><IconDownload />导出数据集</a>
        </div>
      </header>

      {showInstall && (
        <div class="banner">
          <span>在 Safari 点「分享」→「添加到主屏幕」。不添加时，长期不打开 Safari 可能清理本机数据。</span>
          <button onClick={() => { setHintDismissed(true); void setMeta('installHintDismissed', true); }}>知道了</button>
        </div>
      )}

      {showBackup && (
        <div class="banner">
          <span>{backupDays === null ? '还没有备份过' : `上次备份在 ${backupDays} 天前`}，建议每周备份一次</span>
          <button onClick={() => setBackingUp(true)}>立即备份</button>
        </div>
      )}

      <nav class="filters" aria-label="筛选">
        {([['all', `全部 ${cases?.length ?? 0}`], ['awaiting_followup', '待复诊'], ['complete', '已完成'], ['draft', '草稿']] as const).map(
          ([f, label]) => (
            <button key={f} class={`chip ${filter === f ? 'on' : ''}`} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ),
        )}
      </nav>

      <ul class="cases">
        {cases && list.length === 0 && (
          <li class="empty">{cases.length === 0 ? '还没有病例。点「新建病例」开始采集。' : '没有符合条件的病例'}</li>
        )}
        {list.map((c) => <CaseRow key={c.id} c={c} />)}
      </ul>

      <footer class="home-foot">
        <IconLock />
        <span>照片和记录只保存在这台设备上，不会上传。{usage !== null && <>已用 <span class="mono">{formatBytes(usage)}</span>。</>}</span>
      </footer>

      {backingUp && (
        <FileJobSheet
          title="完整备份"
          run={runBackup}
          onSaved={() => { void markBackedUp(); setLastBackup(new Date().toISOString()); }}
          onClose={() => setBackingUp(false)}
        />
      )}
    </div>
  );
}

function targetStep(c: Case): Step {
  if (c.status !== 'draft') return 'followup';
  const i = stepDone(c).findIndex((d) => !d);
  return (['consent', 'treatment', 'photos', 'followup'] as Step[])[Math.max(0, i)];
}

function CaseRow({ c }: { c: Case }) {
  const [consent, rec] = stepDone(c);
  const pre = photoProgress(c, 'pre');
  const fu = photoProgress(c, 'followup');
  const flagged = flaggedCount(c);
  const skipped = !!c.followupSkipped;
  const badge =
    c.status === 'complete' ? <span class="badge ok">已完成{skipped && ' · 无复诊'}</span>
    : c.status === 'awaiting_followup'
      ? <span class="badge warn">{skipped ? '待完成 · 无复诊' : `待复诊 · ${mmdd(c.followup?.date ?? suggestedFollowupDate(c))}`}</span>
    : <span class="badge gray">草稿 · {draftReason(c)}</span>;
  const dose = doseSummary(c);
  const [catLabel, ...rest] = dose.split(' ');

  return (
    <li>
      <a class="case" href={caseHref(c.id, targetStep(c))}>
        <div class="between">
          <span class="mono" style={{ fontSize: 14 }}>{c.id}</span>
          {badge}
        </div>
        <div class="title">{caseTitle(c)}</div>
        <div class="meta">
          <span>{dose ? <>{catLabel} <span class="mono">{rest.join(' ')}</span></> : '未填写注射记录'}</span>
          <span class="mono">
            {c.status === 'complete' ? (
              skipped ? <>术前{pre.done}/{pre.total} · 无复诊数据</> : <>复诊 第{c.followup?.dayN}天 · GAIS {c.followup?.gais}</>
            ) : (
              <>
                同意{consent ? '✓' : '✗'} 记录{rec ? '✓' : '✗'} 术前{pre.done}/{pre.total}
                {c.status === 'awaiting_followup' && !skipped && <> 复诊{fu.done}/{fu.total}</>}
                {flagged > 0 && <b class="warn-text"> {flagged}张{flagLabel(c)}</b>}
              </>
            )}
          </span>
        </div>
      </a>
    </li>
  );
}

function flagLabel(c: Case): string {
  const flags = new Set(c.photos.flatMap((p) => p.quality.flags));
  if (flags.size === 1) return flags.has('dark') ? '偏暗' : flags.has('bright') ? '过曝' : '模糊';
  return '需重拍';
}
