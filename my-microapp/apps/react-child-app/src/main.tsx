// Re-export qiankun lifecycle functions from lifeCycles
export { bootstrap, mount, unmount } from './lifeCycles';

// Import lifecycle functions for direct wiring
import { bootstrap, mount, unmount } from './lifeCycles';

// vite-plugin-qiankun uses import() in dev mode which runs outside qiankun's JS sandbox,
// so window.__POWERED_BY_QIANKUN__ is NOT set. But window.proxy IS set by qiankun's
// import-html-entry before scripts execute, so check both.
const isQiankun = (window as any).__POWERED_BY_QIANKUN__ || (window as any).proxy;

if (!isQiankun) {
  // Standalone mode: mount directly into our own #root
  mount({});
} else {
  // Qiankun mode: wire up lifecycle functions via window.proxy deferred mechanism.
  // vite-plugin-qiankun's HTML template creates deferred Promises on window['react-child-app']
  // that wait for window.proxy.vite{hookName}() to be called. In dev mode, the plugin's
  // .finally() callback relies on window.moudleQiankunAppLifeCycles which is never set,
  // so we wire up the lifecycle functions directly here.
  const proxy = (window as any).proxy;
  if (proxy) {
    if (proxy.vitebootstrap) proxy.vitebootstrap(() => bootstrap());
    if (proxy.vitemount) proxy.vitemount((props: any) => mount(props));
    if (proxy.viteunmount) proxy.viteunmount((props: any) => unmount(props));
    if (proxy.viteupdate) proxy.viteupdate((props: any) => {});
  }
}
