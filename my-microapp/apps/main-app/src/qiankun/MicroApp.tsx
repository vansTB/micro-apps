import { useEffect, useRef } from 'react'
import { loadMicroApp, MicroApp as MicroAppType } from 'qiankun'

interface MicroAppProps {
  name: string
  url?: string
  props?: Record<string, unknown>
}

export function MicroApp({ name, url, props = {} }: MicroAppProps) {
  const containerId = `qiankun-container-${name}`
  const microAppRef = useRef<MicroAppType | null>(null)

  useEffect(() => {
    if (!url) return

    // Delay to ensure DOM is ready after React StrictMode re-mount
    const timer = setTimeout(() => {
      const container = document.getElementById(containerId)
      if (!container) return

      const microApp = loadMicroApp({
        name,
        entry: url,
        container: `#${containerId}`,
        props
      })

      microAppRef.current = microApp
    }, 0)

    return () => {
      clearTimeout(timer)
      if (microAppRef.current) {
        microAppRef.current.unmount()
        microAppRef.current = null
      }
    }
  }, [name, url])

  return (
    <div id={containerId} className="micro-app-container" />
  )
}
