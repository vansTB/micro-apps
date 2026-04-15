import { Link } from 'react-router-dom'
import { useSharedStore } from '../hooks/useSharedStore'

const mockUsers = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
  { id: 3, name: 'Bob Johnson', email: 'bob@example.com' },
]

function UserList() {
  const addMessage = useSharedStore((s) => s.addMessage)
  const setUser = useSharedStore((s) => s.setUser)

  const handleSelectUser = (user: typeof mockUsers[number]) => {
    setUser({ id: String(user.id), name: user.name, role: 'user' })
    addMessage('react-child-app', `Selected user: ${user.name}`)
  }

  return (
    <div>
      <h1>User List</h1>
      <p style={{ color: '#666', marginBottom: '16px' }}>
        Click a user to set the shared user state and notify other apps.
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {mockUsers.map((user) => (
          <li
            key={user.id}
            style={{
              marginBottom: '8px',
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>{user.name} - {user.email}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleSelectUser(user)}
                style={{ padding: '4px 12px', cursor: 'pointer' }}
              >
                Select
              </button>
              <Link to={`/user-detail/${user.id}`} style={{ padding: '4px 12px', textDecoration: 'none', color: '#1976d2' }}>
                Detail
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default UserList
