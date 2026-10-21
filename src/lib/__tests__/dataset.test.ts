import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { toCSV } from '../csv';
import { datasetEntries, datasetFileName, isExportable } from '../dataset';
import { writeZip } from '../zip';
import { awaitingCase, photo } from './fixtures';

const BOM = '﻿';
const fakeBlob = async (k: string) => new TextEncoder().encode('jpg:' + k);
const csvOf = (entries: ReturnType<typeof datasetEntries>, path: string) =>
  (entries.find((e) => e.path === path)!.data as string).replace(BOM, '').trim().split('\r\n');

describe('CSV', () => {
  it('UTF-8 BOM、CRLF、必要时加引号', () => {
    const s = toCSV(['a', 'b'], [['x,y', 'say "hi"'], [1, null], [true, '多行\n文本']]);
    expect(s).toBe(BOM + 'a,b\r\n"x,y","say ""hi"""\r\n1,\r\ntrue,"多行\n文本"\r\n');
  });
});

describe('数据集导出', () => {
  const ok = awaitingCase();
  const noAi = awaitingCase({ id: 'C261016-05', consent: { ...ok.consent, aiTraining: false, formNo: 'CF-SECRET-9' } });
  const done = awaitingCase({ id: 'C261002-01', status: 'complete' });
  const cases = [ok, noAi, done];

  it('文件名', () => {
    expect(datasetFileName(new Date(2026, 9, 30))).toBe('dataset_20261030.zip');
  });

  it('两项同意都勾选才导出', () => {
    expect(isExportable(ok)).toBe(true);
    expect(isExportable(noAi)).toBe(false);
    expect(isExportable(awaitingCase({ consent: { ...ok.consent, research: false } }))).toBe(false);
  });

  it('只包含同意 AI 训练的病例，不含同意书编号', async () => {
    const entries = datasetEntries(cases, fakeBlob);
    const paths = entries.map((e) => e.path);
    for (const p of ['README.txt', 'cases.csv', 'treatments.csv', 'points.csv', 'photos.csv',
      'cases/C261016-03/case.json', 'cases/C261016-03/pre_front.jpg', 'cases/C261002-01/pre_r90.jpg']) {
      expect(paths).toContain(p);
    }
    expect(paths.some((p) => p.includes('C261016-05'))).toBe(false);

    const files = unzipSync(await writeZip(entries));
    const all = Object.values(files).map((v) => strFromU8(v)).join('\n');
    expect(all).not.toContain('CF-2026-0412');
    expect(all).not.toContain('CF-SECRET-9');
    expect(all).not.toContain('C261016-05');
    expect(strFromU8(files['cases/C261016-03/pre_front.jpg'])).toBe('jpg:pre-front');
    const json = JSON.parse(strFromU8(files['cases/C261016-03/case.json']));
    expect(json.consent).toBeUndefined();
    expect(json.photos[0].file).toBe('pre_front.jpg');
    expect(json.photos[0].blobKey).toBeUndefined();
  });

  it('cases.csv 标记 complete', () => {
    const lines = csvOf(datasetEntries(cases, fakeBlob), 'cases.csv');
    const ci = lines[0].split(',').indexOf('complete');
    const row = (id: string) => lines.find((l) => l.startsWith(id + ','))!.split(',');
    expect(row('C261016-03')[ci]).toBe('false');
    expect(row('C261002-01')[ci]).toBe('true');
  });

  it('既往注射分三列导出', () => {
    const lines = csvOf(datasetEntries([ok], fakeBlob), 'cases.csv');
    const h = lines[0].split(',');
    expect(h).not.toContain('prior_note');
    const row = lines[1].split(',');
    expect(row[h.indexOf('prior_when')]).toBe('2025-03');
    expect(row[h.indexOf('prior_area')]).toBe('chin');
    // 含逗号的字段被引号包住，这里只检查原文存在
    expect(lines[1]).toContain('"玻尿酸, 某品牌"');
  });

  it('无复诊病例打标，并且不导出复诊评估和复诊照片', async () => {
    const skipped = awaitingCase({
      id: 'C261016-09', status: 'complete', followupSkipped: true,
      followup: { date: '2026-10-30', dayN: 14, gais: 2, satisfaction: 4, adverse: [], note: 'x' },
    });
    skipped.photos = [...skipped.photos, photo('followup', 'front')];
    const entries = datasetEntries([skipped, ok], fakeBlob);
    const lines = csvOf(entries, 'cases.csv');
    const h = lines[0].split(',');
    const row = (id: string) => lines.find((l) => l.startsWith(id + ','))!.split(',');
    expect(row('C261016-09')[h.indexOf('followup_skipped')]).toBe('true');
    expect(row('C261016-09')[h.indexOf('complete')]).toBe('true');
    expect(row('C261016-09')[h.indexOf('gais')]).toBe('');
    expect(row('C261016-09')[h.indexOf('n_photos_followup')]).toBe('0');
    expect(row('C261016-03')[h.indexOf('followup_skipped')]).toBe('false');
    expect(entries.some((e) => e.path === 'cases/C261016-09/followup_front.jpg')).toBe(false);
    const json = JSON.parse(entries.find((e) => e.path === 'cases/C261016-09/case.json')!.data as string);
    expect(json.followupSkipped).toBe(true);
    expect(json.followup).toBeNull();
  });

  it('points.csv 列', () => {
    const [header, row] = csvOf(datasetEntries([ok], fakeBlob), 'points.csv');
    expect(header.startsWith('case_id,treatment_id,norm_x,norm_y,dir_dx,dir_dy,fan,angle,layer,technique,dose')).toBe(true);
    expect(row.startsWith('C261016-03,t1,0.0000,2.3100,0.0000,-1.0000,true,30,supraperiosteal,bolus,1')).toBe(true);
  });
});
