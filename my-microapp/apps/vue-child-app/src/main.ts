import { createApp, type App as VueApp, ref, watch } from 'vue'
import { createRouter, createWebHistory, type Router } from 'vue-router'
import App from './App.vue'
import Home from './views/Home.vue'
import ProductList from './views/ProductList.vue'
import ProductDetail from './views/ProductDetail.vue'

let app: VueApp | null = null
let router: Router | null = null

function createChildRouter(): Router {
  const isQiankun = window.__POWERED_BY_QIANKUN__ || (window as any).proxy
  const routerBase = isQiankun ? '/vue-child' : '/'
  return createRouter({
    history: createWebHistory(routerBase),
    routes: [
      { path: '/', name: 'Home', component: Home },
      { path: '/product-list', name: 'ProductList', component: ProductList },
      { path: '/product-detail/:id', name: 'ProductDetail', component: ProductDetail },
    ],
  })
}

async function bootstrap() {
  console.log('[vue-child-app] bootstrap called')
}

function mount(props: any) {
  console.log('[vue-child-app] mount called with props:', props)

  // 从 qiankun props 获取主应用下发的 Zustand vanilla store
  if (props?.sharedStore) {
    ;(window as any).__sharedStore__ = props.sharedStore
  }

  const container = props?.container
    ? props.container.querySelector('#app') || props.container
    : document.getElementById('app')

  if (container) {
    router = createChildRouter()
    app = createApp(App)
    app.use(router)
    app.mount(container)
  }
}

function unmount(props: any) {
  console.log('[vue-child-app] unmount called with props:', props)

  // 清理全局 store 引用
  delete (window as any).__sharedStore__

  if (app) {
    app.unmount()
    app = null
    router = null
  }
}

// Standalone mode
if (!window.__POWERED_BY_QIANKUN__ && !(window as any).proxy) {
  const container = document.getElementById('app')
  if (container) {
    router = createChildRouter()
    app = createApp(App)
    app.use(router)
    app.mount(container)
  }
} else if ((window as any).proxy) {
  const proxy = (window as any).proxy
  if (proxy) {
    if (proxy.vitebootstrap) proxy.vitebootstrap(() => bootstrap())
    if (proxy.vitemount) proxy.vitemount((props: any) => mount(props))
    if (proxy.viteunmount) proxy.viteunmount((props: any) => unmount(props))
    if (proxy.viteupdate) proxy.viteupdate(() => {})
  }
}

export { bootstrap, mount, unmount }

declare global {
  interface Window {
    __POWERED_BY_QIANKUN__?: boolean
    __sharedStore__?: {
      getState: () => any
      setState: (partial: any) => void
      subscribe: (listener: (state: any) => void) => () => void
    }
  }
}
