import { createApp } from 'vue'
import App from './App.vue'
import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import ProductList from './views/ProductList.vue'
import ProductDetail from './views/ProductDetail.vue'

// Determine base path based on environment
const routerBase = window.__POWERED_BY_QIANKUN__ ? '/vue-child' : '/'

// Create router
const router = createRouter({
  history: createWebHistory(routerBase),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: Home,
    },
    {
      path: '/product-list',
      name: 'ProductList',
      component: ProductList,
    },
    {
      path: '/product-detail/:id',
      name: 'ProductDetail',
      component: ProductDetail,
    },
  ],
})

// Mount function for qiankun
function mount(props: any) {
  console.log('[vue-child-app] mount called with props:', props)

  if (props?.onGlobalStateChange) {
    props.onGlobalStateChange((state: any) => {
      console.log('[vue-child-app] received state from main:', state)
    }, true)
  }

  if (props?.setGlobalState) {
    props.setGlobalState({
      from: 'vue-child-app',
      message: 'Vue child app mounted successfully',
    })
  }

  // Use props.container (qiankun-provided) or fallback to document #app
  const container = props.container
    ? props.container.querySelector('#app') || props.container
    : document.getElementById('app')

  if (container) {
    const app = createApp(App)
    app.use(router)
    app.mount(container)
  }
}

// Unmount function for qiankun
function unmount(props: any) {
  console.log('[vue-child-app] unmount called with props:', props)

  if (props?.setGlobalState) {
    props.setGlobalState({
      from: 'vue-child-app',
      message: 'Vue child app unmounted',
    })
  }

  const container = props?.container || document.getElementById('app')
  if (container) {
    container.innerHTML = ''
  }
}

// Bootstrap function for qiankun
async function bootstrap() {
  console.log('[vue-child-app] bootstrap called')
}

// Standalone mode (development without qiankun)
if (!window.__POWERED_BY_QIANKUN__) {
  const container = document.getElementById('app')
  if (container) {
    const app = createApp(App)
    app.use(router)
    app.mount(container)
  }
}

// Export qiankun lifecycle functions
export { bootstrap, mount, unmount }

// Type definitions for qiankun
declare global {
  interface Window {
    __POWERED_BY_QIANKUN__?: boolean
  }
}
