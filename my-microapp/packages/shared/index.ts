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

// ============================================================
// Zustand 共享 Store 定义
// ============================================================

/** 全局共享状态类型 */
export interface SharedState {
  /** 当前用户信息 */
  user: { id: string; name: string; role: string } | null;
  /** 主题 */
  theme: 'light' | 'dark';
  /** 消息列表（用于父子/兄弟应用通信演示） */
  messages: Message[];
}

/** 通信消息 */
export interface Message {
  id: string;
  from: string;
  content: string;
  timestamp: number;
}

/** Store actions */
export interface SharedActions {
  setUser: (user: SharedState['user']) => void;
  setTheme: (theme: SharedState['theme']) => void;
  addMessage: (from: string, content: string) => void;
  clearMessages: () => void;
}

export type SharedStore = SharedState & SharedActions;

/** 初始状态 */
export const INITIAL_SHARED_STATE: SharedState = {
  user: null,
  theme: 'light',
  messages: [],
};
