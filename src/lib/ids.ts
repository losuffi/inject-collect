const pad = (n: number) => String(n).padStart(2, '0');

/** "C261016-03" = C + YYMMDD + 当日序号 */
export function nextCaseId(now: Date, existing: string[]): string {
  const prefix = `C${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}-`;
  const max = existing
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10) || 0)
    .reduce((a, b) => Math.max(a, b), 0);
  return prefix + pad(max + 1);
}

export function uid(prefix = ''): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return prefix + r[0].toString(36) + r[1].toString(36);
}
