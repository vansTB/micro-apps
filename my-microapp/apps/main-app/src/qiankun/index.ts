import { initGlobalState } from 'qiankun'

// Initialize global state
const initialState = {
  user: null,
  theme: 'light'
}

const actions = initGlobalState(initialState)

// Export for use in components
export { actions }

// Initialize qiankun (without registerMicroApps — loadMicroApp handles mounting)
export function initQiankun() {
  // loadMicroApp in MicroApp.tsx handles lifecycle
  // No need to call registerMicroApps or start()
}
