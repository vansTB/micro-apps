// 共享常量

// 应用名称
export const APP_NAMES = {
  MAIN: 'main-app',
  REACT_CHILD: 'react-child-app',
  VUE_CHILD: 'vue-child-app'
} as const;

// 应用路径
export const APP_PATHS = {
  MAIN: '/',
  REACT_CHILD: '/react-child',
  VUE_CHILD: '/vue-child'
} as const;

// 应用端口
export const APP_PORTS = {
  MAIN: 3000,
  REACT_CHILD: 3001,
  VUE_CHILD: 3002
} as const;

// 事件名称
export const EVENTS = {
  STATE_CHANGE: 'global_state_change',
  ROUTE_CHANGE: 'route_change'
} as const;

// 初始全局状态
export interface GlobalState {
  user: { id: string; name: string } | null;
  theme: 'light' | 'dark';
  fromChild: string | null;
}

export const INITIAL_STATE: GlobalState = {
  user: null,
  theme: 'light',
  fromChild: null
};
