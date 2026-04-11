# Qiankun 微前端架构实施计划

## 目标
使用 pnpm + monorepo 搭建 qiankun 微前端项目，包含：
- 1 个 React 基座应用
- 1 个 React 子应用
- 1 个 Vue 子应用

## 项目结构
```
my-microapp/
├── pnpm-workspace.yaml
├── package.json
├── .npmrc
├── apps/
│   ├── main-app/          # React 基座 (Port 3000, Vite)
│   ├── react-child-app/   # React 子应用 (Port 3001, Vite)
│   └── vue-child-app/     # Vue 子应用 (Port 3002, Vite)
└── packages/
    └── shared/            # 共享常量
```

## 已完成

### Step 1: 初始化 Monorepo
- [x] 创建 `pnpm-workspace.yaml`
- [x] 创建根 `package.json`
- [x] 创建 `.npmrc`

### Step 2: 创建 React 基座应用
- [x] 创建 Vite + React + TypeScript 项目
- [x] 配置 qiankun 主应用 (registerMicroApps, start)
- [x] 配置全局状态通信 (initGlobalState)
- [x] 创建基础布局和导航组件
- [x] 配置 react-router-dom 路由

### Step 3: 创建 React 子应用
- [x] 创建 Vite + React + TypeScript 项目
- [x] 导出 qiankun 生命周期函数 (bootstrap, mount, unmount)
- [x] 配置 vite-plugin-qiankun
- [x] 配置 react-router-dom 路由 (动态 basename)
- [x] 演示父子通信

### Step 4: 创建 Vue 子应用
- [x] 创建 Vite + Vue + TypeScript 项目
- [x] 导出 qiankun 生命周期函数
- [x] 配置 vite-plugin-qiankun
- [x] 配置 vue-router (动态 base)
- [x] 演示父子通信

### Step 5: 创建共享包
- [x] 创建 `@my-microapp/shared` 共享常量

## 待完成（需手动执行）

### 依赖安装
由于网络问题，请手动执行：

```bash
cd C:\Users\16063\Desktop\interview-projects\my-microapp
pnpm install
```

如果网络不稳定，可尝试：
```bash
# 使用官方 npm registry
pnpm config set registry https://registry.npmjs.org/
pnpm install
```

### 启动验证
```bash
# 安装依赖后，启动所有应用
pnpm dev

# 或单独启动
pnpm dev:main-app  # 访问 http://localhost:3000
pnpm dev:react-child-app  # 访问 http://localhost:3001
pnpm dev:vue-child-app  # 访问 http://localhost:3002
```

## 技术选型
| 技术 | 版本 | 说明 |
|------|------|------|
| pnpm | ^8 | 包管理器 |
| vite | ^5 | 构建工具 |
| react | ^18 | 基座 + React 子应用 |
| vue | ^3 | Vue 子应用 |
| qiankun | ^2 | 微前端框架 |
| react-router-dom | ^6 | React 路由 |
| vue-router | ^4 | Vue 路由 |
| vite-plugin-qiankun | ^1.0.15 | Vite qiankun 插件 |

## 项目特性

### 样式隔离
- 配置 `sandbox: { strictStyleIsolation: true }`
- 子应用样式自动隔离

### 父子通信
- 使用 `initGlobalState` 建立全局状态
- 子应用通过 `props.onGlobalStateChange` / `props.setGlobalState` 通信

### 路由设计
- 主应用路由：`/react-child/*`, `/vue-child/*`
- React 子应用路由：根据 `__POWERED_BY_QIANKUN__` 动态设置 basename
- Vue 子应用路由：根据 `__POWERED_BY_QIANKUN__` 动态设置 base
