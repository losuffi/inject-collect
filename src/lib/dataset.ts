// 数据集导出（SPEC 5.1）。只导出两项同意都勾选的病例，不含同意书编号。
import type { Case, Photo } from './model';
import { toCSV } from './csv';
import { compactDate } from './dates';
import { followupWindow, inWindow } from './caseLogic';
import type { ZipEntry } from './zip';

export const isExportable = (c: Case) => c.consent.research && c.consent.aiTraining;

export const datasetFileName = (now: Date) => `dataset_${compactDate(now)}.zip`;

export const photoFileName = (p: Pick<Photo, 'phase' | 'view'>) => `${p.phase}_${p.view}.jpg`;

const f4 = (n: number | undefined) => (n === undefined ? '' : n.toFixed(4));

/** case.json：去掉同意书信息和本机存储键 */
export function caseJson(c: Case) {
  const photoFile = new Map(c.photos.map((p) => [p.id, photoFileName(p)]));
  return {
    id: c.id,
    createdAt: c.createdAt,
    status: c.status,
    complete: c.status === 'complete',
    subject: c.subject,
    treatmentDate: c.treatmentDate,
    treatments: c.treatments,
    points: c.points.map((p) => ({ ...p, photo: photoFile.get(p.photoId) ?? null })),
    photos: c.photos.map(({ blobKey: _blobKey, ...p }) => ({ ...p, file: photoFileName(p) })),
    pupils: c.pupils ? { ...c.pupils, photo: photoFile.get(c.pupils.photoId) ?? null } : null,
    followup: c.followup ? { ...c.followup, inWindow: inWindow(c), window: followupWindow(c) } : null,
    coordinateSystem: 'origin=pupil midpoint, x=along pupil line (image left→right), unit=interpupillary distance, y=down',
  };
}

export function datasetEntries(all: Case[], loadBlob: (key: string) => Promise<Uint8Array>): ZipEntry[] {
  const cases = all.filter(isExportable).sort((a, b) => a.id.localeCompare(b.id));
  const count = (c: Case, phase: Photo['phase']) => c.photos.filter((p) => p.phase === phase).length;

  const casesCsv = toCSV(
    ['case_id', 'created_at', 'treatment_date', 'status', 'complete', 'age_band', 'sex', 'fitzpatrick', 'smoker',
      'prior_injection', 'prior_note', 'n_treatments', 'n_points', 'n_photos_pre', 'n_photos_immediate',
      'n_photos_followup', 'followup_date', 'followup_day', 'in_window', 'gais', 'satisfaction', 'adverse',
      'followup_note'],
    cases.map((c) => [
      c.id, c.createdAt, c.treatmentDate, c.status, c.status === 'complete', c.subject.ageBand, c.subject.sex,
      c.subject.fitzpatrick, c.subject.smoker, c.subject.priorInjection, c.subject.priorNote, c.treatments.length,
      c.points.length, count(c, 'pre'), count(c, 'immediate'), count(c, 'followup'), c.followup?.date,
      c.followup?.dayN, c.followup ? inWindow(c) : '', c.followup?.gais, c.followup?.satisfaction,
      c.followup?.adverse.join(';'), c.followup?.note,
    ]),
  );

  const treatmentsCsv = toCSV(
    ['case_id', 'treatment_id', 'area', 'side', 'category', 'product', 'lot', 'dose', 'unit', 'layer', 'tool'],
    cases.flatMap((c) => c.treatments.map((t) => [
      c.id, t.id, t.area, t.side, t.category, t.product, t.lot, t.dose, t.unit, t.layer, t.tool,
    ])),
  );

  const pointsCsv = toCSV(
    ['case_id', 'treatment_id', 'norm_x', 'norm_y', 'dir_dx', 'dir_dy', 'fan', 'angle', 'layer', 'technique', 'dose',
      'point_id', 'photo', 'px_x', 'px_y'],
    cases.flatMap((c) => c.points.map((p) => {
      const ph = c.photos.find((x) => x.id === p.photoId);
      return [
        c.id, p.treatmentId, f4(p.norm.x), f4(p.norm.y), f4(p.direction?.dx), f4(p.direction?.dy), p.fan, p.angle,
        p.layer, p.technique, p.dose, p.id, ph ? photoFileName(ph) : '', Math.round(p.px.x), Math.round(p.px.y),
      ];
    })),
  );

  const photosCsv = toCSV(
    ['case_id', 'photo_id', 'phase', 'view', 'file', 'width', 'height', 'taken_at', 'brightness', 'sharpness', 'flags'],
    cases.flatMap((c) => c.photos.map((p) => [
      c.id, p.id, p.phase, p.view, `cases/${c.id}/${photoFileName(p)}`, p.width, p.height, p.takenAt,
      p.quality.brightness, p.quality.sharpness, p.quality.flags.join(';'),
    ])),
  );

  const entries: ZipEntry[] = [
    { path: 'README.txt', data: readme(cases.length) },
    { path: 'cases.csv', data: casesCsv },
    { path: 'treatments.csv', data: treatmentsCsv },
    { path: 'points.csv', data: pointsCsv },
    { path: 'photos.csv', data: photosCsv },
  ];
  for (const c of cases) {
    entries.push({ path: `cases/${c.id}/case.json`, data: JSON.stringify(caseJson(c), null, 2) });
    for (const p of c.photos) {
      entries.push({ path: `cases/${c.id}/${photoFileName(p)}`, data: () => loadBlob(p.blobKey) });
    }
  }
  return entries;
}

function readme(n: number): string {
  return `面部注射采集台 · 数据集
病例数：${n}

每个完整病例 = 一条训练样本：术前照片 + 注射条件 → 复诊照片。
只包含两项同意（研究用途、AI 训练用途）都勾选的病例。同意书编号、采集设备信息不在数据集中。
照片已去除 EXIF（含定位），长边不超过 2400 像素。

文件
- cases.csv       每例一行；complete=false 表示尚未完成复诊评估
- treatments.csv  每条注射记录一行；dose 的单位见 unit（玻尿酸 mL，肉毒素 U）
- points.csv      每个进针点一行
- photos.csv      每张照片一行；flags 为导入时的质量提示（dark/bright/blurry）
- cases/<case_id>/case.json        该病例的完整结构化数据
- cases/<case_id>/<phase>_<view>.jpg
    phase: pre 术前 / immediate 术后即刻 / followup 复诊
    view:  front 正面 / l45 r45 左右 45° / l90 r90 左右侧面 / frown 皱眉 / raise 抬眉 / smile 大笑
    左右以照片中的左右为准。

坐标（points.csv）
- norm_x, norm_y：瞳孔坐标系。两瞳中点为原点，瞳孔连线为 x 轴（照片左 → 右），瞳距 = 1，y 轴向下。
- dir_dx, dir_dy：进针方向的单位向量（同一坐标系），未画方向时为空；fan=true 表示扇形。
- angle：针与皮肤夹角（90/45/30/0 度）。
- px_x, px_y：在术前正面照（photo 列）上的像素坐标。

代码
- area: chin 下巴, lips 唇部, nose 鼻部, midface 苹果肌, tear_trough 泪沟, nasolabial 法令纹,
        glabella 眉间, forehead 额头, crows_feet 鱼尾纹, jawline 下颌线
- side: L 左, R 右, mid 中线/双侧
- layer: intradermal 皮内, subcutaneous 皮下, supraperiosteal 骨膜上, intramuscular 肌内, submucosal 黏膜下
- technique: bolus 团注, linear_retrograde 线性退针, fanning 扇形, other 其他
- gais: 1 显著改善 … 5 变差；satisfaction: 1–5，5 最满意
- adverse: bruising 淤青, swelling 肿胀, nodule 结节, asymmetry 不对称, overcorrection 过矫,
           undercorrection 欠矫, touchup 需补打
`.replace(/\n/g, '\r\n');
}
