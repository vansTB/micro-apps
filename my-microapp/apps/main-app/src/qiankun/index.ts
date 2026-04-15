import { registerMicroApps, start } from 'qiankun'
import { sharedStore } from '../store/sharedStore'

/**
 * 把 vanilla store 下发给子应用。
 *
 * vanilla store = { getState, setState, subscribe }，纯 JS 对象，
 * 不依赖 React，可以安全跨越 qiankun JS 沙箱传递。
 *
 * React 子应用：安装 zustand，用 useStore(sharedStore, selector) 绑定
 * Vue 子应用：用 sharedStore.subscribe + sharedStore.getState 订阅
 */
function getSharedProps() {
  return {
    sharedStore,
  }
}

export { getSharedProps }

// 子应用入口地址：开发环境用 localhost，生产环境用子域名
// 通过 Vite 环境变量配置，见 .env.development / .env.production
const REACT_CHILD_ENTRY = import.meta.env.VITE_REACT_CHILD_ENTRY as string
const VUE_CHILD_ENTRY = import.meta.env.VITE_VUE_CHILD_ENTRY as string

// Initialize qiankun with registerMicroApps + start
export function initQiankun() {
  registerMicroApps([
    {
      name: 'react-child-app',
      entry: REACT_CHILD_ENTRY,
      container: '#subapp-container',
      activeRule: '/react-child',
      props: getSharedProps(),
    },
    {
      name: 'vue-child-app',
      entry: VUE_CHILD_ENTRY,
      container: '#subapp-container',
      activeRule: '/vue-child',
      props: getSharedProps(),
    },
  ])

  start({
    sandbox: { experimentalStyleIsolation: true },
    // Strip <script type="module"> tags that contain static import statements
    // (e.g. React Refresh preamble from @vitejs/plugin-react) because qiankun's
    // JS sandbox executes scripts via eval/new Function which doesn't support ESM syntax.
    getTemplate: (template: string) => {
      return template.replace(
        /<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/gi,
        (match, content) => {
          if (/^\s*import\s+/.test(content) || /;\s*import\s+/.test(content)) {
            return ''
          }
          return match
        }
      )
    },
  })
}
