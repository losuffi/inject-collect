import type { Case } from '../lib/model';

export type StepProps = {
  c: Case;
  update: (fn: (c: Case) => Case) => void;
  flush: () => void;
  query: URLSearchParams;
};
