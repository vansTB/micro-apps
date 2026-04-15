# qiankun 微前端项目实战总结（面试版）

> 基于一个真实项目：React 主应用 + React 子应用 + Vue3 子应用，pnpm monorepo 管理。

---

## 一、项目整体架构

### 1.1 技术选型

| 层面 | 选型 | 原因 |
|------|------|------|
| 微前端框架 | qiankun 2.x | 阿里开源、社区活跃、基于 single-spa 封装、提供 JS 沙箱和样式隔离 |
| 构建工具 | Vite 5 + TypeScript | 开发体验好、HMR 快、原生 ESM |
| 主应用 | React 18 + React Router 6 | 主流选择 |
| 子应用 A | React 18 + React Router 6 | 演示同框架子应用 |
| 子应用 B | Vue 3 + Vue Router 4 | 演示跨框架子应用 |
| 状态管理 | Zustand vanilla store | 轻量、无 React 依赖、天然支持跨沙箱传递 |
| 包管理 | pnpm workspace monorepo | 子应用共享类型定义、统一构建脚本 |

### 1.2 目录结构

```
my-microapp/
├── package.json                 # monorepo 根配置
├── pnpm-workspace.yaml          # pnpm workspace 定义
├── nginx.conf                   # 生产部署配置
├── apps/
│   ├── main-app/                # 主应用（基座），端口 3000
│   │   ├── vite.config.ts
│   │   ├── .env.development     # 子应用入口 localhost:3001/3002
│   │   ├── .env.production      # 子应用入口 react.app.xxx / vue.app.xxx
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── qiankun/index.ts        # qiankun 注册配置
│   │       ├── store/sharedStore.ts    # Zustand vanilla store
│   │       ├── pages/Home.tsx          # 通信展示页面
│   │       └── components/Layout.tsx   # 导航 + 子应用容器
│   ├── react-child-app/         # React 子应用，端口 3001
│   │   └── src/
│   │       ├── main.tsx                # 入口（standalone / qiankun 双模式）
│   │       ├── lifeCycles.tsx          # qiankun 生命周期
│   │       ├── hooks/useSharedStore.ts # 子应用 store 适配层
│   │       └── pages/
│   └── vue-child-app/           # Vue 3 子应用，端口 3002
│       └── src/
│           ├── main.ts                 # 入口 + 生命周期
│           └── composables/useSharedStore.ts  # Vue composable 适配层
└── packages/
    └── shared/                  # 共享类型定义（SharedState、Message 等）
```

### 1.3 整体通信架构图

```
┌─────────────────────────────────────────────────────────┐
│                     Main App (基座)                      │
│                                                         │
│   sharedStore = createStore(...)   ← Zustand vanilla    │
│   (纯 JS 对象，不含 React 依赖)                          │
│                                                         │
│   qiankun registerMicroApps:                            │
│     props: { sharedStore }  ──── 下发给所有子应用         │
│             ↙                    ↘                      │
│  ┌──────────────────┐    ┌──────────────────┐           │
│  │ React Child App  │    │  Vue Child App   │           │
│  │                  │    │                  │           │
│  │ useStore(        │    │ ref + subscribe  │           │
│  │   sharedStore,   │    │ (sharedStore)    │           │
│  │   selector       │    │                  │           │
│  │ )                │    │                  │           │
│  └──────────────────┘    └──────────────────┘           │
│         ↕ 同一个 store 实例，状态实时同步 ↕              │
└─────────────────────────────────────────────────────────┘
```

---

## 二、基座（主应用）设计

### 2.1 qiankun 注册与启动

```ts
// main-app/src/qiankun/index.ts
import { registerMicroApps, start } from 'qiankun'
import { sharedStore } from '../store/sharedStore'

export function initQiankun() {
  registerMicroApps([
    {
      name: 'react-child-app',
      entry: '//localhost:3001',       // 开发环境入口
      container: '#subapp-container',   // 子应用挂载容器
      activeRule: '/react-child',       // 路由匹配规则
      props: { sharedStore },           // 下发共享 store
    },
    {
      name: 'vue-child-app',
      entry: '//localhost:3002',
      container: '#subapp-container',
      activeRule: '/vue-child',
      props: { sharedStore },
    },
  ])

  start({
    sandbox: { experimentalStyleIsolation: true },
    getTemplate: stripESMScripts,  // 处理 ESM 兼容性（详见后文）
  })
}
```

**关键设计决策：**

- `entry` 配置提取到 `.env.development` / `.env.production` 环境变量，开发用 localhost，生产用子域名
- `container` 指向 Layout 组件中的 `<div id="subapp-container" />`，所有子应用共享同一个容器（同时只显示一个）
- `props` 下发 vanilla store 实例，实现跨应用状态同步

### 2.2 主应用路由设计

```tsx
// main-app/src/App.tsx
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="react-child/*" element={<div />} />
          <Route path="vue-child/*" element={<div />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
```

**为什么子路由渲染空 `<div>`？**

因为 qiankun 根据 `activeRule` 监听路由变化，匹配时自动加载子应用到 `#subapp-container`。React Router 这边只需要留一个占位，实际的子应用渲染由 qiankun 接管。

### 2.3 Layout 与子应用容器

```tsx
// main-app/src/components/Layout.tsx
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
        <div id="subapp-container" />  {/* qiankun 子应用挂载点 */}
      </main>
    </div>
  )
}
```

---

## 三、子应用接入规范

### 3.1 生命周期导出

每个子应用必须导出三个生命周期函数：

```ts
// 子应用的入口文件必须导出：
export async function bootstrap() { /* 初始化，只执行一次 */ }
export async function mount(props) { /* 挂载，接收主应用下发的 props */ }
export async function unmount(props) { /* 卸载，清理副作用 */ }
```

### 3.2 双模式启动（standalone + qiankun）

子应用需要同时支持**独立运行**和**作为微应用被加载**：

```ts
// react-child-app/src/main.tsx
const isQiankun = window.__POWERED_BY_QIANKUN__ || window.proxy

if (!isQiankun) {
  // 独立开发模式：直接 mount
  mount({})
} else if (window.proxy) {
  // qiankun 开发模式（vite-plugin-qiankun）：
  // 通过 window.proxy 的 deferred callback 接入生命周期
  const proxy = window.proxy
  if (proxy.vitebootstrap) proxy.vitebootstrap(() => bootstrap())
  if (proxy.vitemount) proxy.vitemount((props) => mount(props))
  if (proxy.viteunmount) proxy.viteunmount((props) => unmount(props))
}
```

**为什么要判断两种 qiankun 标识？**

- `window.__POWERED_BY_QIANKUN__`：生产环境下 qiankun 在子应用执行前设置
- `window.proxy`：开发环境下 vite-plugin-qiankun 通过 `import()` 加载子应用，此时不在 qiankun 的 JS 沙箱内，`__POWERED_BY_QIANKUN__` 未设置，但 `window.proxy` 存在

### 3.3 Vite 配置要点

```ts
// 子应用 vite.config.ts 的两个关键配置：
export default defineConfig({
  plugins: [
    react(),
    qiankun('react-child-app', { useDevMode: true }),  // vite-plugin-qiankun
  ],
  server: {
    port: 3001,
    headers: {
      'Access-Control-Allow-Origin': '*',  // 必须！qiankun 需要跨域 fetch 子应用 HTML
    },
  },
})
```

**为什么需要 CORS？**

qiankun 通过 `import-html-entry` 跨域 fetch 子应用的入口 HTML，然后解析其中的 JS/CSS 在主应用环境中执行。如果子应用不允许跨域，fetch 会失败。

**为什么需要 `vite-plugin-qiankun`？**

Vite 原生输出 ESM 模块，但 qiankun 的 JS 沙箱基于 `eval` / `new Function` 执行代码，不支持 `import` 语法。该插件将 Vite 输出转换为 qiankun 兼容的 UMD/CJS 格式，并处理生命周期导出。

### 3.4 子应用路由 basename

```ts
// React 子应用
const isQiankun = window.__POWERED_BY_QIANKUN__ || window.proxy
const basename = isQiankun ? '/react-child' : '/'

return (
  <BrowserRouter basename={basename}>
    <Routes>...</Routes>
  </BrowserRouter>
)

// Vue 子应用同理
const routerBase = isQiankun ? '/vue-child' : '/'
createRouter({ history: createWebHistory(routerBase), routes })
```

---

## 四、样式隔离

### 4.1 qiankun 提供的隔离方案

```ts
start({
  sandbox: { experimentalStyleIsolation: true }
})
```

`experimentalStyleIsolation` 的工作原理：为子应用的样式添加类似 `div[data-qiankun="react-child-app"]` 的属性选择器前缀，实现样式作用域隔离。

**另一种方案** `strictStyleIsolation: true`：使用 Shadow DOM，隔离更彻底但兼容性问题更多（弹窗组件的 portal、antd 的 Modal 等可能失效）。

### 4.2 实践中的样式问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 主应用全局样式污染子应用 | CSS 没有作用域 | 主应用谨慎使用全局样式，子应用使用 scoped / CSS Modules |
| antd/element-plus 弹窗样式异常 | 弹窗挂载到 `document.body`，脱离子应用容器 | 动态修改 `getPopupContainer` / `getContainer` 指向子应用容器 |
| 子应用间样式冲突 | 同名 CSS class | BEM 命名规范 / CSS Modules / 每个子应用加唯一前缀 |
| `experimentalStyleIsolation` 对 `@keyframes` 无效 | 动画名不在选择器作用域内 | 手动加命名前缀 |

---

## 五、跨应用通信（核心设计）

### 5.1 方案演进过程

我们经历了三个阶段的方案迭代：

**阶段一：qiankun `initGlobalState`（官方方案）**

```ts
// 主应用
const actions = initGlobalState({ user: null, theme: 'light' })
actions.onGlobalStateChange((state) => { /* 监听 */ })

// 子应用通过 props 接收
props.onGlobalStateChange((state) => { /* 监听 */ })
props.setGlobalState({ user: { name: 'xxx' } })
```

**问题：**
- `setGlobalState` 做浅合并，且有严格的 key 校验——只能设置 `initGlobalState` 中已声明的 key
- 无法传递函数/实例对象（只支持可序列化数据）
- 父子应用紧耦合，子应用必须知道主应用用了 qiankun

**阶段二：直接传递 Zustand hook（失败）**

```ts
// 主应用
const useSharedStore = create<SharedStore>((set) => ({ ... }))

// 通过 props 下发
registerMicroApps([{ props: { useSharedStore } }])
```

**报错：** `Invalid hook call. Hooks can only be called inside of the body of a function component`

**原因：** qiankun 的 JS 沙箱让每个应用有独立的模块系统。主应用的 `useSharedStore` 内部绑定了**主应用的 React**，但子应用组件运行在**子应用自己的 React** 上。两个 React 实例 → hook 调用无效。

```
主应用的 React (实例 A)
    └── useSharedStore hook 绑定了 React A 的 useState/useReducer

子应用的 React (实例 B)
    └── 组件函数体中调用 useSharedStore → React B 发现 hook 来自 React A → 报错
```

**阶段三：Zustand vanilla store（最终方案）**

```ts
// 主应用：用 vanilla 模式创建 store（不依赖 React）
import { createStore } from 'zustand/vanilla'

export const sharedStore = createStore<SharedStore>((set) => ({
  user: null,
  messages: [],
  setUser: (user) => set({ user }),
  addMessage: (from, content) => set((state) => ({
    messages: [...state.messages, { id: '...', from, content, timestamp: Date.now() }],
  })),
}))

// 主应用自己的 hook（仅在主应用内使用）
export function useSharedStore(selector) {
  return useStore(sharedStore, selector)
}
```

**vanilla store 的本质：** `createStore` 返回 `{ getState, setState, subscribe }` 三个纯函数组成的普通 JS 对象，没有任何 React 依赖。因此可以安全地跨 qiankun JS 沙箱传递。

### 5.2 React 子应用接入

```ts
// react-child-app/src/hooks/useSharedStore.ts
import { useStore } from 'zustand'        // 子应用自己的 zustand
import type { StoreApi } from 'zustand'

let _vanillaStore: StoreApi<SharedStore> | null = null

export function setSharedStoreFromProps(store: StoreApi<SharedStore>) {
  _vanillaStore = store
}

export function useSharedStore(selector) {
  // 用子应用自己的 React + zustand 绑定主应用的 vanilla store
  return useStore(_vanillaStore, selector)
}
```

```ts
// react-child-app/src/lifeCycles.tsx
export async function mount(props) {
  if (props.sharedStore) {
    setSharedStoreFromProps(props.sharedStore)  // 保存 vanilla store 引用
  }
  // ... 创建 React root 并渲染
}
```

**关键：** 子应用也安装了 zustand，用**自己的** `useStore` hook 绑定**主应用的** vanilla store。hook 走子应用的 React，store 数据走主应用的实例。

### 5.3 Vue 子应用接入

Vue 子应用不需要安装 Zustand，直接用 vanilla store 的 `subscribe` + `getState`：

```ts
// vue-child-app/src/composables/useSharedStore.ts
export function useSharedStore() {
  const store = window.__sharedStore__
  const state = ref(store ? { ...store.getState() } : {})

  let unsubscribe = null

  onMounted(() => {
    if (store) {
      unsubscribe = store.subscribe((newState) => {
        state.value = { ...newState }  // 触发 Vue 响应式更新
      })
    }
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  return {
    user: computed(() => state.value.user),
    messages: computed(() => state.value.messages),
    addMessage: (from, content) => store.getState().addMessage(from, content),
    // ...
  }
}
```

### 5.4 通信场景总结

| 场景 | 实现方式 | 示例 |
|------|---------|------|
| **父→子** | 主应用调用 `sharedStore.getState().setUser(...)` | 子应用自动响应 |
| **子→父** | 子应用调用同一个 store 的 `addMessage(...)` | 主应用 Home 页面实时显示 |
| **子↔子（兄弟）** | A 子应用写入 store → B 子应用 subscribe 收到通知 | React 子应用发送消息，Vue 子应用列表更新 |

所有应用操作的是**同一个内存中的 store 实例**（通过 qiankun props 传递的 JS 对象引用），状态变化是同步的、即时的。

---

## 六、开发中遇到的关键问题与解决

### 6.1 ESM 脚本与 qiankun 沙箱冲突

**现象：** 子应用加载后白屏，控制台报 `import` 语法错误。

**原因：** Vite 开发模式下输出 `<script type="module">` 标签（如 React Refresh preamble），而 qiankun 通过 `eval` / `new Function` 执行子应用 JS，不支持 ESM 的 `import` 语法。

**解决：** 在 `start()` 中配置 `getTemplate`，在 HTML 模板中移除含 `import` 语句的 `<script type="module">` 标签：

```ts
start({
  getTemplate: (template) => {
    return template.replace(
      /<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/gi,
      (match, content) => {
        if (/^\s*import\s+/.test(content) || /;\s*import\s+/.test(content)) {
          return ''  // 移除含 import 的 module script
        }
        return match
      }
    )
  },
})
```

同时使用 `vite-plugin-qiankun` 插件将子应用输出转为 qiankun 兼容格式。

### 6.2 双 React 实例导致 Invalid Hook Call

**现象：** 子应用报 `Invalid hook call. Hooks can only be called inside of the body of a function component`。

**根因分析：**

```
qiankun JS 沙箱
├── 主应用模块空间
│   └── react (实例 A) ← 主应用 useSharedStore 绑定此 React
│
└── 子应用模块空间
    └── react (实例 B) ← 子应用组件渲染使用此 React
```

当子应用组件调用主应用传来的 `useSharedStore` 时，hook 内部访问的是 React A 的 `ReactDispatcher`，但当前执行环境是 React B 的渲染流程，React B 不认识这个 hook 调用。

**解决：** 见第五节——用 vanilla store 分离数据和 UI 绑定。

### 6.3 `initGlobalState` key 校验报错

**现象：** `[qiankun] 'from' not declared when init state!`

**原因：** `initGlobalState` 有严格的 key 校验机制，`setGlobalState` 只能设置初始化时已声明的 key。如果子应用 `setGlobalState({ from: 'xxx' })` 但初始化状态中没有 `from` 字段，就会报这个警告。

**解决：** 迁移到 Zustand vanilla store 方案后，不再使用 `initGlobalState`，彻底避免此问题。

### 6.4 子应用卸载不干净（内存泄漏）

**要点：** `unmount` 生命周期中必须清理所有副作用：

```ts
// React 子应用
export async function unmount() {
  if (root) {
    root.unmount()    // 卸载 React 树
    root = null       // 释放引用
  }
}

// Vue 子应用
function unmount() {
  delete window.__sharedStore__  // 清理全局 store 引用
  if (app) {
    app.unmount()
    app = null
    router = null
  }
}
```

**常见遗漏：**
- 全局事件监听器（`window.addEventListener`）未移除
- 定时器（`setInterval`/`setTimeout`）未清除
- 全局变量（`window.xxx`）未删除
- WebSocket 连接未关闭

---

## 七、生产部署

### 7.1 Nginx 配置（子域名方案）

```nginx
# 主应用
server {
    listen 80;
    server_name app.example.com;
    root /usr/share/nginx/html/main-app;

    location / {
        try_files $uri $uri/ /index.html;  # SPA fallback
    }
}

# React 子应用 —— 必须配置 CORS！
server {
    listen 80;
    server_name react.app.example.com;
    root /usr/share/nginx/html/react-child-app;

    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods 'GET, OPTIONS';

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**为什么子应用需要 CORS？** 生产环境中主应用（`app.example.com`）需要跨域 fetch 子应用（`react.app.example.com`）的入口 HTML。

### 7.2 环境变量切换

```ts
// .env.development
VITE_REACT_CHILD_ENTRY=//localhost:3001

// .env.production
VITE_REACT_CHILD_ENTRY=//react.app.example.com
```

主应用通过 `import.meta.env.VITE_REACT_CHILD_ENTRY` 读取，实现开发/生产环境自动切换。

---

## 八、面试高频问题整理

### 8.1 架构设计类

**Q: 为什么选择 qiankun 而不是 Module Federation / iframe？**

| 方案 | 优点 | 缺点 |
|------|------|------|
| **qiankun** | JS 沙箱隔离、样式隔离、技术栈无关、社区成熟 | 需要改造子应用、有兼容性成本 |
| **Module Federation** | Webpack 5 原生支持、共享依赖、粒度灵活 | 绑定 Webpack、无沙箱隔离、跨版本共享复杂 |
| **iframe** | 天然隔离、零改造 | 性能差、SEO 不友好、弹窗/路由体验差、跨域限制多 |
| **wujie** | 基于 iframe + WebComponent、体验好 | 较新、社区相对小 |

**Q: 主应用基座有哪些职责？**

1. **路由分发**：根据 URL 匹配并加载对应子应用
2. **子应用注册**：配置 entry、container、activeRule
3. **共享状态管理**：创建并下发全局 store
4. **公共资源提供**：公共依赖、UI 组件库、工具函数
5. **全局错误处理**：子应用加载失败时的降级策略
6. **权限控制**：统一登录态、菜单权限

**Q: 子应用独立开发时怎么跑？**

每个子应用都是一个完整的项目，有独立的 `package.json`、Vite 配置、路由系统。通过判断 `window.__POWERED_BY_QIANKUN__` 决定是独立运行还是作为微应用。独立运行时直接 `mount({})` 即可。

### 8.2 通信类

**Q: 微前端通信有哪些方案？**

| 方案 | 原理 | 适用场景 |
|------|------|---------|
| qiankun `initGlobalState` | 观察者模式 | 简单状态共享 |
| Props 传参 | registerMicroApps 的 props | 配置下发 |
| **Zustand vanilla store（本项目）** | 共享纯 JS 对象 | 复杂状态、跨框架 |
| CustomEvent | 浏览器原生事件 | 松耦合事件通知 |
| localStorage/sessionStorage | 持久化存储 | 简单持久化（不推荐高频使用） |
| BroadcastChannel | 浏览器 API | 多标签页通信 |

**Q: 为什么不能直接把 Zustand hook 传给子应用？**

因为 qiankun 的 JS 沙箱隔离导致主应用和子应用各自有一份 React 实例。Zustand 的 hook 内部调用了 React 的 `useState`/`useReducer`，它绑定的是主应用的 React。子应用组件运行在子应用的 React 上，调用来自另一个 React 实例的 hook 就会触发 "Invalid hook call" 错误。

**Q: vanilla store 方案的核心思路是什么？**

**数据层与视图层分离。** `zustand/vanilla` 的 `createStore` 产出一个纯 JS 对象 `{ getState, setState, subscribe }`，不依赖任何 UI 框架。主应用创建这个对象，通过 qiankun props 传递给子应用。子应用用自己框架的响应式系统（React 的 `useStore` / Vue 的 `ref` + `subscribe`）绑定同一个 store 实例。数据是同一份，UI 绑定是各管各的。

**Q: 兄弟应用怎么通信？**

通过共享 store 中转。子应用 A 写入 store → store 触发 subscribe → 子应用 B 收到通知。本质上不是 A 直接找 B，而是 A → 全局 store → B，主应用作为中转。

### 8.3 沙箱与隔离类

**Q: qiankun 的 JS 沙箱是怎么实现的？**

qiankun 提供三种沙箱模式：

1. **Legacy沙箱（Proxy）**：单实例模式，通过 Proxy 代理 window 对象，记录子应用对 window 的修改，卸载时恢复
2. **Proxy沙箱**：多实例模式，为每个子应用创建一个 fakeWindow（Proxy 代理），完全隔离
3. **Snapshot沙箱**：快照模式（不支持 Proxy 时的降级方案），加载时快照 window，卸载时恢复

**Q: JS 沙箱能完全隔离吗？有什么限制？**

不能完全隔离：
- `window.parent`、`window.top` 等属性无法被代理
- 通过 `document.body.appendChild` 等直接操作 DOM 的行为不受沙箱控制
- `with` 语句中的变量查找可能绕过 Proxy
- 某些第三方库直接缓存了 `window` 引用，导致沙箱失效

**Q: 样式隔离有哪些方案？**

| 方案 | 原理 | 局限 |
|------|------|------|
| `experimentalStyleIsolation` | 运行时给 CSS 选择器加 `div[data-qiankun]` 前缀 | `@keyframes`、动态样式可能失效 |
| `strictStyleIsolation` | Shadow DOM | 弹窗组件（Portal）、antd Modal 等可能异常 |
| CSS Modules / scoped | 编译时隔离 | 需要子应用配合 |
| BEM 命名 + 前缀 | 约束 | 人工维护成本 |

### 8.4 性能与加载类

**Q: 子应用是懒加载的吗？**

是的。qiankun 默认按需加载——只有当路由匹配 `activeRule` 时才会 fetch 子应用的 HTML/JS/CSS。切换走后执行 `unmount` 卸载。

如果需要预加载，可以用 `prefetch: 'all'` 或 `prefetch: (apps) => ...` 配置：

```ts
start({ prefetch: 'all' })  // 在第一个微应用挂载后预加载所有其他微应用
```

**Q: 子应用加载失败怎么处理？**

qiankun 提供全局错误钩子：

```ts
import { addGlobalUncaughtErrorHandler } from 'qiankun'

addGlobalUncaughtErrorHandler((event) => {
  console.error('子应用加载失败:', event)
  // 降级：显示错误提示或加载备用组件
  document.getElementById('subapp-container').innerHTML = `
    <div>子应用加载失败，请刷新页面重试</div>
  `
})
```

**Q: 公共依赖怎么处理？重复加载 React/ReactDOM 怎么优化？**

1. **Webpack externals + CDN**：子应用配置 `externals: { react: 'React' }`，运行时共享主应用加载的 React
2. **qiankun 不直接支持共享依赖**，但可以通过 `window` 全局变量实现
3. **Module Federation** 是 Webpack 5 原生的共享依赖方案，但需要从 qiankun 迁移

本项目开发环境未做公共依赖优化（每个应用独立加载），生产环境可通过 externals 方案优化。

### 8.5 踩坑与 Debug

**Q: vite + qiankun 有什么兼容问题？**

1. Vite 输出 ESM，qiankun 不支持 → 需要 `vite-plugin-qiankun`
2. `<script type="module">` 中的 `import` 语法在 `eval` 中报错 → 需要 `getTemplate` 过滤
3. React Refresh 的 preamble 脚本被 qiankun 重复执行 → 同上，过滤掉即可
4. `vite-plugin-qiankun` dev 模式下 `window.proxy` 替代 `__POWERED_BY_QIANKUN__` → 子应用需要同时检查两个标识

**Q: 子应用中弹窗组件（antd Modal/Drawer）样式或挂载位置异常怎么办？**

因为弹窗默认挂载到 `document.body`，可能脱离子应用容器和样式隔离范围。解决：

```tsx
// antd
<ConfigProvider getPopupContainer={() => document.getElementById('subapp-container')!}>
  <App />
</ConfigProvider>

// 或 antd v5
<App getPopupContainer={() => document.getElementById('subapp-container')!}>
```

**Q: 子应用路由和主应用路由怎么协调？**

- 主应用使用 `<Route path="react-child/*" element={<div />} />` 匹配所有 react-child 开头的路由
- 子应用设置 `basename="/react-child"`
- qiankun 的 `activeRule` 和 React Router 的 `basename` 必须一致
- 子应用内部路由跳转使用相对路径（如 `navigate('/user-list')` 而非 `/react-child/user-list`）

---

## 九、项目亮点总结（面试话术）

1. **pnpm monorepo 管理**：主应用、子应用、共享包统一管理，共享类型定义复用
2. **Zustand vanilla store 跨沙箱通信**：数据层（纯 JS store）与视图层（React/Vue 各自绑定）分离，解决了双 React 实例的 Invalid Hook Call 问题
3. **完整的生命周期管理**：双模式启动、mount 时保存 store、unmount 时清理所有副作用
4. **ESM 兼容处理**：通过 `getTemplate` 和 `vite-plugin-qiankun` 解决 Vite + qiankun 的模块系统冲突
5. **生产部署方案**：子域名部署 + CORS 配置 + 环境变量切换 + Nginx SPA fallback
6. **跨框架通信**：同一套 store 同时支持 React（useStore hook）和 Vue（ref + subscribe）子应用
