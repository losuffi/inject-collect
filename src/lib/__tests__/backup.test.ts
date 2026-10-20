import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putCase, putBlob, listCases, getBlobBytes, setMeta, getSettings, resetDbForTests, thumbKey, deleteCase, getBlob } from '../db';
import { backupEntries, readBackup, restoreBackup } from '../backup';
import { writeZip } from '../zip';
import { awaitingCase } from './fixtures';

async function wipe() {
  await resetDbForTests();
  await new Promise<void>((res, rej) => {
    const r = indexedDB.deleteDatabase('inject-collect');
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

describe('完整备份', () => {
  beforeEach(wipe);

  it('导入后与原数据一致（含同意书编号和照片）', async () => {
    const c = awaitingCase();
    await putCase(c);
    for (const p of c.photos) {
      await putBlob(p.blobKey, new Blob([new Uint8Array([1, 2, 3, p.view.length])], { type: 'image/jpeg' }));
      await putBlob(thumbKey(p.blobKey), new Blob([new Uint8Array([9])], { type: 'image/jpeg' }));
    }
    await setMeta('settings', { collector: 'INJ-07', institution: 'SH-02' });

    const zip = await writeZip(await backupEntries(new Date()));

    await wipe(); // 模拟另一台设备
    expect(await listCases()).toEqual([]);

    const res = await restoreBackup(await readBackup(zip));
    expect(res).toEqual({ cases: 1, photos: 5 });
    const [restored] = await listCases();
    expect(restored).toEqual(c);
    expect(restored.consent.formNo).toBe('CF-2026-0412');
    expect(Array.from(await getBlobBytes('pre-front'))).toEqual([1, 2, 3, 5]);
    expect(Array.from(await getBlobBytes(thumbKey('pre-l45')))).toEqual([9]);
    expect(await getSettings()).toEqual({ collector: 'INJ-07', institution: 'SH-02' });
  });

  it('拒绝非备份文件', async () => {
    const zip = await writeZip([{ path: 'x.txt', data: 'hi' }]);
    await expect(readBackup(zip)).rejects.toThrow('backup.json');
  });

  it('删除病例同时删除其照片', async () => {
    const c = awaitingCase();
    await putCase(c);
    await putBlob('pre-front', new Blob([new Uint8Array([1])]));
    await deleteCase(c.id);
    expect(await listCases()).toEqual([]);
    expect(await getBlob('pre-front')).toBeUndefined();
  });
});
