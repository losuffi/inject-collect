import { useCase } from '../hooks';
import type { Step } from '../router';
import { CaseHeader } from '../components/common';
import { ConsentStep } from './Consent';
import { TreatmentStep } from './Treatment';
import { PhotosStep } from './Photos';
import { FollowupStep } from './Followup';

export function CaseScreen({ id, step, query }: { id: string; step: Step; query: URLSearchParams }) {
  const [c, update, flush] = useCase(id);
  if (c === undefined) return null;
  if (c === null) {
    return (
      <main class="page">
        <p>找不到病例 {id}。</p>
        <a class="btn" href="#/">返回病例列表</a>
      </main>
    );
  }
  const props = { c, update, flush, query };
  return (
    <>
      <CaseHeader c={c} step={step} />
      {step === 'consent' && <ConsentStep {...props} />}
      {step === 'treatment' && <TreatmentStep {...props} />}
      {step === 'photos' && <PhotosStep {...props} />}
      {step === 'followup' && <FollowupStep {...props} />}
    </>
  );
}
