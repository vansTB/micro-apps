import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { initQiankun } from './qiankun'
import { MicroApp } from './qiankun/MicroApp'

// Initialize qiankun
initQiankun()

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="react-child/*"
            element={<MicroApp name="react-child-app" url="//localhost:3001" />}
          />
          <Route
            path="vue-child/*"
            element={<MicroApp name="vue-child-app" url="//localhost:3002" />}
          />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
