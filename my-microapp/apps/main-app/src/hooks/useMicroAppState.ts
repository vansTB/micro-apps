import { useState, useEffect } from 'react'
import { initGlobalState, MicroAppStateActions } from 'qiankun'

// Initial global state
const initialState = {
  user: null,
  theme: 'light'
}

// Initialize global state
let actions: MicroAppStateActions | null = null

export function useMicroAppState() {
  const [globalState, setGlobalState] = useState<Record<string, unknown>>(initialState)

  useEffect(() => {
    // Initialize global state on first use
    if (!actions) {
      actions = initGlobalState(initialState)
    }

    // Subscribe to state changes
    const unsubscribe = actions.onGlobalStateChange((state: Record<string, unknown>) => {
      setGlobalState(prev => ({ ...prev, ...state }))
    })

    // Set initial state
    setGlobalState(initialState)

    return () => {
      unsubscribe()
    }
  }, [])

  // Set global state
  const setGlobalStateValue = (key: string, value: unknown) => {
    if (actions) {
      actions.setGlobalState({ [key]: value })
    }
  }

  // Set multiple global state values
  const setGlobalStateValues = (values: Record<string, unknown>) => {
    if (actions) {
      actions.setGlobalState(values)
    }
  }

  return {
    globalState,
    setGlobalStateValue,
    setGlobalStateValues
  }
}

export { actions }
