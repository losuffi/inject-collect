import type { StepProps } from './types';
import { AGE_BANDS, AREAS, FITZ_COLORS, ROMAN, type Case, type Fitzpatrick, type PriorInjection } from '../lib/model';
import { OptionGroup } from '../components/common';
import { caseHref, go } from '../router';
import { deleteCase } from '../lib/db';
import './steps.css';

export function ConsentStep({ c, update }: StepProps) {
  const setConsent = (p: Partial<Case['consent']>) => update((x) => ({ ...x, consent: { ...x.consent, ...p } }));
  const setSubject = (p: Partial<Case['subject']>) => update((x) => ({ ...x, subject: { ...x.subject, ...p } }));
  const { consent, subject } = c;

  async function remove() {
    if (!confirm(`删除病例 ${c.id}？照片和记录会从这台设备上永久删除，无法恢复。`)) return;
    await deleteCase(c.id);
    go('#/', true);
  }

  return (
    <main class="page">
      <section class="stack" style={{ gap: 12 }}>
        <h2 class="h2">知情同意</h2>
        <label class="checkcard">
          <input type="checkbox" checked={consent.research} onChange={(e) => setConsent({ research: e.currentTarget.checked })} />
          <span>已签署书面同意书，求美者同意面部影像用于研究</span>
        </label>
        <label class="checkcard">
          <input type="checkbox" checked={consent.aiTraining} onChange={(e) => setConsent({ aiTraining: e.currentTarget.checked })} />
          <span>同意书中单独勾选了“用于 AI 模型训练”</span>
        </label>
        {!consent.aiTraining && (
          <p class="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>未勾选 AI 训练用途的病例只保存在本机，永远不会进入导出的数据集。</p>
        )}
        <div class="grid2">
          <label class="field">同意书编号
            <input class="input mono" value={consent.formNo} placeholder="CF-2026-0001" autoComplete="off"
              onInput={(e) => setConsent({ formNo: e.currentTarget.value })} />
          </label>
          <label class="field">签署日期
            <input class="input mono" type="date" value={consent.signedOn}
              onInput={(e) => setConsent({ signedOn: e.currentTarget.value })}
              onChange={(e) => setConsent({ signedOn: e.currentTarget.value })} />
          </label>
        </div>
        <p class="notice">不要录入姓名、手机号、身份证号。病例只用编号关联纸质同意书，编号不会进入导出的数据集。</p>
      </section>

      <section class="stack" style={{ gap: 18 }}>
        <h2 class="h2">基本信息</h2>

        <fieldset>
          <legend class="legend">年龄段</legend>
          <OptionGroup
            class="wrap"
            optClass="mono"
            options={AGE_BANDS.map((a) => ({ value: a, label: a.replace('-', '–') }))}
            value={subject.ageBand}
            onChange={(ageBand) => setSubject({ ageBand })}
          />
        </fieldset>

        <fieldset>
          <legend class="legend">性别</legend>
          <OptionGroup
            class="grid3"
            optClass="tall"
            options={[{ value: 'F', label: '女' }, { value: 'M', label: '男' }, { value: 'U', label: '不填' }]}
            value={subject.sex}
            onChange={(sex) => setSubject({ sex })}
          />
        </fieldset>

        <fieldset>
          <legend class="legend">肤色分型（Fitzpatrick）</legend>
          <OptionGroup
            class="fitz"
            optClass="mono"
            options={ROMAN.map((r, i) => ({
              value: (i + 1) as Fitzpatrick,
              aria: `${r} 型`,
              label: (<><span class="swatch" style={{ background: FITZ_COLORS[i] }} />{r}</>),
            }))}
            value={subject.fitzpatrick}
            onChange={(fitzpatrick) => setSubject({ fitzpatrick })}
          />
        </fieldset>

        <div class="grid2">
          <label class="field">吸烟
            <select class="select" value={subject.smoker ? 'y' : 'n'} onChange={(e) => setSubject({ smoker: e.currentTarget.value === 'y' })}>
              <option value="n">否</option>
              <option value="y">是</option>
            </select>
          </label>
          <label class="field">既往注射史
            <select class="select" value={subject.priorInjection}
              onChange={(e) => setSubject({ priorInjection: e.currentTarget.value as PriorInjection })}>
              <option value="none">无</option>
              <option value="lt6m">有，6 个月以内</option>
              <option value="gt6m">有，6 个月以上</option>
            </select>
          </label>
        </div>
        {subject.priorInjection !== 'none' && (
          <fieldset class="stack" style={{ gap: 10 }}>
            <legend class="legend">既往注射详情</legend>
            <div class="grid2">
              <label class="field">时间
                <input class="input mono" type="month" value={subject.priorWhen ?? ''} max={c.treatmentDate.slice(0, 7)}
                  onInput={(e) => setSubject({ priorWhen: e.currentTarget.value })}
                  onChange={(e) => setSubject({ priorWhen: e.currentTarget.value })} />
              </label>
              <label class="field">部位
                <select class="select" value={subject.priorArea ?? ''}
                  onChange={(e) => setSubject({ priorArea: e.currentTarget.value as Case['subject']['priorArea'] })}>
                  <option value="">请选择</option>
                  {AREAS.map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
                  <option value="other">其他 / 多个部位</option>
                </select>
              </label>
            </div>
            <label class="field">产品
              <input class="input" style={{ fontSize: 14 }} value={subject.priorProduct ?? ''} placeholder="如 玻尿酸 某品牌型号"
                onInput={(e) => setSubject({ priorProduct: e.currentTarget.value })} />
            </label>
            {subject.priorNote && (
              <p class="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
                旧版备注：{subject.priorNote}（请拆分填到上面三项，旧备注不会导出）
              </p>
            )}
          </fieldset>
        )}
      </section>

      <a class="btn primary big" href={caseHref(c.id, 'treatment')}>下一步：注射记录</a>
      <button class="linkbtn" style={{ color: 'var(--danger)', alignSelf: 'center' }} onClick={remove}>删除此病例</button>
    </main>
  );
}
