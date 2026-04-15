import { createStore } from 'zustand/vanilla'
import { useStore } from 'zustand'
import type { SharedStore } from '../../../shared'

/**
 * 用 vanilla 模式创建 store —— 不依赖任何 React，是纯 JS 对象。
 *
 * { getState, setState, subscribe } 三个方法组成的普通对象，
 * 可以安全地跨 qiankun JS 沙箱传递。
 */
export const sharedStore = createStore<SharedStore>((set) => ({
  // ---- state ----
  user: null,
  theme: 'light',
  messages: [],

  // ---- actions ----
  setUser: (user) => set({ user }),

  setTheme: (theme) => set({ theme }),

  addMessage: (from, content) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          from,
          content,
          timestamp: Date.now(),
        },
      ],
    })),

  clearMessages: () => set({ messages: [] }),
}))

/**
 * 主应用自己的 hook —— 绑定到 sharedStore。
 * 子应用不能直接用这个 hook（React 实例不同），
 * 子应用需要自己创建 hook 并绑定到同一个 sharedStore。
 */
export function useSharedStore<T>(selector: (s: SharedStore) => T): T
export function useSharedStore(): SharedStore
export function useSharedStore(selector?: (s: SharedStore) => unknown) {
  return useStore(sharedStore, selector as never)
}
