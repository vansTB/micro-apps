import { useSharedStore, sharedStore } from '../store/sharedStore'
import { Link } from 'react-router-dom'

function Home() {
  const user = useSharedStore((s) => s.user)
  const theme = useSharedStore((s) => s.theme)
  const messages = useSharedStore((s) => s.messages)
  const setUser = useSharedStore((s) => s.setUser)
  const addMessage = useSharedStore((s) => s.addMessage)
  const clearMessages = useSharedStore((s) => s.clearMessages)

  return (
    <div style={{ padding: '24px' }}>
      <h1>Main App - Communication Hub</h1>

      {/* 用户信息 - 父子通信演示 */}
      <section style={{ marginTop: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Parent ↔ Child: User State</h2>
        {user ? (
          <div>
            <p><strong>Current User:</strong> {user.name} ({user.role})</p>
            <button onClick={() => setUser(null)}>Logout (Main App)</button>
          </div>
        ) : (
          <div>
            <p>No user logged in.</p>
            <button
              onClick={() => setUser({ id: '1', name: 'Admin', role: 'admin' })}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              Login as Admin (from Main)
            </button>
          </div>
        )}
      </section>

      {/* 消息列表 - 兄弟通信演示 */}
      <section style={{ marginTop: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Sibling Communication: Messages</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => addMessage('main-app', 'Hello from Main App!')}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            Send Message
          </button>
          <button
            onClick={clearMessages}
            style={{ padding: '8px 16px', cursor: 'pointer' }}
          >
            Clear All
          </button>
        </div>
        {messages.length === 0 ? (
          <p style={{ color: '#999' }}>No messages yet. Try sending one from here or from a child app.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {messages.map((msg) => (
              <li
                key={msg.id}
                style={{
                  padding: '8px 12px',
                  marginBottom: '6px',
                  backgroundColor: msg.from === 'main-app' ? '#e3f2fd' : msg.from === 'react-child-app' ? '#e8f5e9' : '#fff3e0',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${msg.from === 'main-app' ? '#1976d2' : msg.from === 'react-child-app' ? '#388e3c' : '#f57c00'}`,
                }}
              >
                <strong>[{msg.from}]</strong> {msg.content}
                <span style={{ float: 'right', color: '#999', fontSize: '12px' }}>
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 主题切换 - 全局状态演示 */}
      <section style={{ marginTop: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Global State: Theme</h2>
        <p>Current theme: <strong>{theme}</strong></p>
        <button
          onClick={() => sharedStore.getState().setTheme(theme === 'light' ? 'dark' : 'light')}
          style={{ padding: '8px 16px', cursor: 'pointer' }}
        >
          Toggle Theme
        </button>
      </section>

      {/* 导航 */}
      <section style={{ marginTop: '20px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <p>Navigate to child apps to test cross-app communication:</p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Link to="/react-child" style={{ color: '#61dafb', fontWeight: 600 }}>React Child App</Link>
          <Link to="/vue-child" style={{ color: '#42b883', fontWeight: 600 }}>Vue Child App</Link>
        </div>
      </section>
    </div>
  )
}

export default Home
