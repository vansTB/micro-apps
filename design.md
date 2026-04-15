# 微前端架构设计文档

> 项目：my-microapp — 基于 qiankun 的微前端应用
> 技术栈：React 18 (主应用) + React 18 (子应用) + Vue 3 (子应用) + Vite 5 + vite-plugin-qiankun

---

## 一、项目结构

```
my-microapp/
├── apps/
│   ├── main-app/          # 主应用 (React, port 3000)
│   │   └── src/
│   │       ├── qiankun/
│   │       │   └── index.ts        # qiankun 注册与启动配置
│   │       ├── components/
│   │       │   └── Layout.tsx      # 全局布局（导航栏 + 子应用容器）
│   │       ├── pages/
│   │       │   └── Home.tsx        # 主页
│   │       ├── App.tsx             # 路由配置
│   │       ├── main.tsx            # 入口
│   │       └── index.css           # 全局样式
│   ├── react-child-app/   # React 子应用 (port 3001)
│   │   └── src/
│   │       ├── lifeCycles.tsx      # qiankun 生命周期函数
│   │       ├── main.tsx            # 入口 + 环境检测 + 生命周期注册
│   │       ├── App.tsx             # 子应用路由
│   │       └── pages/             # 页面组件
│   └── vue-child-app/     # Vue 子应用 (port 3002)
│       └── src/
│           ├── main.ts             # 入口 + 生命周期 + 环境检测
│           ├── App.vue             # 根组件
│           └── views/             # 页面组件
├── package.json
└── pnpm-workspace.yaml
```

---

## 二、样式隔离

### 2.1 方案选择

本项目使用 qiankun 的 `experimentalStyleIsolation`（实验性样式隔离）：

```typescript
// main-app/src/qiankun/index.ts
start({
  sandbox: { experimentalStyleIsolation: true },
})
```

### 2.2 experimentalStyleIsolation 工作原理

qiankun 在子应用容器内注入一个带 `data-qiankun` 属性的包裹 div：

```html
<div data-qiankun="react-child-app" data-name="react-child-app">
  <!-- 子应用内容 -->
</div>
```

对所有子应用的 CSS 规则，动态添加选择器前缀：

```css
/* 子应用原始 CSS */
.container { padding: 20px; }

/* 被改写后 */
div[data-qiankun="react-child-app"] .container { padding: 20px; }
```

### 2.3 各层级样式处理

| 层级 | 方案 | 说明 |
|------|------|------|
| 主应用全局样式 | `index.css` 中使用通用 reset | `* { margin: 0; box-sizing: border-box; }` |
| 主应用组件样式 | React inline style (`style={{}}`) | 不受样式隔离影响 |
| React 子应用样式 | inline style + experimentalStyleIsolation | 被自动添加作用域前缀 |
| Vue 子应用样式 | `<style scoped>` + experimentalStyleIsolation | 双重隔离：Vue scoped attribute + qiankun 选择器前缀 |

### 2.4 注意事项

- `experimentalStyleIsolation` 不使用 Shadow DOM，因此子应用的 CSS 仍然加载到主文档的 `<head>` 中，只是通过选择器前缀隔离
- 如果子应用使用全局 CSS（如 `body { ... }`），改写后变成 `div[data-qiankun="xxx"] body { ... }`，不会匹配到真实 `body`
- 主应用推荐使用 inline style 或 CSS Modules，避免被子应用的样式规则意外影响
- 如果需要更强隔离，可改用 `strictStyleIsolation: true`（使用 Shadow DOM），但 Shadow DOM 与 React 存在兼容性问题（如事件冒泡、portal 等）

---

## 三、路由系统

### 3.1 架构设计

```
┌──────────────────────────────────────────────┐
│  主应用 BrowserRouter                         │
│  ├── / (Layout)                               │
│  │   ├── index → <Home />                     │
│  │   ├── react-child/* → <div /> (占位)       │
│  │   └── vue-child/* → <div /> (占位)         │
│  │                                            │
│  │   #subapp-container ← qiankun 挂载点       │
│  │   ├── React 子应用 BrowserRouter           │
│  │   │   basename="/react-child"              │
│  │   │   ├── / → Dashboard                    │
│  │   │   ├── /user-list → UserList            │
│  │   │   └── /user-detail/:id → UserDetail    │
│  │   │                                        │
│  │   └── Vue 子应用 createWebHistory          │
│  │       base="/vue-child"                    │
│  │       ├── / → Home                         │
│  │       ├── /product-list → ProductList       │
│  │       └── /product-detail/:id → ProductDetail│
└──────────────────────────────────────────────┘
```

### 3.2 主应用路由配置

```tsx
// App.tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Layout />}>
      <Route index element={<Home />} />
      {/* 子路由由 qiankun 接管，这里只留空 div 占位 */}
      <Route path="react-child/*" element={<div />} />
      <Route path="vue-child/*" element={<div />} />
    </Route>
  </Routes>
</BrowserRouter>
```

```tsx
// Layout.tsx
function Layout() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/react-child">React Child App</Link>
        <Link to="/vue-child">Vue Child App</Link>
      </nav>
      <main>
        <Outlet />
        <div id="subapp-container" />
      </main>
    </div>
  )
}
```

**关键设计**：`<Outlet />` 和 `<div id="subapp-container" />` 并列放置。当访问子路由时，Outlet 渲染空 `<div />`，qiankun 将子应用加载到 `#subapp-container`。导航栏始终可见。

### 3.3 React 子应用路由

```tsx
// react-child-app/src/App.tsx
function App() {
  const isQiankun = window.__POWERED_BY_QIANKUN__ || window.proxy;
  const basename = isQiankun ? '/react-child' : '/';

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/user-list" element={<UserList />} />
        <Route path="/user-detail/:id" element={<UserDetail />} />
      </Routes>
    </BrowserRouter>
  )
}
```

**basename 机制**：`basename="/react-child"` 意味着：
- 路由 `/` 对应 URL `/react-child`
- 路由 `/user-list` 对应 URL `/react-child/user-list`
- `<Link to="/user-list">` 渲染为 `<a href="/react-child/user-list">`

### 3.4 Vue 子应用路由

```typescript
// vue-child-app/src/main.ts
function createChildRouter(): Router {
  const isQiankun = window.__POWERED_BY_QIANKUN__ || window.proxy
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
```

### 3.5 qiankun activeRule 与路由匹配

```typescript
// main-app/src/qiankun/index.ts
registerMicroApps([
  {
    name: 'react-child-app',
    activeRule: '/react-child',   // URL 以 /react-child 开头时激活
    container: '#subapp-container',
  },
  {
    name: 'vue-child-app',
    activeRule: '/vue-child',     // URL 以 /vue-child 开头时激活
    container: '#subapp-container',
  },
])
```

**匹配规则**：`activeRule` 为字符串时，qiankun 监听浏览器 URL 变化，当 URL 以该字符串开头时激活对应子应用，离开时调用 `unmount`。

### 3.6 路由冲突处理

主应用和子应用都监听浏览器 History API，但通过 basename/base 隔离：

| URL | 主应用匹配 | 子应用匹配 |
|-----|-----------|-----------|
| `/` | Layout + Home | 无 |
| `/react-child` | Layout + 空 div | React 子应用 `/` |
| `/react-child/user-list` | Layout + 空 div | React 子应用 `/user-list` |
| `/vue-child` | Layout + 空 div | Vue 子应用 `/` |
| `/vue-child/product-list` | Layout + 空 div | Vue 子应用 `/product-list` |

---

## 四、父子应用通信

### 4.1 通信方案：qiankun initGlobalState

```typescript
// main-app/src/qiankun/index.ts
import { initGlobalState } from 'qiankun'

const initialState = { user: null, theme: 'light' }
const actions = initGlobalState(initialState)

// 将 actions 通过 props 传递给子应用
registerMicroApps([{
  name: 'react-child-app',
  props: {
    setGlobalState: actions.setGlobalState,
    onGlobalStateChange: actions.onGlobalStateChange,
  },
}])
```

### 4.2 通信流程

```
主应用                        qiankun GlobalState                    子应用
  │                                │                                   │
  │  initGlobalState(initial)      │                                   │
  ├───────────────────────────────>│                                   │
  │                                │  mount(props)                      │
  │                                ├──────────────────────────────────>│
  │                                │                                   │
  │                                │  props.onGlobalStateChange(cb)    │
  │                                │<──────────────────────────────────┤
  │                                │                                   │
  │                                │  props.setGlobalState({...})      │
  │                                │<──────────────────────────────────┤
  │                                │                                   │
  │  onGlobalStateChange(cb)       │                                   │
  │<───────────────────────────────┤                                   │
```

### 4.3 React 子应用通信实现

```typescript
// react-child-app/src/lifeCycles.tsx
export async function mount(props: any) {
  // 监听主应用状态变化
  if (props.onGlobalStateChange) {
    props.onGlobalStateChange((state: any) => {
      console.log('[react-child-app] received state:', state)
    }, true)  // true = 立即触发一次回调获取当前状态
  }

  // 向主应用发送状态
  if (props.setGlobalState) {
    props.setGlobalState({
      fromReactChild: 'hello from react-child-app',
      timestamp: Date.now(),
    })
  }

  // 渲染子应用...
}
```

### 4.4 Vue 子应用通信实现

```typescript
// vue-child-app/src/main.ts
function mount(props: any) {
  // 监听主应用状态
  if (props?.onGlobalStateChange) {
    props.onGlobalStateChange((state: any) => {
      console.log('[vue-child-app] received state:', state)
    }, true)
  }

  // 向主应用发送状态
  if (props?.setGlobalState) {
    props.setGlobalState({
      from: 'vue-child-app',
      message: 'Vue child app mounted successfully',
    })
  }

  // 渲染子应用...
}
```

### 4.5 通信 API 说明

| API | 说明 | 调用方 |
|-----|------|-------|
| `actions.setGlobalState(state)` | 设置全局状态（合并） | 主应用 / 子应用 |
| `actions.onGlobalStateChange(cb, fireImmediately)` | 监听状态变化 | 主应用 / 子应用 |
| `actions.offGlobalStateChange()` | 取消监听 | 主应用 / 子应用 |

> **注意**：`initGlobalState` 已被 qiankun 标记为将在 3.0 移除。在生产项目中可考虑使用自定义事件总线或状态管理库替代。

---

## 五、生命周期管理

### 5.1 生命周期函数定义

每个子应用必须导出三个生命周期函数：

```typescript
export async function bootstrap() {
  // 初始化（仅首次加载时调用一次）
}

export async function mount(props: ContainerProps) {
  // 渲染子应用
  // props.container — qiankun 提供的容器节点
  // props.setGlobalState / props.onGlobalStateChange — 通信函数
}

export async function unmount(props: ContainerProps) {
  // 销毁子应用，释放资源
}
```

### 5.2 容器挂载策略

**React 子应用**：

```typescript
// lifeCycles.tsx
export async function mount(props: any) {
  // 优先在 qiankun 容器内查找 #root，找不到则使用容器本身
  const container = props.container
    ? props.container.querySelector('#root') || props.container
    : document.getElementById('root')  // standalone 模式 fallback

  if (container) {
    root = ReactDOM.createRoot(container)
    root.render(<App />)
  }
}

export async function unmount() {
  if (root) {
    root.unmount()
    root = null
  }
}
```

**Vue 子应用**：

```typescript
// main.ts
function mount(props: any) {
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

function unmount() {
  if (app) {
    app.unmount()
    app = null
    router = null
  }
}
```

### 5.3 环境检测与双模式入口

每个子应用需要同时支持**独立运行**和**作为微应用被加载**两种模式：

```typescript
// 通用模式
const isQiankun = window.__POWERED_BY_QIANKUN__ || (window as any).proxy;

if (!isQiankun) {
  // 独立模式：直接挂载到自己的 DOM
  mount({});
} else {
  // 微应用模式：手动连接 vite-plugin-qiankun 的 deferred 生命周期
  const proxy = (window as any).proxy;
  if (proxy) {
    proxy.vitebootstrap(() => bootstrap());
    proxy.vitemount((props) => mount(props));
    proxy.viteunmount((props) => unmount(props));
    proxy.viteupdate(() => {});
  }
  // 仍然需要 export 生命周期函数供 qiankun 调用
}
```

---

## 六、部署方案

### 6.1 开发环境

```bash
# 同时启动三个应用
pnpm dev

# 或单独启动
pnpm dev:main-app       # localhost:3000
pnpm dev:react-child    # localhost:3001
pnpm dev:vue-child      # localhost:3002
```

### 6.2 子应用 CORS 配置

子应用的 Vite 配置必须允许跨域，否则主应用无法通过 fetch 加载子应用：

```typescript
// vite.config.ts (子应用)
export default defineConfig({
  server: {
    port: 3001,
    headers: {
      'Access-Control-Allow-Origin': '*',  // 必须
    },
  },
})
```

### 6.3 生产部署架构

```
                    ┌─────────────┐
                    │   Nginx     │
                    │  反向代理    │
                    └──────┬──────┘
                           │
            ┌──────────────┼──────────────┐
            │              │              │
     ┌──────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
     │  main-app   │ │ react-   │ │  vue-child  │
     │  :80        │ │ child    │ │  :80        │
     │             │ │ :80/     │ │             │
     └─────────────┘ │ react/   │ └─────────────┘
                     └──────────┘
```

**Nginx 配置参考**：

```nginx
server {
    listen 80;

    # 主应用
    location / {
        proxy_pass http://main-app:80;
    }

    # React 子应用静态资源
    location /react-child/ {
        proxy_pass http://react-child:80/;
    }

    # Vue 子应用静态资源
    location /vue-child/ {
        proxy_pass http://vue-child:80/;
    }
}
```

**子应用生产构建注意事项**：

1. 子应用的 `entry` 需要改为相对路径（不再是 `//localhost:3001`）
2. 子应用 Vite 构建配置需要设置 `base`：

```typescript
// vite.config.ts (生产构建)
export default defineConfig({
  base: window.__POWERED_BY_QIANKUN__ ? '/react-child/' : '/',
})
```

3. qiankun 注册时的 `entry` 需要根据环境切换：

```typescript
const isDev = process.env.NODE_ENV === 'development'

registerMicroApps([{
  name: 'react-child-app',
  entry: isDev ? '//localhost:3001' : '/react-child/',
  container: '#subapp-container',
  activeRule: '/react-child',
}])
```

### 6.4 跨环境配置总结

| 配置项 | 开发环境 | 生产环境 |
|-------|---------|---------|
| 子应用 entry | `//localhost:{port}` | `/child-path/` |
| CORS | Vite `headers` 配置 | Nginx / CDN 配置 |
| 资源 publicPath | Vite dev 自动处理 | 需要设置 `base` 或 `__INJECTED_PUBLIC_PATH_BY_QIANKUN__` |
| HMR | Vite 原生支持 | 不适用 |

---

## 七、Vite 配置要点

### 7.1 vite-plugin-qiankun 配置

```typescript
// 所有应用（包括主应用）都需要配置
import qiankun from 'vite-plugin-qiankun'

export default defineConfig({
  plugins: [
    qiankun('app-name', {
      useDevMode: true,  // 开发模式
    }),
  ],
})
```

### 7.2 主应用额外配置

```typescript
// 主应用需要额外的 getTemplate 配置
start({
  sandbox: { experimentalStyleIsolation: true },
  getTemplate: (template) => {
    // 过滤 React Refresh 等包含静态 import 的 module 脚本
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
```

### 7.3 子应用 Vite 配置

```typescript
// react-child-app/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig({
  plugins: [
    react(),
    qiankun('react-child-app', { useDevMode: true }),
  ],
  server: {
    port: 3001,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
})
```

```typescript
// vue-child-app/vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import qiankun from 'vite-plugin-qiankun'

export default defineConfig({
  plugins: [
    vue(),
    qiankun('vue-child-app', { useDevMode: true }),
  ],
  server: {
    port: 3002,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
})
```
