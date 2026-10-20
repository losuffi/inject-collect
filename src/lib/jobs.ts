import { backupEntries, backupFileName } from './backup';
import { datasetEntries, datasetFileName, isExportable } from './dataset';
import { getBlobBytes, listCases, setMeta } from './db';
import { writeZipChunks } from './zip';
import type { JobResult } from '../components/FileJob';

type Progress = (done: number, total: number) => void;

export async function runDatasetExport(progress: Progress): Promise<JobResult> {
  const now = new Date();
  const cases = await listCases();
  const chunks = await writeZipChunks(datasetEntries(cases, getBlobBytes), progress);
  const n = cases.filter(isExportable).length;
  return { blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }), name: datasetFileName(now), note: `${n} 例` };
}

export async function runBackup(progress: Progress): Promise<JobResult> {
  const now = new Date();
  const chunks = await writeZipChunks(await backupEntries(now), progress);
  const n = (await listCases()).length;
  return { blob: new Blob(chunks as BlobPart[], { type: 'application/zip' }), name: backupFileName(now), note: `${n} 例，含同意书编号，请妥善保管` };
}

export const markBackedUp = () => setMeta('lastBackupAt', new Date().toISOString());
