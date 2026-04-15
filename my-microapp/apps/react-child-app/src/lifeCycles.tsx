import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { setSharedStoreFromProps } from './hooks/useSharedStore'

let root: ReactDOM.Root | null = null

export async function bootstrap() {
  console.log('[react-child-app] bootstrap')
}

export async function mount(props: any) {
  console.log('[react-child-app] mount', props)

  // 从 qiankun props 获取主应用下发的 vanilla store（纯 JS，不含 React）
  if (props.sharedStore) {
    setSharedStoreFromProps(props.sharedStore)
  }

  // In qiankun mode, render into the container provided by qiankun
  // In standalone mode, render into document #root
  const container = props.container
    ? props.container.querySelector('#root') || props.container
    : document.getElementById('root')

  if (container) {
    root = ReactDOM.createRoot(container)
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  }
}

export async function unmount(props: any) {
  console.log('[react-child-app] unmount', props)

  if (root) {
    root.unmount()
    root = null
  }
}
