import { describe, it, expect } from 'vitest';
import {
  newCase, requiredViews, photoProgress, stepDone, deriveStatus, draftReason, caseTitle, doseSummary,
  followupWindow, followupChecks, pointDoseIssues, flaggedCount, setFollowupDate, formatDose, clampDose,
} from '../caseLogic';
import { awaitingCase, photo, photos5, point, treatment } from './fixtures';

describe('新建病例', () => {
  it('默认值', () => {
    const c = newCase('C261016-01', new Date(2026, 9, 16, 9));
    expect(c.status).toBe('draft');
    expect(c.treatmentDate).toBe('2026-10-16');
    expect(c.consent.signedOn).toBe('2026-10-16');
    expect(c.consent.aiTraining).toBe(false);
    expect(c.subject.ageBand).toBeNull();
    expect(stepDone(c)).toEqual([false, false, false, false]);
    expect(draftReason(c)).toBe('缺同意');
  });
});

describe('照片进度', () => {
  it('玻尿酸病例必拍 5 张，肉毒素病例加 3 张表情照', () => {
    const c = awaitingCase();
    expect(requiredViews(c)).toHaveLength(5);
    expect(photoProgress(c, 'pre')).toEqual({ done: 5, total: 5 });
    expect(photoProgress(c, 'followup')).toEqual({ done: 0, total: 5 });
    const b = awaitingCase({ treatments: [treatment({ category: 'BoNT', unit: 'U', dose: 20, area: 'glabella' })] });
    expect(requiredViews(b)).toHaveLength(8);
    expect(photoProgress(b, 'pre')).toEqual({ done: 5, total: 8 });
  });

  it('统计偏暗/模糊照片', () => {
    const c = awaitingCase();
    c.photos[2] = photo('pre', 'r45', ['dark']);
    expect(flaggedCount(c)).toBe(1);
  });
});

describe('状态推导', () => {
  it('前三步完成即为待复诊', () => {
    const c = awaitingCase();
    expect(stepDone(c)).toEqual([true, true, true, false]);
    expect(deriveStatus(c)).toBe('awaiting_followup');
  });

  it('缺术前照为草稿', () => {
    const c = awaitingCase();
    c.photos = c.photos.slice(0, 4);
    expect(deriveStatus(c)).toBe('draft');
    expect(draftReason(c)).toBe('缺术前照');
  });

  it('剂量为 0 的记录不算完成', () => {
    const c = awaitingCase({ treatments: [treatment({ dose: 0 })] });
    expect(stepDone(c)[1]).toBe(false);
    expect(draftReason(c)).toBe('缺记录');
  });

  it('已完成状态保持，除非前置条件被破坏', () => {
    const c = awaitingCase({ status: 'complete' });
    expect(deriveStatus(c)).toBe('complete');
    c.consent = { ...c.consent, research: false };
    expect(deriveStatus(c)).toBe('draft');
  });
});

describe('列表摘要', () => {
  it('部位标题', () => {
    expect(caseTitle(awaitingCase())).toBe('下巴 · 唇部');
    expect(caseTitle(newCase('C261016-01', new Date()))).toBe('未填写部位');
    const two = awaitingCase({
      treatments: [treatment({ area: 'midface', side: 'L' }), treatment({ id: 't2', area: 'midface', side: 'R' })],
    });
    expect(caseTitle(two)).toBe('苹果肌');
  });

  it('剂量摘要', () => {
    expect(doseSummary(awaitingCase())).toBe('玻尿酸 1.0 + 0.8 mL');
    const same = awaitingCase({ treatments: [treatment({ dose: 0.7 }), treatment({ id: 't2', dose: 0.7 })] });
    expect(doseSummary(same)).toBe('玻尿酸 2 × 0.7 mL');
    const bont = awaitingCase({
      treatments: [
        treatment({ category: 'BoNT', unit: 'U', dose: 20 }),
        treatment({ id: 't2', category: 'BoNT', unit: 'U', dose: 10 }),
      ],
    });
    expect(doseSummary(bont)).toBe('肉毒素 20 + 10 U');
    const mixed = awaitingCase({
      treatments: [treatment(), treatment({ id: 't2', category: 'BoNT', unit: 'U', dose: 10 })],
    });
    expect(doseSummary(mixed)).toBe('玻尿酸 1.0 mL；肉毒素 10 U');
    expect(formatDose(2.5, 'U')).toBe('2.5');
    expect(formatDose(0.25, 'mL')).toBe('0.25');
  });
});

describe('复诊', () => {
  it('建议窗口：玻尿酸 14–28，肉毒素 14 天左右', () => {
    expect(followupWindow(awaitingCase())).toEqual({ start: 14, end: 28 });
    const b = awaitingCase({ treatments: [treatment({ category: 'BoNT', unit: 'U', dose: 20 })] });
    expect(followupWindow(b)).toEqual({ start: 10, end: 18 });
  });

  it('设置复诊日期时计算距治疗天数', () => {
    const c = setFollowupDate(awaitingCase(), '2026-10-30');
    expect(c.followup!.dayN).toBe(14);
  });

  it('入库检查', () => {
    let c = awaitingCase();
    expect(followupChecks(c).canComplete).toBe(false);
    c = setFollowupDate(c, '2026-10-30');
    c.followup = { ...c.followup!, gais: 2, satisfaction: 4 };
    c.photos = [...c.photos, ...photos5('followup')];
    expect(followupChecks(c)).toMatchObject({
      consent: true, treatments: true, window: true, evaluation: true, canComplete: true,
    });
    // 超出窗口只提示，不阻止完成
    c = setFollowupDate(c, '2026-12-30');
    expect(followupChecks(c)).toMatchObject({ window: false, canComplete: true });
  });

  it('无复诊：不需要复诊照和评估即可完成，但前三步仍要齐全', () => {
    const c = awaitingCase({ followupSkipped: true });
    expect(followupChecks(c)).toMatchObject({ skipped: true, evaluation: false, canComplete: true });
    const missingPre = awaitingCase({ followupSkipped: true });
    missingPre.photos = missingPre.photos.slice(0, 4);
    expect(followupChecks(missingPre).canComplete).toBe(false);
  });
});

describe('剂量上限', () => {
  it('mL 最多 2，U 不限', () => {
    expect(clampDose(2.5, 'mL')).toBe(2);
    expect(clampDose(1.2, 'mL')).toBe(1.2);
    expect(clampDose(-1, 'mL')).toBe(0);
    expect(clampDose(50, 'U')).toBe(50);
  });
});

describe('针位剂量核对', () => {
  it('各点剂量之和与记录总量不一致时提示', () => {
    const c = awaitingCase();
    // t1: 1 个点 1.0 = 1.0 ✓；t2: 无点 0 ≠ 0.8
    expect(pointDoseIssues(c)).toEqual([{ treatmentId: 't2', sum: 0, dose: 0.8, count: 0 }]);
    c.points = [
      ...c.points,
      point({ id: 'p2', treatmentId: 't2', dose: 0.3 }),
      point({ id: 'p3', treatmentId: 't2', dose: 0.5 }),
    ];
    expect(pointDoseIssues(c)).toEqual([]);
  });
});
