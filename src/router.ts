import { useEffect, useState } from 'preact/hooks';

export type Step = 'consent' | 'treatment' | 'photos' | 'followup';
export const STEPS: Step[] = ['consent', 'treatment', 'photos', 'followup'];

export type Route =
  | { name: 'home' }
  | { name: 'case'; id: string; step: Step; query: URLSearchParams }
  | { name: 'export' }
  | { name: 'settings'; query: URLSearchParams };

export function parse(hash: string): Route {
  const [path, qs = ''] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(qs);
  if (parts[0] === 'case' && parts[1]) {
    const step = (STEPS as string[]).includes(parts[2]) ? (parts[2] as Step) : 'consent';
    return { name: 'case', id: decodeURIComponent(parts[1]), step, query };
  }
  if (parts[0] === 'export') return { name: 'export' };
  if (parts[0] === 'settings') return { name: 'settings', query };
  return { name: 'home' };
}

export const caseHref = (id: string, step: Step, query = '') =>
  `#/case/${encodeURIComponent(id)}/${step}${query ? '?' + query : ''}`;

export function go(href: string, replace = false) {
  if (replace) history.replaceState(null, '', href);
  else location.hash = href;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
