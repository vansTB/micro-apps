// Re-export qiankun lifecycle functions from lifeCycles
export { bootstrap, mount, unmount } from './lifeCycles';

// Mount function for standalone development mode
import { mount } from './lifeCycles';

const isQiankun = (window as any).__POWERED_BY_QIANKUN__;

if (!isQiankun) {
  mount({});
}
