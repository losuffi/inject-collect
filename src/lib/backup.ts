// 完整备份（SPEC 5.2）：单个 zip，含全部病例（包括同意书编号）、设置和照片，可在另一台设备导入恢复。
import { unzip, strFromU8 } from 'fflate';
import type { Case } from './model';
import {
  listCases, putCase, getBlobBytes, putBlob, getSettings, setMeta, thumbKey, db,
} from './db';
import { compactDate } from './dates';
import type { ZipEntry } from './zip';

const FORMAT = 'inject-collect-backup';

type BackupJson = {
  format: typeof FORMAT;
  version: 1;
  exportedAt: string;
  settings: Awaited<ReturnType<typeof getSettings>>;
  cases: Case[];
};

export const backupFileName = (now: Date) => `backup_${compactDate(now)}.zip`;

export async function backupEntries(now: Date): Promise<ZipEntry[]> {
  const cases = await listCases();
  const json: BackupJson = {
    format: FORMAT, version: 1, exportedAt: now.toISOString(), settings: await getSettings(), cases,
  };
  const entries: ZipEntry[] = [{ path: 'backup.json', data: JSON.stringify(json) }];
  const d = await db();
  for (const c of cases) {
    for (const p of c.photos) {
      for (const key of [p.blobKey, thumbKey(p.blobKey)]) {
        // 缩略图可能不存在（导入失败时），跳过即可，恢复时会按需重建
        if (key !== p.blobKey && !(await d.getKey('blobs', key))) continue;
        entries.push({ path: `blobs/${key}.jpg`, data: () => getBlobBytes(key) });
      }
    }
  }
  return entries;
}

export type BackupContents = { json: BackupJson; blobs: Map<string, Uint8Array> };

export async function readBackup(bytes: Uint8Array): Promise<BackupContents> {
  const files = await new Promise<Record<string, Uint8Array>>((res, rej) =>
    unzip(bytes, (err, data) => (err ? rej(err) : res(data))),
  );
  const raw = files['backup.json'];
  if (!raw) throw new Error('不是有效的备份文件（缺少 backup.json）');
  const json = JSON.parse(strFromU8(raw)) as BackupJson;
  if (json.format !== FORMAT) throw new Error('不是本应用的备份文件');
  const blobs = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(files)) {
    const m = /^blobs\/(.+)\.jpg$/.exec(path);
    if (m) blobs.set(m[1], data);
  }
  return { json, blobs };
}

/** 导入备份：同编号病例被覆盖，其他病例保留 */
export async function restoreBackup({ json, blobs }: BackupContents): Promise<{ cases: number; photos: number }> {
  for (const [key, data] of blobs) {
    await putBlob(key, new Blob([data as BlobPart], { type: 'image/jpeg' }));
  }
  for (const c of json.cases) await putCase(c);
  const s = await getSettings();
  if (!s.collector && !s.institution) await setMeta('settings', json.settings);
  return { cases: json.cases.length, photos: json.cases.reduce((n, c) => n + c.photos.length, 0) };
}
