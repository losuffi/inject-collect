import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate';

export type ZipEntry = {
  path: string;
  /** 文本会被压缩；二进制（照片）按原样存储 */
  data: string | Uint8Array | (() => Promise<Uint8Array>);
};

/** 逐个写入条目，返回 zip 分块（照片按需读取，避免一次性全部载入内存） */
export async function writeZipChunks(
  entries: ZipEntry[],
  onProgress?: (done: number, total: number) => void,
): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = [];
  let failed: Error | null = null;
  let finished = false;
  const zip = new Zip((err, chunk, final) => {
    if (err) failed = err;
    else chunks.push(chunk);
    if (final) finished = true;
  });

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (typeof e.data === 'string') {
      const f = new ZipDeflate(e.path, { level: 6 });
      zip.add(f);
      f.push(strToU8(e.data), true);
    } else {
      const bytes = typeof e.data === 'function' ? await e.data() : e.data;
      const f = new ZipPassThrough(e.path);
      zip.add(f);
      f.push(bytes, true);
    }
    if (failed) throw failed;
    onProgress?.(i + 1, entries.length);
  }
  zip.end();
  if (failed) throw failed;
  if (!finished) throw new Error('zip 未正常结束');
  return chunks;
}

export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks = await writeZipChunks(entries);
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
