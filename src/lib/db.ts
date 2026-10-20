// 本机存储（IndexedDB）。照片以 ArrayBuffer 保存，兼容旧版 Safari 的 Blob 存储问题。
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Case } from './model';

type StoredBlob = { type: string; data: ArrayBuffer };

interface Schema extends DBSchema {
  cases: { key: string; value: Case };
  blobs: { key: string; value: StoredBlob };
  meta: { key: string; value: unknown };
}

export type Settings = { collector: string; institution: string };

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  dbp ??= openDB<Schema>('inject-collect', 1, {
    upgrade(d) {
      d.createObjectStore('cases', { keyPath: 'id' });
      d.createObjectStore('blobs');
      d.createObjectStore('meta');
    },
  });
  return dbp;
}

/** 仅用于测试：关闭并重置连接 */
export async function resetDbForTests() {
  if (dbp) (await dbp).close();
  dbp = null;
}

export async function listCases(): Promise<Case[]> {
  return (await db()).getAll('cases');
}

export async function getCase(id: string): Promise<Case | undefined> {
  return (await db()).get('cases', id);
}

export async function putCase(c: Case): Promise<void> {
  await (await db()).put('cases', c);
}

export const thumbKey = (blobKey: string) => blobKey + '_thumb';

export async function deleteCase(id: string): Promise<void> {
  const d = await db();
  const c = await d.get('cases', id);
  const tx = d.transaction(['cases', 'blobs'], 'readwrite');
  for (const p of c?.photos ?? []) {
    tx.objectStore('blobs').delete(p.blobKey);
    tx.objectStore('blobs').delete(thumbKey(p.blobKey));
  }
  tx.objectStore('cases').delete(id);
  await tx.done;
}

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const data = await blob.arrayBuffer();
  await (await db()).put('blobs', { type: blob.type, data }, key);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const v = await (await db()).get('blobs', key);
  return v ? new Blob([v.data], { type: v.type }) : undefined;
}

export async function getBlobBytes(key: string): Promise<Uint8Array> {
  const v = await (await db()).get('blobs', key);
  if (!v) throw new Error(`照片数据缺失：${key}`);
  return new Uint8Array(v.data);
}

export async function deleteBlobs(keys: string[]): Promise<void> {
  const tx = (await db()).transaction('blobs', 'readwrite');
  for (const k of keys) tx.store.delete(k);
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('meta', key)) as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put('meta', value, key);
}

export async function getSettings(): Promise<Settings> {
  return (await getMeta<Settings>('settings')) ?? { collector: '', institution: '' };
}
