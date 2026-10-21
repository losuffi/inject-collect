// 数据模型，对应 SPEC.md 第 3 节。
// 与规格的差异：
// - subject 的单选字段在新建时为 null（尚未选择），完成第 1 步后才有值。
// - 新增 pupils：针位标注的瞳孔基准（像素坐标），用于计算 norm 并在重标定时重算。

export type AgeBand = '18-24' | '25-29' | '30-34' | '35-39' | '40-49' | '50+';
export type Sex = 'F' | 'M' | 'U';
export type Fitzpatrick = 1 | 2 | 3 | 4 | 5 | 6;
export type PriorInjection = 'none' | 'lt6m' | 'gt6m';
export type CaseStatus = 'draft' | 'awaiting_followup' | 'complete';

export type AreaCode =
  | 'chin' | 'lips' | 'nose' | 'midface' | 'tear_trough'
  | 'nasolabial' | 'glabella' | 'forehead' | 'crows_feet' | 'jawline';
export type LayerCode = 'intradermal' | 'subcutaneous' | 'supraperiosteal' | 'intramuscular' | 'submucosal';
export type Category = 'HA' | 'BoNT' | 'other';
export type Side = 'L' | 'R' | 'mid';
export type Technique = 'bolus' | 'linear_retrograde' | 'fanning' | 'other';
export type Angle = 90 | 45 | 30 | 0;

export type Phase = 'pre' | 'immediate' | 'followup';
export type View = 'front' | 'l45' | 'r45' | 'l90' | 'r90' | 'frown' | 'raise' | 'smile';
export type QualityFlag = 'dark' | 'bright' | 'blurry';

export type Vec = { x: number; y: number };

export type Treatment = {
  id: string;
  area: AreaCode;
  side: Side;
  category: Category;
  product: string;
  lot: string;
  dose: number;
  unit: 'mL' | 'U';
  layer: LayerCode;
  tool: string;
};

export type InjectionPoint = {
  id: string;
  treatmentId: string;
  photoId: string;
  px: Vec;
  norm: Vec;
  direction?: { dx: number; dy: number }; // 单位向量，瞳孔坐标系
  fan: boolean;
  angle: Angle;
  layer: LayerCode;
  technique: Technique;
  dose: number;
};

export type Photo = {
  id: string;
  phase: Phase;
  view: View;
  blobKey: string;
  width: number;
  height: number;
  takenAt: string;
  quality: { brightness: number; sharpness: number; flags: QualityFlag[] };
};

export type Followup = {
  date: string;
  dayN: number;
  gais: 1 | 2 | 3 | 4 | 5 | null;
  satisfaction: 1 | 2 | 3 | 4 | 5 | null;
  adverse: string[];
  note: string;
};

export type Case = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: CaseStatus;
  consent: { research: boolean; aiTraining: boolean; formNo: string; signedOn: string };
  subject: {
    ageBand: AgeBand | null;
    sex: Sex | null;
    fitzpatrick: Fitzpatrick | null;
    smoker: boolean;
    priorInjection: PriorInjection;
    /** 既往注射时间 YYYY-MM */
    priorWhen: string;
    /** 既往注射部位：AreaCode 或 'other' */
    priorArea: AreaCode | 'other' | '';
    priorProduct: string;
    /** 旧版的一体化备注，仅为兼容已有数据保留，新数据不再写入 */
    priorNote?: string;
  };
  treatmentDate: string;
  treatments: Treatment[];
  points: InjectionPoint[];
  photos: Photo[];
  pupils?: { photoId: string; left: Vec; right: Vec };
  followup?: Followup;
  /** 本例无复诊：可不填复诊信息直接完成，导出时标记 followup_skipped，并忽略已有的复诊数据 */
  followupSkipped?: boolean;
};

/** 单条注射记录 / 单个进针点的剂量上限（mL）；肉毒素按 U 计，不设上限 */
export const MAX_ML = 2;

// ---- 选项与中文标签 ----

export const AGE_BANDS: AgeBand[] = ['18-24', '25-29', '30-34', '35-39', '40-49', '50+'];

export const AREAS: { code: AreaCode; label: string }[] = [
  { code: 'chin', label: '下巴' },
  { code: 'lips', label: '唇部' },
  { code: 'nose', label: '鼻部' },
  { code: 'midface', label: '苹果肌' },
  { code: 'tear_trough', label: '泪沟' },
  { code: 'nasolabial', label: '法令纹' },
  { code: 'glabella', label: '眉间' },
  { code: 'forehead', label: '额头' },
  { code: 'crows_feet', label: '鱼尾纹' },
  { code: 'jawline', label: '下颌线' },
];

export const LAYERS: { code: LayerCode; label: string }[] = [
  { code: 'intradermal', label: '皮内' },
  { code: 'subcutaneous', label: '皮下' },
  { code: 'supraperiosteal', label: '骨膜上' },
  { code: 'intramuscular', label: '肌内' },
  { code: 'submucosal', label: '黏膜下' },
];

export const CATEGORIES: { code: Category; label: string; unit: 'mL' | 'U' }[] = [
  { code: 'HA', label: '玻尿酸', unit: 'mL' },
  { code: 'BoNT', label: '肉毒素', unit: 'U' },
  { code: 'other', label: '其他', unit: 'mL' },
];

export const TECHNIQUES: { code: Technique; label: string }[] = [
  { code: 'bolus', label: '团注' },
  { code: 'linear_retrograde', label: '线性退针' },
  { code: 'fanning', label: '扇形' },
  { code: 'other', label: '其他' },
];

export const ANGLES: { value: Angle; label: string }[] = [
  { value: 90, label: '90° 垂直' },
  { value: 45, label: '45°' },
  { value: 30, label: '30°' },
  { value: 0, label: '≈0° 平行' },
];

export const TOOLS = ['锐针 30G', '锐针 32G', '锐针 27G', '钝针 25G', '钝针 22G', '其他'];

export const ADVERSE: { code: string; label: string }[] = [
  { code: 'bruising', label: '淤青' },
  { code: 'swelling', label: '肿胀' },
  { code: 'nodule', label: '结节' },
  { code: 'asymmetry', label: '不对称' },
  { code: 'overcorrection', label: '过矫' },
  { code: 'undercorrection', label: '欠矫' },
  { code: 'touchup', label: '需补打' },
];

export const GAIS: { value: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { value: 1, label: '显著改善' },
  { value: 2, label: '明显改善' },
  { value: 3, label: '改善' },
  { value: 4, label: '无变化' },
  { value: 5, label: '变差' },
];

export const STANDARD_VIEWS: View[] = ['front', 'l45', 'r45', 'l90', 'r90'];
export const EXPRESSION_VIEWS: View[] = ['frown', 'raise', 'smile'];

export const VIEW_LABELS: Record<View, string> = {
  front: '正面',
  l45: '左 45°',
  r45: '右 45°',
  l90: '左侧面 90°',
  r90: '右侧面 90°',
  frown: '用力皱眉',
  raise: '用力抬眉',
  smile: '露齿大笑',
};

export const PHASE_LABELS: Record<Phase, string> = {
  pre: '术前',
  immediate: '术后即刻',
  followup: '复诊',
};

export const FITZ_COLORS = ['#F6E3D4', '#EBC9AE', '#D7A57F', '#B47B52', '#84542F', '#4A2E1C'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

/** 每条注射记录的标识色：[实色, 浅色填充] */
export const TREATMENT_COLORS: [string, string][] = [
  ['#1C6670', '#CFE3E5'],
  ['#B5651D', '#F0D9C2'],
  ['#6B4FA0', '#E2DAF0'],
  ['#2F7A4B', '#D3EADB'],
  ['#A33B5C', '#F2D6DF'],
  ['#3E6FA3', '#D6E3F1'],
];

export const areaLabel = (a: AreaCode) => AREAS.find((x) => x.code === a)?.label ?? a;
export const layerLabel = (l: LayerCode) => LAYERS.find((x) => x.code === l)?.label ?? l;
export const categoryLabel = (c: Category) => CATEGORIES.find((x) => x.code === c)?.label ?? c;
export const techniqueLabel = (t: Technique) => TECHNIQUES.find((x) => x.code === t)?.label ?? t;
export const unitFor = (c: Category): 'mL' | 'U' => (c === 'BoNT' ? 'U' : 'mL');

const MIDLINE_AREAS: AreaCode[] = ['chin', 'nose', 'glabella', 'forehead'];
export function sideLabel(area: AreaCode, side: Side): string {
  if (side === 'L') return '左侧';
  if (side === 'R') return '右侧';
  return MIDLINE_AREAS.includes(area) ? '中线' : '双侧';
}

export function treatmentColor(c: Case, treatmentId: string): [string, string] {
  const i = Math.max(0, c.treatments.findIndex((t) => t.id === treatmentId));
  return TREATMENT_COLORS[i % TREATMENT_COLORS.length];
}
