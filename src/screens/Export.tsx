import { useEffect, useState } from 'preact/hooks';
import type { Case } from '../lib/model';
import { listCases } from '../lib/db';
import { datasetFileName, isExportable } from '../lib/dataset';
import { FileJobSheet } from '../components/FileJob';
import { IconBack, IconDownload } from '../components/icons';
import { runDatasetExport } from '../lib/jobs';
import './export.css';

export function ExportScreen() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => void listCases().then(setCases), []);

  const ok = (cases ?? []).filter(isExportable);
  const done = ok.filter((c) => c.status === 'complete').length;
  const skipped = (cases ?? []).length - ok.length;
  const photos = ok.reduce((n, c) => n + c.photos.length, 0);

  return (
    <div class="sub">
      <header class="subhead-bar">
        <a class="back" href="#/"><IconBack />病例</a>
        <span style={{ fontSize: 15, fontWeight: 500 }}>导出数据集</span>
        <span />
      </header>
      <main class="page" style={{ gap: 18 }}>
        <div class="stack" style={{ gap: 6 }}>
          <span class="mono" style={{ fontSize: 12, color: 'var(--brand)', letterSpacing: '0.04em' }}>DATASET · 导出一次得到一个 zip</span>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>每个完整病例 = 一条训练样本</h1>
        </div>

        <section class="card stack" style={{ gap: 10 }}>
          <div class="ex-stats">
            <div><b class="mono">{ok.length}</b><span>可导出病例</span></div>
            <div><b class="mono ok-text">{done}</b><span>已完成</span></div>
            <div><b class="mono">{ok.length - done}</b><span>未完成</span></div>
            <div><b class="mono">{photos}</b><span>照片</span></div>
          </div>
          {skipped > 0 && (
            <p class="muted" style={{ margin: 0, fontSize: 12 }}>另有 {skipped} 例未同时勾选研究与 AI 训练用途，留在本机，不导出。</p>
          )}
          <button class="btn primary big" disabled={!cases || ok.length === 0} onClick={() => setRunning(true)}>
            <IconDownload />生成 {datasetFileName(new Date())}
          </button>
        </section>

        <section class="ex-flow">
          <div class="card"><span class="muted">输入 ①</span><b>术前 5 角度照片</b></div>
          <span class="ex-op">+</span>
          <div class="card"><span class="muted">输入 ②</span><b>注射条件</b><code>部位、类别、剂量、层次、工具、位点坐标</code></div>
          <span class="ex-op">→</span>
          <div class="card target"><span>目标输出</span><b>复诊 5 角度照片</b><small>同一角度、同一光线，第 14–28 天。模型学的是“这组条件让这张脸变成什么样”。</small></div>
        </section>

        <section class="stack" style={{ gap: 8 }}>
          <h2 class="h2" style={{ fontSize: 16 }}>文件结构</h2>
          <pre class="tree">{`${datasetFileName(new Date())}
├─ README.txt
├─ cases.csv       `}<i># 每例一行</i>{`
├─ treatments.csv  `}<i># 每次注射一行</i>{`
├─ photos.csv      `}<i># 每张照片一行</i>{`
├─ points.csv      `}<i># 每个进针点一行</i>{`
└─ cases/
   └─ C261002-01/
      ├─ case.json
      ├─ pre_front.jpg … pre_r90.jpg
      └─ followup_front.jpg …`}</pre>
        </section>

        <section class="stack" style={{ gap: 8 }}>
          <h2 class="h2" style={{ fontSize: 16 }}>导出规则</h2>
          <ul class="ex-rules">
            <li>只导出两项同意都勾选的病例，其余留在设备上</li>
            <li>同意书编号、采集设备信息不进入数据集，只保留病例编号</li>
            <li>照片已去除定位等元数据；未完成病例在 cases.csv 里标为 complete=false</li>
            <li>CSV 带 UTF-8 BOM，可直接用 Excel 打开；case.json 便于训练脚本读取</li>
            <li>另有<a href="#/settings">“完整备份”</a>，用于换手机或防止浏览器清理数据，可再导入</li>
          </ul>
        </section>
      </main>
      {running && <FileJobSheet title="导出数据集" run={runDatasetExport} onClose={() => setRunning(false)} />}
    </div>
  );
}
