# qiankun + Vite 微前端开发问题排查与解决文档

## 问题总览

本项目在使用 qiankun + Vite + vite-plugin-qiankun 搭建微前端架构时，遇到了以下三个核心问题：

| # | 问题现象 | 根因分类 | 影响范围 |
|---|---------|---------|---------|
| 1 | 访问 React 子应用时父应用样式/内容消失 | 环境检测失败 | React / Vue 子应用均受影响 |
| 2 | 访问 Vue 子应用时页面报错 | 环境检测 + 路由配置 | Vue 子应用 |
| 3 | 子应用生命周期函数不触发，内容不渲染 | 插件 deferred 机制失效 | 所有子应用 |

---

## 问题一：父应用内容被子应用覆盖

### 现象

访问 `/react-child` 时，父应用的导航栏和全部内容消失，页面上只剩下子应用内容。

### 排查思路

```
现象：父应用内容消失
  → 怀疑 DOM 被覆盖
    → 检查子应用 mount 函数的容器选择逻辑
      → mount({}) 时 props.container 为空
        → fallback 到 document.getElementById('root')
          → 拿到的是父应用的 #root ！
```

### 根因

**Vite dev 模式下 `import()` 运行在 qiankun JS 沙箱外部。**

完整调用链：

```
vite-plugin-qiankun (dev mode)
  └─ HTML 模板中使用 import('/src/main.tsx') 加载入口
       └─ import() 是异步的，模块代码在全局作用域执行
            └─ 全局作用域中 window 是真实 window，不是 ProxySandbox 的代理 window
                 └─ window.__POWERED_BY_QIANKUN__ 未设置（仅存在于沙箱内）
                      └─ isQiankun 判断为 false
                           └─ 执行 standalone 模式：mount({})
                                └─ props.container 为 undefined
                                     └─ fallback: document.getElementById('root')
                                          └─ 拿到父应用的 #root！子应用渲染覆盖父应用
```

关键点：qiankun 的 `ProxySandbox` 在现代浏览器中是默认沙箱模式。它通过 `Proxy` 拦截 `window` 属性访问，在沙箱内设置了 `__POWERED_BY_QIANKUN__ = true`。但 `import()` 加载的 ES Module 绕过了 Proxy，直接访问真实 `window`。

### 解决方案

使用 `window.proxy` 作为补充检测标志。qiankun 的 `import-html-entry` 在处理子应用 HTML 时，会在**真实 `window`** 上设置 `window.proxy` 对象（包含 `__INJECTED_PUBLIC_PATH_BY_QIANKUN__` 等属性），在 `import()` 执行前就已存在。

```typescript
// 修复前
const isQiankun = (window as any).__POWERED_BY_QIANKUN__;

// 修复后：双重检测
const isQiankun = (window as any).__POWERED_BY_QIANKUN__ || (window as any).proxy;
```

### 修改文件

- `apps/react-child-app/src/main.tsx` — standalone 模式判断
- `apps/react-child-app/src/App.tsx` — BrowserRouter basename 判断
- `apps/vue-child-app/src/main.ts` — standalone 模式判断 + router base 判断

---

## 问题二：Vue 子应用路由报错

### 现象

访问 `/vue-child` 时浏览器控制台报错，Vue 子应用无法正常渲染。

### 根因

与问题一同源。`window.__POWERED_BY_QIANKUN__` 不可见导致：

```typescript
// 修复前 — routerBase 始终为 '/'
const routerBase = window.__POWERED_BY_QIANKUN__ ? '/vue-child' : '/'

// Vue Router 以 '/' 为 base，与父应用 BrowserRouter 冲突
// 父应用路由尝试匹配 /vue-child/*，Vue Router 也尝试匹配，产生冲突
```

### 解决方案

同问题一，增加 `window.proxy` 检测：

```typescript
const isQiankun = window.__POWERED_BY_QIANKUN__ || (window as any).proxy
const routerBase = isQiankun ? '/vue-child' : '/'
```

---

## 问题三：子应用生命周期不触发

### 现象

修复问题一/二后，父应用不再被覆盖，但子应用内容区域为空。控制台报 `single-spa minified message #31`（bootstrap 超时 4000ms）。

### 排查思路

```
现象：子应用内容为空，bootstrap 超时
  → 检查 qiankun 如何获取子应用生命周期函数
    → vite-plugin-qiankun 使用 deferred Promise 机制
      → window['app-name'].mount 返回一个待 resolve 的 Promise
        → Promise 等待 window.proxy.vitemount 被调用
          → vitemount 在 import().finally() 中调用
            → 但依赖 window.moudleQiankunAppLifeCycles
              → 该对象从未被设置！
```

### 根因

**`vite-plugin-qiankun` 的 deferred 生命周期机制在 dev 模式下断裂。**

vite-plugin-qiankun HTML 模板中的生命周期注册机制：

```
HTML 模板执行流程：
  1. createDeffer('mount') → 创建 Promise，将 resolve 存入 window.proxy.vitemount
  2. window['react-child-app'] = { mount: deferredMount } → 注册到全局
  3. import('/src/main.tsx').finally(() => {
       // 检查 window.moudleQiankunAppLifeCycles
       // 如果存在，调用 window.proxy.vitemount(actualMountFn) → resolve Promise
       // 如果不存在，什么都不做 → Promise 永远 pending
     })
```

问题在于 `window.moudleQiankunAppLifeCycles` 从未被设置。该对象本应由插件的 Vite transform 钩子注入到模块代码中，但在 dev 模式下该 transform 没有正确执行（或 re-export 语法不被识别）。

最终结果：qiankun 调用 `window['app-name'].mount(props)` → 返回一个永远不 resolve 的 Promise → bootstrap/mount 全部超时。

### 解决方案

在子应用入口中，检测到 qiankun 环境后**直接调用** `window.proxy.vite{hookName}`，手动 resolve deferred Promise：

```typescript
// React 子应用 main.tsx
if (!isQiankun) {
  mount({});
} else {
  const proxy = (window as any).proxy;
  if (proxy) {
    if (proxy.vitebootstrap) proxy.vitebootstrap(() => bootstrap());
    if (proxy.vitemount) proxy.vitemount((props: any) => mount(props));
    if (proxy.viteunmount) proxy.viteunmount((props: any) => unmount(props));
    if (proxy.viteupdate) proxy.viteupdate((props: any) => {});
  }
}
```

**为什么这样可行？**

1. `window.proxy` 是 `import-html-entry` 在真实 `window` 上设置的对象
2. `createDeffer` 在沙箱内执行时，读取 `window.proxy`（Proxy 代理到真实 window.proxy），并在其上存储 `vite{hookName}` = resolve 函数
3. 由于 `window.proxy` 是同一个对象引用（Proxy 的 getter 返回真实 window 上的对象），模块代码中对 `window.proxy.vitemount` 的修改会被沙箱内的 deferred 机制看到
4. 模块调用 `proxy.vitemount(fn)` → resolve Promise → qiankun 调用 `window['app-name'].mount(props)` 时，deferred 函数正常执行

---

## 问题四（附加）：React Refresh 脚本导致加载错误

### 现象

控制台报 `Cannot use import statement outside a module`。

### 根因

`@vitejs/plugin-react` 向 HTML 注入了 `<script type="module">import { injectIntoGlobalHook } from "/@react-refresh"...` 前导脚本。qiankun 处理子应用 HTML 时剥离 `type="module"` 属性，以 `eval()` / `new Function()` 执行，静态 `import` 语句在此环境下不合法。

### 解决方案

在 qiankun `start()` 配置中用 `getTemplate` 过滤掉包含静态 `import` 的 `<script type="module">` 标签：

```typescript
start({
  sandbox: { experimentalStyleIsolation: true },
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
```

---

## 同类型问题通用排查方法

### 1. 环境检测问题

**适用于**：所有使用 qiankun + Vite 的微前端项目

| 检测标志 | 设置位置 | import() 模块是否可见 |
|---------|---------|---------------------|
| `window.__POWERED_BY_QIANKUN__` | ProxySandbox 内部 | 不可见 |
| `window.proxy` | import-html-entry，真实 window | **可见** |
| `window.__INJECTED_PUBLIC_PATH_BY_QIANKUN__` | 沙箱内 | 不可见 |

**通用原则**：在 Vite + qiankun dev 模式下，不能仅依赖 `window.__POWERED_BY_QIANKUN__`，必须增加 `window.proxy` 作为补充检测。

### 2. 生命周期注册问题

**适用于**：使用 `vite-plugin-qiankun` 的所有项目

如果子应用使用 `export { bootstrap, mount, unmount } from './lifeCycles'`（re-export）而非在入口文件直接定义，`vite-plugin-qiankun` 的 transform 可能不会注入 `moudleQiankunAppLifeCycles` 包装代码。

**两种解决方案**：
- **方案 A**（推荐）：在入口文件手动调用 `window.proxy.vite{hookName}`，绕过 deferred 机制
- **方案 B**：将生命周期函数直接定义在入口文件中（不使用 re-export）

### 3. 路由配置问题

**适用于**：所有微前端子应用

| 框架 | 路由配置要点 |
|------|------------|
| React Router v6 | `<BrowserRouter basename="/child-path">` |
| Vue Router v4 | `createWebHistory('/child-path')` |
| 路由 base 来源 | `window.__POWERED_BY_QIANKUN__` 或 `window.proxy` 判断 |

### 4. 需要避免的做法

- **不要**在子应用入口无条件执行 `mount()` / `createApp().mount()`
- **不要**仅依赖 `window.__POWERED_BY_QIANKUN__` 做环境判断（Vite dev 模式下不可靠）
- **不要**在子应用路由中使用 base `'/'`（在 qiankun 中会与父应用冲突）
- **不要**在 `mount` 函数中用 `document.getElementById()` 作为唯一 fallback（可能拿到父应用的 DOM）
- **不要**忽略 `unmount` 函数的实现（会导致内存泄漏和事件监听器残留）
