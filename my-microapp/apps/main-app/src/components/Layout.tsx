import { Link, Outlet } from 'react-router-dom'

function Layout() {
  return (
    <div>
      <nav style={{
        display: 'flex',
        gap: '24px',
        padding: '16px 24px',
        backgroundColor: '#1a1a2e',
        color: '#fff'
      }}>
        <Link to="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
          Home
        </Link>
        <Link to="/react-child" style={{ color: '#61dafb', textDecoration: 'none' }}>
          React Child App
        </Link>
        <Link to="/vue-child" style={{ color: '#42b883', textDecoration: 'none' }}>
          Vue Child App
        </Link>
      </nav>
      <main style={{ padding: '24px' }}>
        <Outlet />
        <div id="subapp-container" />
      </main>
    </div>
  )
}

export default Layout
