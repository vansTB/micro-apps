import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { initQiankun } from './qiankun'

// Initialize qiankun
initQiankun()

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          {/* Child routes handled by qiankun registerMicroApps */}
          <Route path="react-child/*" element={<div />} />
          <Route path="vue-child/*" element={<div />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
