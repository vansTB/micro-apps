import { useStore } from 'zustand'
import type { StoreApi } from 'zustand'
import type { SharedStore } from '../../../../shared'

/**
 * 子应用的共享 store 适配层。
 *
 * 核心原理：
 * - 主应用通过 qiankun props 下发 vanilla store（纯 JS，不含 React）
 * - 子应用在 mount 时保存这个 vanilla store 引用
 * - 子应用用自己的 React + 自己的 zustand/useStore 绑定同一个 store
 * - 所有应用操作的是同一个 store 实例，状态实时同步
 */

let _vanillaStore: StoreApi<SharedStore> | null = null

/** 在 qiankun mount 时调用，保存主应用下发的 vanilla store */
export function setSharedStoreFromProps(store: StoreApi<SharedStore>) {
  _vanillaStore = store
}

/**
 * 在子应用组件中使用共享 store，用法和主应用一模一样：
 *
 *   const user = useSharedStore(s => s.user)
 *   const addMessage = useSharedStore(s => s.addMessage)
 */
export function useSharedStore(): SharedStore
export function useSharedStore<T>(selector: (s: SharedStore) => T): T
export function useSharedStore(selector?: (s: SharedStore) => unknown) {
  if (!_vanillaStore) {
    // standalone 模式：没有主应用下发 store，返回占位
    if (selector) {
      return undefined as unknown
    }
    return {} as SharedStore
  }

  // 用子应用自己的 React + zustand 绑定主应用的 vanilla store
  // 这是避免 "Invalid hook call" 的关键：
  // vanilla store 不含 React，useStore 来自子应用自己的 zustand
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore(_vanillaStore, selector as never)
}
