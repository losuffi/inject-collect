import type { Case, Photo, Phase, View, Treatment, InjectionPoint } from '../model';
import { newCase } from '../caseLogic';

export function photo(phase: Phase, view: View, flags: Photo['quality']['flags'] = []): Photo {
  const id = `${phase}-${view}`;
  return {
    id, phase, view, blobKey: id, width: 1800, height: 2400, takenAt: '2026-10-16T02:00:00.000Z',
    quality: { brightness: 120, sharpness: 300, flags },
  };
}

export function treatment(p: Partial<Treatment> = {}): Treatment {
  return {
    id: 't1', area: 'chin', side: 'mid', category: 'HA', product: 'X', lot: 'L1', dose: 1, unit: 'mL',
    layer: 'supraperiosteal', tool: '钝针 25G', ...p,
  };
}

export function point(p: Partial<InjectionPoint> = {}): InjectionPoint {
  return {
    id: 'p1', treatmentId: 't1', photoId: 'pre-front', px: { x: 150, y: 431 }, norm: { x: 0, y: 2.31 },
    direction: { dx: 0, dy: -1 }, fan: true, angle: 30, layer: 'supraperiosteal', technique: 'bolus', dose: 1, ...p,
  };
}

const VIEWS5: View[] = ['front', 'l45', 'r45', 'l90', 'r90'];
export const photos5 = (phase: Phase) => VIEWS5.map((v) => photo(phase, v));

/** 第 1–3 步都已完成、等待复诊的玻尿酸病例 */
export function awaitingCase(over: Partial<Case> = {}): Case {
  const c = newCase('C261016-03', new Date(2026, 9, 16, 10));
  c.consent = { research: true, aiTraining: true, formNo: 'CF-2026-0412', signedOn: '2026-10-16' };
  c.subject = {
    ageBand: '25-29', sex: 'F', fitzpatrick: 3, smoker: false, priorInjection: 'gt6m',
    priorWhen: '2025-03', priorArea: 'chin', priorProduct: '玻尿酸, 某品牌',
  };
  c.treatments = [treatment(), treatment({ id: 't2', area: 'lips', dose: 0.8, layer: 'submucosal', tool: '锐针 30G' })];
  c.points = [point()];
  c.photos = photos5('pre');
  c.pupils = { photoId: 'pre-front', left: { x: 100, y: 200 }, right: { x: 200, y: 200 } };
  return { ...c, ...over };
}
