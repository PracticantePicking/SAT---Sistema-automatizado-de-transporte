import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Sidebar       from './components/Sidebar'
import Dashboard     from './pages/Dashboard'
import Devoluciones  from './pages/Devoluciones'
import Procesar      from './pages/Procesar'
import Historial     from './pages/Historial'

function Layout() {
  return (
    <div className="layout">
      {/* Orbes de fondo */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />

      <Sidebar />

      <main className="main-content" style={{ position: 'relative', zIndex: 1 }}>
        <Routes>
          <Route path="/"             element={<Dashboard />}    />
          <Route path="/devoluciones" element={<Devoluciones />} />
          <Route path="/procesar"     element={<Procesar />}     />
          <Route path="/historial"    element={<Historial />}    />
          <Route path="*"             element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  )
}
