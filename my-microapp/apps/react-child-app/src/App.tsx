import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import UserList from "./pages/UserList";
import UserDetail from "./pages/UserDetail";

function App() {
  const isQiankun =
    (window as any).__POWERED_BY_QIANKUN__ || (window as any).proxy;
  const basename = isQiankun ? "/react-child" : "/";
  console.log("-micro-react-child");

  return (
    <BrowserRouter basename={basename}>
      <div style={{ padding: "20px" }}>
        <nav
          style={{
            marginBottom: "20px",
            borderBottom: "1px solid #ccc",
            paddingBottom: "10px",
          }}
        >
          <Link to="/" style={{ marginRight: "15px" }}>
            Dashboard
          </Link>
          <Link to="/user-list" style={{ marginRight: "15px" }}>
            User List
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/user-list" element={<UserList />} />
          <Route path="/user-detail/:id" element={<UserDetail />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
