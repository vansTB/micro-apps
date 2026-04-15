# Monorepo 开发规范与实战总结（面试版）

> 基于真实项目：pnpm workspace 管理的 qiankun 微前端 monorepo。

---

## 一、什么是 Monorepo

### 1.1 基本概念

Monorepo（Monolithic Repository）是把**多个相关项目放在同一个 Git 仓库**中管理的开发策略。与之相对的是 Polyrepo（多仓库），每个项目一个独立仓库。

```
Monorepo（一个仓库）                Polyrepo（多个仓库）
├── apps/                           repo1: main-app
│   ├── main-app/                   repo2: react-child-app
│   ├── react-child-app/            repo3: vue-child-app
│   └── vue-child-app/              repo4: shared-utils
├── packages/
│   └── shared/
└── package.json（根）
```

### 1.2 Monorepo 解决什么问题

| 痛点（Polyrepo） | Monorepo 如何解决 |
|-----------------|-------------------|
| 跨仓库改一个接口要提 3 个 PR | 一个 PR 改完所有相关代码 |
| 共享类型/工具要发 npm 包再安装 | 直接 `import` 本地包，即时生效 |
| 依赖版本不统一（A 用 React 18，B 用 React 17） | 统一管理依赖版本 |
| CI/CD 配置每个仓库写一遍 | 根目录统一配置 |
| clone 5 个仓库才能开始开发 | clone 一个仓库就行 |

### 1.3 Monorepo 的代价

| 代价 | 说明 |
|------|------|
| 仓库体积大 | 随项目增长，clone 和历史记录会变大 |
| 构建速度 | 需要增量构建和构建缓存来优化 |
| 权限管理 | 所有人能看到所有代码（可通过 CODEOWNERS 细化） |
| 工具链复杂度 | 需要学习 Turborepo/Nx/Lerna 等构建编排工具 |

### 1.4 主流 Monorepo 工具对比

| 工具 | 包管理 | 构建编排 | 特点 |
|------|--------|---------|------|
| **pnpm workspace** | ✅ 内置 | ❌ 需搭配 | 速度快、磁盘占用小、硬链接依赖 |
| **npm workspace** | ✅ 内置 | ❌ | Node.js 内置、功能基础 |
| **yarn workspace** | ✅ 内置 | ❌ | 经典方案、Berry 支持 PnP |
| **Turborepo** | ❌ 搭配 pnpm | ✅ 强 | 构建缓存、并行任务、远程缓存 |
| **Nx** | ❌ 搭配 | ✅ 最强 | 依赖图分析、增量构建、插件生态 |
| **Lerna** | ❌ 搭配 | ✅ | 老牌方案、现已与 Nx 合并 |

**本项目选型：pnpm workspace**。原因：项目规模小（3 个应用 + 1 个共享包），不需要构建编排工具的复杂功能，pnpm 足够。

---

## 二、pnpm workspace 详解

### 2.1 pnpm 是什么

pnpm（performant npm）是一个 Node.js 包管理器，和 npm/yarn 同级，但有两个核心区别：

**1. 硬链接存储（content-addressable store）**

```
传统 npm/yarn：
  node_modules/react/     ← 项目 A 完整复制一份（~5MB）
  node_modules/react/     ← 项目 B 完整复制一份（~5MB）
  node_modules/react/     ← 项目 C 完整复制一份（~5MB）
  总占用：~15MB

pnpm：
  .pnpm-store/react@18/   ← 磁盘上只有一份（~5MB）
  项目A/node_modules/react → 硬链接到 store
  项目B/node_modules/react → 硬链接到 store
  项目C/node_modules/react → 硬链接到 store
  总占用：~5MB
```

所有项目共享同一份依赖的物理存储，通过硬链接引用。装 10 个项目只占 1 份空间。

**2. 严格的依赖隔离（非扁平 node_modules）**

```
npm/yarn（扁平结构，可以"偷用"未声明的依赖）：
  node_modules/
    react/          ← 你安装的
    lodash/         ← react 依赖的，但你也能直接 require('lodash')

pnpm（严格隔离，只能用自己声明的依赖）：
  node_modules/
    .pnpm/
      react@18/
        node_modules/
          lodash/   ← react 的依赖，藏起来了
    react/ → .pnpm/react@18   ← 硬链接
    # 你无法直接 require('lodash')，除非你自己装
```

### 2.2 workspace 配置

**根目录 `pnpm-workspace.yaml`：**

```yaml
packages:
  - 'apps/*'       # 所有应用
  - 'packages/*'   # 所有共享包
```

这告诉 pnpm：`apps/` 和 `packages/` 下面的每个子目录都是一个独立的 workspace 包。pnpm 会自动识别它们的 `package.json` 并建立依赖关系。

**根目录 `package.json`：**

```json
{
  "name": "my-microapp",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel --filter ./apps/* dev",
    "build": "pnpm -r --filter ./apps/* build",
    "dev:main-app": "pnpm --filter main-app dev",
    "dev:react-child-app": "pnpm --filter react-child-app dev",
    "dev:vue-child-app": "pnpm --filter vue-child-app dev"
  },
  "devDependencies": {
    "pnpm": "^8.0.0"
  }
}
```

逐行解读：

| 命令 | 含义 |
|------|------|
| `pnpm -r` | 递归执行，在所有 workspace 包中运行 |
| `--parallel` | 并行执行（不等待上一个完成再执行下一个） |
| `--filter ./apps/*` | 只针对 `apps/` 下的包执行 |
| `--filter main-app` | 只针对名为 `main-app` 的包执行 |
| `"private": true` | 根包不会被发布到 npm |

**`.npmrc` 配置：**

```ini
shamefully-hoist=true          # 提升依赖到根 node_modules（兼容某些工具）
auto-install-peers=true        # 自动安装 peer dependencies
strict-peer-dependencies=false # 不严格校验 peer deps（避免 React 版本冲突报错）
```

### 2.3 workspace 内部包引用

**共享包 `packages/shared/package.json`：**

```json
{
  "name": "@my-microapp/shared",
  "version": "1.0.0",
  "type": "module",
  "main": "index.ts",
  "types": "index.ts"
}
```

关键点：
- `"main": "index.ts"` — 直接指向源码 TS 文件，不需要先 build 再引用
- 有了 `"type": "module"` — 支持 ESM import/export

**应用中引用共享包：**

不需要在 `package.json` 中声明依赖。本项目直接通过相对路径引用：

```ts
// main-app/src/store/sharedStore.ts
import type { SharedStore } from '../../../shared'
// 相对路径：当前文件 → 上 3 级 → packages/shared/index.ts

// react-child-app/src/hooks/useSharedStore.ts
import type { SharedStore } from '../../../../shared'
// 相对路径：当前文件 → 上 4 级 → packages/shared/index.ts
```

**另一种方式（更规范）：在 package.json 中声明 workspace 依赖**

```json
// main-app/package.json
{
  "dependencies": {
    "@my-microapp/shared": "workspace:*"
  }
}
```

`workspace:*` 是 pnpm 的协议，表示引用当前 workspace 中的本地包。这样就可以用正常的 import 路径：

```ts
import type { SharedStore } from '@my-microapp/shared'
```

本项目暂未使用此方式，而是直接用相对路径，简化了配置。

---

## 三、项目中的 Monorepo 结构详解

### 3.1 完整目录与职责

```
my-microapp/                          ← Git 根目录
├── package.json                      ← monorepo 根配置（统一脚本）
├── pnpm-workspace.yaml               ← workspace 包定义
├── pnpm-lock.yaml                    ← 锁定所有包的依赖版本
├── .npmrc                            ← pnpm 行为配置
├── nginx.conf                        ← 生产部署配置（全局共享）
│
├── apps/                             ← 应用层（各自独立运行）
│   ├── main-app/                     ← 主应用（基座）
│   │   ├── package.json              ← 独立依赖：react 18.3, zustand, qiankun
│   │   ├── vite.config.ts            ← 独立构建配置：端口 3000
│   │   ├── tsconfig.json             ← 独立 TS 配置
│   │   ├── .env.development          ← 开发环境变量
│   │   ├── .env.production           ← 生产环境变量
│   │   └── src/
│   │       ├── store/sharedStore.ts  ← 引用 shared 包的类型
│   │       ├── qiankun/index.ts      ← qiankun 注册配置
│   │       ├── pages/Home.tsx
│   │       └── ...
│   │
│   ├── react-child-app/              ← React 子应用
│   │   ├── package.json              ← 独立依赖：react 18.2, zustand, qiankun
│   │   ├── vite.config.ts            ← 独立构建配置：端口 3001, CORS
│   │   └── src/
│   │       ├── hooks/useSharedStore.ts ← 引用 shared 包的类型
│   │       └── ...
│   │
│   └── vue-child-app/                ← Vue 子应用
│       ├── package.json              ← 独立依赖：vue 3.4, vue-router, qiankun
│       ├── vite.config.ts            ← 独立构建配置：端口 3002, CORS
│       └── src/
│           ├── composables/useSharedStore.ts ← 手写类型（见下文）
│           └── ...
│
└── packages/                         ← 共享层（不独立运行）
    └── shared/                       ← 共享类型与常量
        ├── package.json              ← @my-microapp/shared
        └── index.ts                  ← SharedState, Message, APP_NAMES 等
```

### 3.2 每个包的独立性

Monorepo 中每个 workspace 包是一个**独立项目**，有自己完整的：

| 独立项 | main-app | react-child-app | vue-child-app | shared |
|--------|----------|-----------------|---------------|--------|
| `package.json` | ✅ | ✅ | ✅ | ✅ |
| `vite.config.ts` | ✅ | ✅ | ✅ | ❌（纯类型包） |
| `tsconfig.json` | ✅ | ✅ | ✅ | ❌ |
| 依赖管理 | React 18.3 | React 18.2 | Vue 3.4 | 无依赖 |
| 端口 | 3000 | 3001 | 3002 | - |
| 可独立运行 | ✅ | ✅ | ✅ | ❌ |

注意：main-app 用 React 18.3，react-child-app 用 React 18.2——版本不同，这正是因为 monorepo 允许每个包有独立依赖。但在微前端场景中，版本差异可能导致问题（见后文"双 React 实例"）。

### 3.3 共享包（packages/shared）的实际运用

`shared` 包定义了跨应用共享的 TypeScript 类型和常量：

```ts
// packages/shared/index.ts

// 共享常量（所有应用统一的配置）
export const APP_NAMES = {
  MAIN: 'main-app',
  REACT_CHILD: 'react-child-app',
  VUE_CHILD: 'vue-child-app'
} as const;

// 共享类型（保证所有应用对同一个数据结构有一致的理解）
export interface SharedState {
  user: { id: string; name: string; role: string } | null;
  theme: 'light' | 'dark';
  messages: Message[];
}

export interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: number;
}

export type SharedStore = SharedState & SharedActions;
```

**哪些地方用到了这些类型？**

```
packages/shared/index.ts               ← 定义处
  ↑ import type { SharedStore }
  ├── main-app/src/store/sharedStore.ts     ← Zustand store 使用 SharedStore 类型
  │     createStore<SharedStore>(...)
  │
  ├── react-child-app/src/hooks/useSharedStore.ts  ← 子适配层使用 SharedStore 类型
  │     let _vanillaStore: StoreApi<SharedStore> | null = null
  │
  └── vue-child-app/src/composables/useSharedStore.ts  ← Vue 版手写了类型
        interface SharedState { ... }   ← 没有引用 shared 包（见下文）
```

**注意：Vue 子应用没有引用 shared 包。** 因为 Vue 子应用没有在 `tsconfig.json` 中配置到 shared 包的路径映射，且为了保持简单，Vue composable 中手写了接口定义。这在小型项目中是可接受的，但在大型项目中应该统一引用共享包，避免类型不一致。

---

## 四、Monorepo 开发工作流

### 4.1 开发启动

```bash
# 安装所有依赖（pnpm 自动处理 workspace 链接）
pnpm install

# 同时启动所有应用（并行开发）
pnpm dev
# 等价于：pnpm -r --parallel --filter ./apps/* dev
# 效果：main-app:3000 + react-child-app:3001 + vue-child-app:3002 同时启动

# 只启动某个应用
pnpm dev:main-app
# 等价于：pnpm --filter main-app dev

# 只启动 React 子应用
pnpm dev:react-child-app
```

**一个终端管理所有应用** 是 monorepo 开发的核心体验优势。在 Polyrepo 中你需要开 3 个终端窗口、cd 到 3 个目录、分别执行 `npm run dev`。

### 4.2 构建发布

```bash
# 构建所有应用
pnpm build
# 依次（或并行）执行每个 apps/* 下的 build 脚本

# 只构建某个应用
pnpm build:main-app

# 构建产物各自独立：
# apps/main-app/dist/
# apps/react-child-app/dist/
# apps/vue-child-app/dist/
```

### 4.3 依赖管理

```bash
# 给 main-app 安装新依赖
pnpm --filter main-app add axios

# 给所有应用安装同一个依赖
pnpm -r add lodash

# 给根包安装开发依赖（所有子包共享）
pnpm add -Dw typescript
# -w = --workspace-root

# 查看依赖关系图
pnpm list --depth 1 --filter main-app
```

### 4.4 统一脚本的运作方式

```
pnpm dev（根命令）
  │
  ├── 读取 pnpm-workspace.yaml → 找到 apps/*, packages/*
  │
  ├── --filter ./apps/* → 匹配到 3 个应用包
  │     ├── main-app      → 执行其 package.json 的 "dev" 脚本 → vite (port 3000)
  │     ├── react-child-app → 执行其 "dev" 脚本 → vite (port 3001)
  │     └── vue-child-app   → 执行其 "dev" 脚本 → vite (port 3002)
  │
  └── --parallel → 三个 vite 同时启动，不等上一个完成
```

---

## 五、Monorepo 在微前端场景中的特殊价值

### 5.1 为什么微前端特别适合 Monorepo

微前端项目天然是**多个相关联的项目**：主应用和子应用之间存在共享类型、共享配置、接口协议。如果分散在多个仓库：

- 改一个通信协议要改 3 个仓库、提 3 个 PR
- 类型定义不一致导致运行时报错
- 开发环境搭建繁琐

用 Monorepo 后：

| 场景 | Monorepo 的优势 |
|------|----------------|
| 修改通信接口 | 改 `shared/index.ts` → 所有应用立即感知类型变化 |
| 统一版本管理 | 一个 `pnpm install` 安装所有应用的依赖 |
| 联调开发 | `pnpm dev` 一键启动所有应用 |
| 代码审查 | 一个 PR 看到所有应用的改动，方便评审一致性 |

### 5.2 共享包的分层设计

```
packages/shared/         ← 当前项目的共享层
├── 类型定义              ← SharedState, Message, SharedActions
├── 常量                 ← APP_NAMES, APP_PATHS, APP_PORTS
└── 初始状态              ← INITIAL_SHARED_STATE

apps/ 各自负责：
├── 自己的 UI 和路由
├── 自己的状态管理绑定（React 用 useStore，Vue 用 ref+subscribe）
└── 自己的生命周期
```

**设计原则：** shared 包只放**纯数据定义**（类型、常量、初始值），不放任何框架相关代码。这样 React 应用和 Vue 应用都能无障碍引用。

如果项目进一步扩大，共享包可以拆分为：

```
packages/
├── shared/          ← 类型 + 常量
├── ui-components/   ← 跨应用共享的 UI 组件（需要考虑框架兼容）
├── utils/           ← 工具函数
└── eslint-config/   ← 共享的 ESLint 配置
```

### 5.3 当前项目的依赖关系图

```
main-app (React 18.3, zustand, qiankun, react-router-dom)
  │
  └── import type from ──→ @my-microapp/shared (SharedStore)
                              ↑
react-child-app (React 18.2, zustand, qiankun, react-router-dom)
  │
  └── import type from ──→ @my-microapp/shared (SharedStore)
                              ↑
vue-child-app (Vue 3.4, vue-router, qiankun)
  │
  └── (手写类型，未引用 shared) ← 可优化点
```

---

## 六、面试题整理

### 6.1 基础概念

**Q1: 什么是 Monorepo？和 Polyrepo 有什么区别？**

Monorepo 是将多个相关项目放在同一个 Git 仓库中管理的策略。Polyrepo 是每个项目一个独立仓库。

区别：
- Monorepo 共享代码方便（直接引用本地包），Polyrepo 需要发 npm 包或用 git submodule
- Monorepo 跨项目修改一个 PR 搞定，Polyrepo 要多个 PR 协调
- Monorepo 仓库大、工具链复杂，Polyrepo 仓库小、隔离性好

**Q2: pnpm 和 npm 有什么区别？为什么选 pnpm？**

三个核心区别：
1. **硬链接存储**：依赖只在磁盘存一份，多个项目通过硬链接共享，省空间、装得快
2. **严格依赖隔离**：非扁平 node_modules，不能偷用未声明的依赖，避免幽灵依赖
3. **内置 workspace**：原生支持 monorepo，不需要 Lerna 等额外工具

选择 pnpm 的原因：项目规模适中，pnpm 的 workspace 功能足够，不需要 Turborepo/Nx 的构建编排能力。

**Q3: pnpm workspace 是怎么工作的？**

通过根目录的 `pnpm-workspace.yaml` 声明哪些目录是 workspace 包。pnpm 会：
1. 扫描所有匹配目录下的 `package.json`
2. 建立包之间的依赖关系图
3. 如果包 A 依赖包 B（`"workspace:*"`），创建软链接而不是复制
4. 公共依赖提升到根 `node_modules`，各包独有的装在各包目录下

**Q4: `pnpm -r --parallel --filter ./apps/* dev` 这条命令做了什么？**

- `-r`：递归执行，遍历所有 workspace 包
- `--parallel`：并行执行，不等待上一个完成
- `--filter ./apps/*`：只匹配 `apps/` 目录下的包（排除 `packages/shared`）
- `dev`：执行每个匹配包的 `package.json` 中的 `dev` 脚本

效果：同时启动 main-app (3000)、react-child-app (3001)、vue-child-app (3002) 三个开发服务器。

### 6.2 架构设计

**Q5: shared 包为什么只放类型不放业务逻辑？**

1. **框架无关**：类型和常量是纯 JavaScript/TypeScript，React 和 Vue 都能用
2. **避免耦合**：如果 shared 包引用了 React，Vue 子应用就会被迫安装 React
3. **构建简单**：纯类型包不需要构建步骤，`"main": "index.ts"` 直接引用源码
4. **职责清晰**：shared 包是"协议层"，定义所有应用遵守的数据契约

**Q6: 如果 shared 包需要放工具函数，应该注意什么？**

1. 确保工具函数是**纯函数**，不依赖任何框架 API
2. 如果必须有框架依赖，拆成 `shared-react` 和 `shared-vue` 两个包
3. 注意构建输出：如果 shared 包从纯类型变成有运行时代码，需要配置构建流程（Vite library mode 或 tsup）
4. 考虑 tree-shaking：用具名导出而不是默认导出

**Q7: 你项目中 Vue 子应用为什么没有引用 shared 包？有什么隐患？**

Vue 子应用的 `useSharedStore.ts` 中手写了 `SharedState` 和 `Message` 接口，没有通过 `import type` 引用 shared 包。

隐患：
- 如果 shared 包的 `SharedState` 增加字段（如 `token: string`），Vue 子应用不会感知
- 两边的类型定义可能出现不一致
- 违反 DRY（Don't Repeat Yourself）原则

解决方案：在 Vue 子应用的 `tsconfig.json` 中配置路径映射：
```json
{
  "compilerOptions": {
    "paths": {
      "@my-microapp/shared": ["../../packages/shared/index.ts"]
    }
  }
}
```
或在 `package.json` 中添加 `"@my-microapp/shared": "workspace:*"` 依赖。

### 6.3 依赖管理

**Q8: 什么是"幽灵依赖"（Phantom Dependencies）？pnpm 怎么解决？**

幽灵依赖是指代码中 `import` 了一个没有在 `package.json` 中声明的包。这在 npm/yarn 的扁平 node_modules 中很常见：

```
你只安装了 react，但 react 依赖了 object-assign。
npm 扁平化后 object-assign 也出现在你的 node_modules 根目录，
你可以直接 require('object-assign')，但你没声明它。
如果 react 升级去掉了 object-assign 依赖，你的代码就挂了。
```

pnpm 的 node_modules 结构是非扁平的，`object-assign` 藏在 `.pnpm/react@18/node_modules/` 下面，你无法直接 `require('object-assign')`，必须自己声明安装。

**Q9: `workspace:*` 协议是什么？**

这是 pnpm 提供的特殊版本协议，表示引用当前 workspace 中的本地包：

```json
{
  "dependencies": {
    "@my-microapp/shared": "workspace:*"
  }
}
```

- 开发时：直接链接到本地 `packages/shared/`，修改即时生效
- 发布时：pnpm 自动将 `workspace:*` 替换为实际版本号（如 `1.0.0`）

**Q10: `.npmrc` 中 `shamefully-hoist=true` 是什么意思？为什么需要？**

让 pnpm 把所有依赖提升到根 `node_modules`，模拟 npm 的扁平结构。

需要的原因：某些工具（如 Vite 插件、旧版 CLI 工具）依赖扁平 node_modules 的行为，在 pnpm 的严格模式下会找不到依赖。`shamefully-hoist=true` 是兼容方案。

缺点：破坏了 pnpm 的严格隔离，可能出现幽灵依赖。但实际项目中利大于弊。

### 6.4 进阶问题

**Q11: Monorepo 怎么做 CI/CD？**

核心思路是**只构建/部署变更涉及的应用**：

```yaml
# GitHub Actions 示例
jobs:
  detect-changes:
    # 检测哪些 apps/ 下的目录有变更
    # 只对变更的应用执行构建和部署
```

常用方法：
1. **路径过滤**：`git diff` 检测哪些 `apps/` 目录有变更，只构建变更的应用
2. **Turborepo 远程缓存**：构建结果缓存到云端，相同输入直接命中缓存
3. **Nx 受影响项目分析**：基于依赖图自动计算哪些项目受影响

**Q12: Monorepo 怎么处理版本发布？**

两种策略：

1. **固定版本（Fixed Versioning）**：所有包版本号一致，一次发版所有包都升版本
   - 适合紧密耦合的包（如本项目的微前端应用群）
   - 工具：`changesets`、`lerna version`

2. **独立版本（Independent Versioning）**：每个包独立版本号
   - 适合松耦合的包（如组件库、工具库）
   - 工具：`changesets`、`lerna version --independent`

**Q13: 项目规模大了 Monorepo 构建太慢怎么办？**

| 优化手段 | 说明 |
|---------|------|
| Turborepo/Nx | 增量构建 + 任务缓存，只构建变更影响的部分 |
| 远程缓存 | CI 环境共享构建缓存，避免重复构建 |
| 并行构建 | 充分利用多核 CPU，独立任务并行执行 |
| 依赖图分析 | Nx 自动分析包之间的依赖关系，按拓扑序构建 |
| 云端构建 | 使用 Nx Cloud 或 Turborepo Remote Cache |

**Q14: Monorepo 中的 TypeScript 配置怎么做？**

推荐使用 TypeScript 5.0+ 的 **Project References**：

```json
// 根 tsconfig.json
{
  "references": [
    { "path": "apps/main-app" },
    { "path": "apps/react-child-app" },
    { "path": "packages/shared" }
  ]
}

// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "composite": true,     // 允许被其他项目引用
    "declaration": true,   // 生成 .d.ts
    "declarationMap": true
  }
}

// apps/main-app/tsconfig.json
{
  "references": [
    { "path": "../../packages/shared" }
  ]
}
```

好处：
- TypeScript 只检查变更的项目，不全量类型检查
- IDE 跳转到共享包源码而不是 `.d.ts`
- 构建时按依赖顺序自动编排

本项目规模小，暂未使用 Project References，直接通过相对路径引用。

### 6.5 与微前端结合的问题

**Q15: Monorepo + 微前端，每个应用可以独立部署吗？**

可以。每个应用有独立的 `package.json` 和构建配置，构建产物各自在 `dist/` 目录。部署时只需要把对应的 `dist/` 内容放到服务器上。

Monorepo 管的是**开发时的代码组织**，不影响**部署时的独立性**。

**Q16: 微前端 + Monorepo 中，共享包的代码会被打包进每个应用吗？**

取决于引用方式：

1. **引用源码（本项目的方式）**：`import type { SharedStore } from '../../../shared'`
   - `import type` 在编译时会被擦除，不会增加任何运行时代码体积
   - 如果引用了运行时代码（如常量 `APP_NAMES`），Vite 会把它内联到应用的 bundle 中

2. **引用构建产物**：`import { SharedStore } from '@my-microapp/shared'`（通过 workspace 协议）
   - 默认也会被 Vite 打包进去
   - 如果要避免重复，可以用 `vite.externals` 把 shared 包排除，运行时通过其他方式加载

对于本项目的纯类型共享包，不涉及运行时代码重复问题。

**Q17: 你在 Monorepo 中遇到过什么问题？**

1. **类型同步**：Vue 子应用手写了类型没有引用 shared 包，存在类型不一致风险
2. **React 版本不一致**：main-app 用 18.3，react-child-app 用 18.2，在微前端沙箱中导致双 React 实例问题
3. **相对路径引用可读性差**：`../../../../shared` 层级太深，应该改用 workspace 协议 + 路径别名
4. **没有构建编排**：`pnpm build` 虽然能跑，但没有缓存和增量构建，项目变大后会变慢

---

## 七、总结：Monorepo 核心要点

| 维度 | 要点 |
|------|------|
| **作用** | 多项目统一管理、共享代码、统一依赖、简化开发流程 |
| **工具** | pnpm workspace（包管理）+ Turborepo/Nx（构建编排，大型项目） |
| **结构** | apps/ 放应用、packages/ 放共享包，根 package.json 管统一脚本 |
| **共享** | 纯类型/常量放 packages/shared，不放框架相关代码 |
| **命令** | `pnpm -r` 递归、`--filter` 过滤、`--parallel` 并行 |
| **依赖** | `workspace:*` 协议引用本地包，避免发 npm 包 |
| **本项目** | pnpm workspace 管理 3 个微前端应用 + 1 个共享类型包 |

---

## 八、Turborepo 增量构建与远程缓存（实战落地）

> 本节记录项目从纯 pnpm workspace 升级到 pnpm + Turborepo 的完整过程。

### 8.1 为什么要引入 Turborepo

纯 pnpm workspace 的痛点：

| 痛点 | 说明 |
|------|------|
| 每次全量构建 | `pnpm -r build` 不管有没有变更都重新构建所有应用 |
| 无缓存 | 本地第二次构建和第一次一样慢，CI 每次都要等全量构建 |
| 依赖关系靠人记忆 | `packages/shared` 变了，需要手动记得重新构建依赖它的应用 |
| CI 检测变更靠 glob | `paths-filter` 手写路径规则，容易漏 |

Turborepo 解决方式：**自动依赖图 + 增量构建 + 本地/远程缓存**。

### 8.2 安装与配置

**安装：**

```bash
pnpm add -Dw turbo
```

**核心配置 `turbo.json`：**

```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],     // 先等依赖包 build 完
      "outputs": ["dist/**"]       // 缓存构建产物
    },
    "type-check": {
      "dependsOn": ["^type-check"]
    },
    "dev": {
      "cache": false,              // dev 不缓存（长驻进程）
      "persistent": true           // 持续运行不退出
    }
  }
}
```

**配置字段含义：**

| 字段 | 含义 |
|------|------|
| `dependsOn: ["^build"]` | `^` 前缀 = 先等所有**依赖包**的同名任务完成。例如 main-app 依赖 shared，则 shared 的 build 先跑完 |
| `dependsOn: ["build"]` | 无 `^` = 等自己的另一个任务完成（串行） |
| `outputs: ["dist/**"]` | 告诉 Turborepo 哪些是构建产物，需要缓存。缓存命中时直接恢复，跳过构建 |
| `cache: false` | 不缓存（dev 是长驻进程，缓存没意义） |
| `persistent: true` | 标记为持续运行的任务（dev server），`turbo run dev` 不会等它结束 |

### 8.3 修改各包配置

**根 `package.json` — 脚本改用 `turbo run`：**

```json
{
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "type-check": "turbo run type-check",
    "build:main-app": "turbo run build --filter=main-app",
    "build:react-child-app": "turbo run build --filter=react-child-app",
    "build:vue-child-app": "turbo run build --filter=vue-child-app"
  }
}
```

**各应用 `package.json` — 拆分 tsc 和 vite build：**

```json
// apps/main-app/package.json 和 apps/react-child-app/package.json
{
  "scripts": {
    "build": "vite build",          // 只做构建，快
    "type-check": "tsc --noEmit",   // 类型检查单独跑
    "dev": "vite"
  },
  "dependencies": {
    "@my-microapp/shared": "workspace:*",  // 显式声明依赖
    // ...
  }
}
```

**为什么拆分 `tsc` 和 `vite build`？**

之前 `"build": "tsc && vite build"` 是串行的，tsc 类型检查可能要 5-10 秒，阻塞 vite build。拆开后：
- `turbo run build` — 只跑 vite build（快）
- `turbo run type-check` — 并行跑 tsc（不阻塞构建）
- CI 中 `turbo run build type-check` 两个任务同时并行

**共享包 `packages/shared/package.json`：**

```json
{
  "scripts": {
    "build": "echo \"shared: no build step\""
  }
}
```

纯类型包没有构建步骤，但**必须声明一个 build 脚本**。否则 Turborepo 不知道这个包的 build 已经"完成"了，下游应用会一直等。

**import 路径改为包名：**

```ts
// 之前（相对路径，Turborepo 无法感知依赖关系）
import type { SharedStore } from '../../../shared'

// 之后（workspace 协议，Turborepo 能识别依赖图）
import type { SharedStore } from '@my-microapp/shared'
```

### 8.4 增量构建原理

```
第一次 turbo run build：
  ├─ @my-microapp/shared:build   → 执行 → 缓存（hash: a1b2c3）
  ├─ main-app:build              → 执行 → 缓存（hash: d4e5f6）
  ├─ react-child-app:build       → 执行 → 缓存（hash: g7h8i9）
  └─ vue-child-app:build         → 执行 → 缓存（hash: j0k1l2）
  耗时：~30s

只改了 react-child-app 的代码后，第二次 turbo run build：
  ├─ @my-microapp/shared:build   → CACHE HIT（hash 未变）    ← 跳过，0ms
  ├─ main-app:build              → CACHE HIT（hash 未变）    ← 跳过，0ms
  ├─ react-child-app:build       → 执行 → 新缓存             ← 只构建这个
  └─ vue-child-app:build         → CACHE HIT（hash 未变）    ← 跳过，0ms
  耗时：~8s

改了 packages/shared 的类型定义后，第三次 turbo run build：
  ├─ @my-microapp/shared:build   → 执行                      ← shared 变了
  ├─ main-app:build              → 执行（依赖 shared）         ← 级联重建
  ├─ react-child-app:build       → 执行（依赖 shared）         ← 级联重建
  └─ vue-child-app:build         → CACHE HIT（不依赖 shared）  ← 跳过
  耗时：~20s
```

**Hash 计算因素：** 源码内容 + 依赖的 hash + 构建配置（turbo.json、package.json、tsconfig.json、vite.config.ts）。任何一项变化都会导致缓存失效。

### 8.5 自建 Remote Cache 服务（腾讯云部署）

#### 为什么自建？

Turborepo 官方远程缓存绑定 Vercel 平台。用自己的服务器（腾讯云）部署，数据在本地，不依赖第三方。

#### 架构

```
开发者 A 本地                     开发者 B 本地                     GitHub Actions CI
    │                                 │                                 │
    │ turbo run build                 │ turbo run build                 │ turbo run build
    │ 未命中本地缓存                   │ 未命中本地缓存                   │ 未命中本地缓存
    └──────────┬──────────────────────┴──────────────┬──────────────────┘
               │                                     │
               ▼                                     ▼
        ┌─────────────────────────────────────────────┐
        │  腾讯云服务器（你的服务器）                    │
        │                                             │
        │  packages/cache-server/                     │
        │  ├── server.js（Express，约 100 行）         │
        │  └── .cache/（artifact 文件存储）             │
        │                                             │
        │  接口：                                     │
        │    PUT  /v8/artifacts/{hash}  ← 上传缓存    │
        │    GET  /v8/artifacts/{hash}  ← 下载缓存    │
        │    HEAD /v8/artifacts/{hash}  ← 检查存在    │
        │    鉴权：Authorization: Bearer <token>       │
        │    端口：4000                                │
        └─────────────────────────────────────────────┘
```

#### 服务端实现

`packages/cache-server/server.js` 是一个轻量 Express 应用：

```javascript
// 核心只有三个路由：
app.put('/v8/artifacts/:hash', authenticate, (req, res) => {
  // 把请求体（构建产物 tar）存到 {hash}.artifact 文件
  fs.writeFile(filePath, req.body)
})

app.get('/v8/artifacts/:hash', authenticate, (req, res) => {
  // 读取 {hash}.artifact 文件返回
  res.sendFile(filePath)
})

app.head('/v8/artifacts/:hash', authenticate, (req, res) => {
  // 检查文件是否存在，返回 200 或 404
  res.status(exists ? 200 : 404).end()
})
```

鉴权通过 `Authorization: Bearer <CACHE_TOKEN>` 头校验，CACHE_TOKEN 通过环境变量设置。

#### 腾讯云部署步骤

**方式一：Docker（推荐）**

```bash
# 1. 在服务器上构建镜像
cd packages/cache-server
docker build -t turbo-cache .

# 2. 运行
docker run -d \
  --name turbo-cache \
  -p 4000:4000 \
  -e CACHE_TOKEN=你的密钥 \
  -v /data/turbo-cache:/app/.cache \  # 持久化缓存到宿主机
  --restart always \
  turbo-cache
```

**方式二：PM2**

```bash
# 1. 上传文件到服务器
scp -r packages/cache-server/ root@你的服务器:/opt/turbo-cache/

# 2. 安装依赖
cd /opt/turbo-cache && npm install --production

# 3. PM2 启动
CACHE_TOKEN=你的密钥 CACHE_DIR=/data/turbo-cache pm2 start server.js --name turbo-cache
```

**防火墙：** 开放 4000 端口（或用 Nginx 反向代理 + HTTPS）。

#### 客户端连接

**本地开发：**

```bash
# 设置环境变量（可以加到 .bashrc / .zshrc）
export TURBO_API=http://你的服务器IP:4000
export TURBO_TOKEN=你的密钥

# 正常使用 turbo，缓存自动走远程
pnpm build
```

**CI 环境（GitHub Actions Secrets）：**

| Secret | 值 | 说明 |
|--------|-----|------|
| `TURBO_API` | `http://你的服务器IP:4000` | 缓存服务地址 |
| `TURBO_TOKEN` | `你的密钥` | 与服务端 CACHE_TOKEN 一致 |

### 8.6 改造后的 GitHub Actions

对比改造前后：

```yaml
# ── 改造后（Turborepo） ─────────────────────────
# 不再需要 paths-filter、不再需要 3 个独立 build job、不再手动检测变更
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    env:
      TURBO_API: ${{ secrets.TURBO_API }}     # 自建缓存地址
      TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}  # 鉴权 token
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # turbo 需要完整 git 历史

      - run: pnpm install --frozen-lockfile

      # 一行搞定：自动增量构建，命中缓存秒级完成
      - run: pnpm build

      # 类型检查并行跑
      - run: pnpm type-check

      # 部署...
```

**核心简化：**

| | 改造前 | 改造后 |
|---|---|---|
| CI 配置 | ~150 行（detect-changes + 3 个 build job + deploy） | ~60 行（一个 job） |
| 变更检测 | `dorny/paths-filter` 手写 glob 规则 | Turborepo 自动 |
| 缓存 | 无 | 自建远程缓存，跨 CI 运行共享 |
| 无变更构建 | 全量重新构建 | 全部 CACHE HIT，秒级完成 |

### 8.7 改动文件清单

```
新增：
├── turbo.json                               ← Turborepo 任务管道配置
├── packages/cache-server/                   ← 自建远程缓存服务
│   ├── package.json
│   ├── server.js
│   └── Dockerfile
├── .gitignore                               ← 新增 .turbo 排除

修改：
├── package.json                             ← turbo run 替换 pnpm -r
├── packages/shared/package.json             ← 加空 build 脚本
├── apps/main-app/package.json               ← 加 shared 依赖 + 拆 tsc
├── apps/react-child-app/package.json        ← 同上
├── apps/main-app/src/store/sharedStore.ts   ← import 路径改包名
├── apps/react-child-app/src/hooks/useSharedStore.ts ← 同上
└── .github/workflows/deploy.yml             ← 简化为 turbo run
```

### 8.8 面试题补充

**Q18: Turborepo 的缓存是怎么工作的？**

Turborepo 对每个任务计算一个 hash，由以下因素决定：
- 源码文件内容
- 依赖包的缓存 hash（形成 hash 链）
- 配置文件（turbo.json、package.json、tsconfig.json）
- 环境变量（可配置）

如果 hash 和上次一样，直接从缓存恢复 `outputs` 指定的文件（如 `dist/`），跳过实际构建。

**Q19: `dependsOn: ["^build"]` 和 `dependsOn: ["build"]` 有什么区别？**

- `"^build"`：先等所有**依赖包**（package.json dependencies 中声明的）的 build 完成
- `"build"`：先等**自己**的 build 任务完成（用于任务间串行，如 `"test": { "dependsOn": ["build"] }`）

**Q20: 远程缓存和本地缓存的区别？**

- **本地缓存**：存在 `.turbo/cache/`，只对当前机器有效。删了就没了。
- **远程缓存**：存在服务器上，整个团队和 CI 共享。开发者 A 构建过，开发者 B 和 CI 直接命中。

**Q21: 自建 Remote Cache 的协议是什么？**

Turborepo 的远程缓存协议是标准 HTTP：
- `PUT /v8/artifacts/{hash}` — 上传缓存 artifact
- `GET /v8/artifacts/{hash}` — 下载缓存 artifact
- `HEAD /v8/artifacts/{hash}` — 检查是否存在
- 鉴权：`Authorization: Bearer <token>`

只需实现这 3 个接口 + 存储层，任何 HTTP 服务器都能当 Turborepo 的远程缓存。

**Q22: Turborepo 和 Nx 怎么选？**

| 维度 | Turborepo | Nx |
|------|-----------|-----|
| 学习曲线 | 低（配置简单） | 高（功能多） |
| 缓存 | 本地 + 远程 | 本地 + 远程 + 分布式 |
| 依赖图分析 | 基于 package.json | 基于 AST 代码分析（更精确） |
| 插件生态 | 少 | 丰富（React、Next.js、Nest 等预设） |
| 适合场景 | 中小型项目 | 大型企业级项目 |

本项目选 Turborepo：项目规模小（4 个包），配置简单，够用。
