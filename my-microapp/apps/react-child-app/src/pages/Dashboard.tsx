import { useSharedStore } from '../hooks/useSharedStore'

function Dashboard() {
  const user = useSharedStore((s) => s.user)
  const messages = useSharedStore((s) => s.messages)
  const setUser = useSharedStore((s) => s.setUser)
  const addMessage = useSharedStore((s) => s.addMessage)
  const clearMessages = useSharedStore((s) => s.clearMessages)

  const isQiankun = !!(window as any).__POWERED_BY_QIANKUN__ || !!(window as any).proxy

  return (
    <div>
      <h1>React Child App - Dashboard</h1>

      {/* 父子通信：用户状态 */}
      <section style={{ marginTop: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Parent ↔ Child: User State</h2>
        <p><strong>Qiankun Mode:</strong> {isQiankun ? 'Yes' : 'No'}</p>
        {user ? (
          <div>
            <p><strong>Current User:</strong> {user.name} ({user.role})</p>
            <button onClick={() => setUser(null)}>Logout (React Child)</button>
          </div>
        ) : (
          <div>
            <p>No user logged in.</p>
            <button
              onClick={() => setUser({ id: '2', name: 'ReactUser', role: 'user' })}
              style={{ padding: '8px 16px', cursor: 'pointer' }}
            >
              Login as ReactUser (from Child)
            </button>
          </div>
        )}
      </section>

      {/* 兄弟通信：消息 */}
      <section style={{ marginTop: '20px', padding: '16px', border: '1px solid #ddd', borderRadius: '8px' }}>
        <h2>Sibling Communication: Messages</h2>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          <button
            onClick={() => addMessage('react-child-app', 'Hello from React Child!')}
            style={{ padding: '8px 16px', cursor: 'pointer', backgroundColor: '#61dafb', border: 'none', borderRadius: '4px' }}
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
          <p style={{ color: '#999' }}>No messages yet.</p>
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
    </div>
  )
}

export default Dashboard
