// 仅开发环境：生成与设计稿一致的示例病例（合成的人脸示意图），用于对照截图检查界面。
import type { Case, Phase, View, Treatment } from '../lib/model';
import { newCase } from '../lib/caseLogic';
import { db, putCase, setMeta } from '../lib/db';
import { importPhoto } from '../lib/photos';
import { toNorm } from '../lib/geometry';

const W = 1200, H = 1600;
// 正面照里的瞳孔位置（像素）
const PUPILS = { left: { x: 480, y: 700 }, right: { x: 720, y: 700 } };

function face(view: View, dark: boolean): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#D3DCE0';
  g.fillRect(0, 0, W, H);
  const shift = { front: 0, l45: -60, r45: 60, l90: 0, r90: 0, frown: 0, raise: 0, smile: 0 }[view];
  g.fillStyle = '#E8C9AE';
  g.beginPath();
  g.ellipse(600 + shift, 800, view.endsWith('90') ? 300 : 370, 500, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#7B5A44';
  g.lineWidth = 8;
  g.lineCap = 'round';
  if (!view.endsWith('90')) {
    for (const p of [PUPILS.left, PUPILS.right]) {
      g.fillStyle = '#FFFFFF';
      g.beginPath();
      g.ellipse(p.x + shift, p.y, 46, 20, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = '#3B2A20';
      g.beginPath();
      g.arc(p.x + shift, p.y, 13, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.moveTo(400 + shift, 640); g.quadraticCurveTo(470 + shift, 600, 545 + shift, 640);
    g.moveTo(655 + shift, 640); g.quadraticCurveTo(730 + shift, 600, 800 + shift, 640);
    g.moveTo(600 + shift, 740); g.lineTo(600 + shift, 900); g.lineTo(560 + shift, 915);
    g.stroke();
    g.fillStyle = '#C98A7E';
    g.beginPath();
    g.ellipse(600 + shift, 1060, 100, view === 'smile' ? 45 : 28, 0, 0, Math.PI * 2);
    g.fill();
  }
  // 细节纹理，避免被判为模糊
  g.fillStyle = 'rgba(60,30,10,0.25)';
  for (let i = 0; i < 12000; i++) g.fillRect((i * 7919) % W, (i * 104729) % H, 4, 4);
  if (dark) {
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(0, 0, W, H);
  }
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', 0.92));
}

const t = (p: Partial<Treatment> & Pick<Treatment, 'id' | 'area'>): Treatment => ({
  side: 'mid', category: 'HA', product: '', lot: '', dose: 1, unit: 'mL', layer: 'supraperiosteal', tool: '钝针 25G', ...p,
});

async function addPhotos(c: Case, phase: Phase, views: View[], darkViews: View[] = []) {
  for (const v of views) c.photos.push(await importPhoto(await face(v, darkViews.includes(v)), phase, v));
}

function ready(c: Case, ageBand: Case['subject']['ageBand'], formNo: string) {
  c.consent = { research: true, aiTraining: true, formNo, signedOn: c.treatmentDate };
  c.subject = { ageBand, sex: 'F', fitzpatrick: 3, smoker: false, priorInjection: 'gt6m', priorNote: '2025 年 3 月 下巴玻尿酸，已基本代谢' };
}

export async function seed() {
  const store = await db();
  await Promise.all([store.clear('cases'), store.clear('blobs'), store.clear('meta')]);
  const S5: View[] = ['front', 'l45', 'r45', 'l90', 'r90'];
  const at = (d: string) => new Date(d + 'T10:00:00');

  const a = newCase('C261016-03', at('2026-10-16'));
  ready(a, '25-29', 'CF-2026-0412');
  a.treatments = [
    t({ id: 'ta1', area: 'chin', dose: 1.0, product: '[产品名称 型号]', lot: '[批号]' }),
    t({ id: 'ta2', area: 'lips', dose: 0.8, layer: 'submucosal', tool: '锐针 30G' }),
  ];
  await addPhotos(a, 'pre', S5);
  const front = a.photos[0];
  a.pupils = { photoId: front.id, ...PUPILS };
  const pt = (id: string, tid: string, x: number, y: number, dose: number, extra = {}) => ({
    id, treatmentId: tid, photoId: front.id, px: { x, y }, norm: toNorm({ x, y }, PUPILS), fan: false,
    angle: 45 as const, layer: tid === 'ta1' ? 'supraperiosteal' as const : 'submucosal' as const,
    technique: 'linear_retrograde' as const, dose, ...extra,
  });
  a.points = [
    pt('p1', 'ta1', 600, 1255, 1.0, { direction: { dx: 0, dy: -1 }, fan: true, angle: 30, technique: 'bolus' }),
    pt('p2', 'ta2', 505, 1045, 0.15), pt('p3', 'ta2', 560, 1035, 0.15), pt('p4', 'ta2', 640, 1035, 0.15),
    pt('p5', 'ta2', 695, 1045, 0.15), pt('p6', 'ta2', 520, 1085, 0.1), pt('p7', 'ta2', 680, 1085, 0.1),
  ];

  const b = newCase('C261016-02', at('2026-10-16'));
  ready(b, '30-34', 'CF-2026-0411');
  b.treatments = [
    t({ id: 'tb1', area: 'glabella', category: 'BoNT', unit: 'U', dose: 20, layer: 'intramuscular', tool: '锐针 30G' }),
    t({ id: 'tb2', area: 'forehead', category: 'BoNT', unit: 'U', dose: 10, layer: 'intramuscular', tool: '锐针 30G' }),
  ];
  await addPhotos(b, 'pre', [...S5, 'frown', 'raise', 'smile']);

  const cc = newCase('C261002-01', at('2026-10-02'));
  ready(cc, '35-39', 'CF-2026-0388');
  cc.treatments = [t({ id: 'tc1', area: 'midface', side: 'L' }), t({ id: 'tc2', area: 'midface', side: 'R' })];
  await addPhotos(cc, 'pre', S5);
  await addPhotos(cc, 'followup', S5);
  cc.followup = { date: '2026-10-16', dayN: 14, gais: 2, satisfaction: 4, adverse: [], note: '' };
  cc.status = 'complete';

  const d = newCase('C261016-04', at('2026-10-16'));
  ready(d, '25-29', 'CF-2026-0413');
  d.treatments = [t({ id: 'td1', area: 'nasolabial', side: 'L', dose: 0.7 }), t({ id: 'td2', area: 'nasolabial', side: 'R', dose: 0.7 })];
  await addPhotos(d, 'pre', ['front', 'l45', 'r45', 'l90'], ['r45']);

  a.status = b.status = 'awaiting_followup';
  const order = [d, cc, b, a]; // 越靠后 updatedAt 越新，列表中排在前面
  for (let i = 0; i < order.length; i++) {
    order[i].updatedAt = new Date(Date.now() - (order.length - i) * 60000).toISOString();
    await putCase(order[i]);
  }
  await setMeta('settings', { collector: 'INJ-07', institution: 'SH-02' });
  await setMeta('lastBackupAt', new Date(Date.now() - 6 * 86400000 - 3600000).toISOString());
  location.hash = '#/';
  location.reload();
}
