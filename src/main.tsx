import { render } from 'preact';
import '@fontsource/ibm-plex-mono/latin-500.css';
import './styles.css';
import { App } from './App';

// 尽量申请持久化存储，降低浏览器自动清理本机数据的可能（SPEC 6）
void navigator.storage?.persist?.().catch(() => undefined);

if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
} else {
  import('./dev/seed').then(({ seed }) => Object.assign(window, { __seed: seed }));
}

render(<App />, document.getElementById('app')!);
