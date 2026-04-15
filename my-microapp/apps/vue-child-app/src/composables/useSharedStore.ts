import { ref, onMounted, onUnmounted, computed } from 'vue'

interface Message {
  id: string
  from: string
  content: string
  timestamp: number
}

interface SharedState {
  user: { id: string; name: string; role: string } | null
  theme: 'light' | 'dark'
  messages: Message[]
  setUser: (user: SharedState['user']) => void
  setTheme: (theme: SharedState['theme']) => void
  addMessage: (from: string, content: string) => void
  clearMessages: () => void
}

/**
 * Vue composable：绑定主应用下发的 Zustand vanilla store。
 *
 * 原理和 React 子应用一样：
 * - vanilla store 是纯 JS 对象 { getState, setState, subscribe }
 * - 用 Vue 的 ref + watch 做响应式绑定
 * - 不依赖 React，不依赖 Zustand npm 包
 */
export function useSharedStore() {
  const store = window.__sharedStore__
  const state = ref<SharedState>(store ? { ...store.getState() } : ({} as SharedState))

  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    if (store) {
      unsubscribe = store.subscribe((newState: SharedState) => {
        state.value = { ...newState }
      })
    }
  })

  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  })

  const user = computed(() => state.value.user)
  const theme = computed(() => state.value.theme)
  const messages = computed(() => state.value.messages)

  function setUser(user: SharedState['user']) {
    store?.getState().setUser(user)
  }

  function setTheme(theme: SharedState['theme']) {
    store?.getState().setTheme(theme)
  }

  function addMessage(from: string, content: string) {
    store?.getState().addMessage(from, content)
  }

  function clearMessages() {
    store?.getState().clearMessages()
  }

  return { user, theme, messages, setUser, setTheme, addMessage, clearMessages }
}
