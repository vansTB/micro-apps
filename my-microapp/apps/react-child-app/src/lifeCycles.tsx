import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

let root: ReactDOM.Root | null = null

export async function bootstrap() {
  console.log('[react-child-app] bootstrap')
}

export async function mount(props: any) {
  console.log('[react-child-app] mount', props)

  if (props.onGlobalStateChange) {
    props.onGlobalStateChange((state: any) => {
      console.log('[react-child-app] received state from main:', state)
    }, true)
  }

  if (props.setGlobalState) {
    props.setGlobalState({
      fromReactChild: 'hello from react-child-app',
      timestamp: Date.now(),
    })
  }

  // Use props.container (qiankun-provided) or fallback to document #root
  const container = props.container
    ? props.container.querySelector('#root') || props.container
    : document.getElementById('root')

  if (container) {
    root = ReactDOM.createRoot(container)
    root.render(
      <React.StrictMode>
        <App {...props} />
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
