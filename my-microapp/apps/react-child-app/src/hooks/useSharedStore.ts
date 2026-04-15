import { useStore, createStore } from 'zustand'
import type { StoreApi } from 'zustand'
import type { SharedStore } from '@my-microapp/shared'

let _vanillaStore: StoreApi<SharedStore> | null = null

/** standalone 模式下的本地 fallback store */
const _fallbackStore = createStore<SharedStore>(() => ({
  user: null,
  theme: 'light',
  messages: [],
  setUser: () => {},
  setTheme: () => {},
  addMessage: () => {},
  clearMessages: () => {},
}))

export function setSharedStoreFromProps(store: StoreApi<SharedStore>) {
  _vanillaStore = store
}

export function useSharedStore(): SharedStore
export function useSharedStore<T>(selector: (s: SharedStore) => T): T
export function useSharedStore(selector?: (s: SharedStore) => unknown) {
  const store = _vanillaStore || _fallbackStore
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore(store, selector as never)
}
