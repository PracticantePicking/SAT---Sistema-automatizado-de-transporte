import { useEffect }                          from 'react'
import { BrowserRouter, Routes, Route,
         Navigate, useLocation }              from 'react-router-dom'

import Sidebar         from './components/Sidebar'
import Topbar          from './components/Topbar'
import ToastContainer  from './components/Toast'
import Picking from './pages/Picking'
import SBL     from './pages/SBL'

import Procesar        from './pages/Procesar'
import Indicadores     from './pages/Indicadores'
import Historial       from './pages/Historial'
import Configuracion   from './pages/Configuracion'
import WatchFolder     from './pages/WatchFolder'
import Facturacion from './pages/Facturacion'

import useStore        from './store/index'
import { getCarriers, getRamas, getHistorial } from './api/index'


//  COMPONENTE INTERNO: AppLayout
//
//  Separamos el layout en su propio componente porque necesita
//  usar useLocation() — y ese hook SOLO funciona dentro de BrowserRouter
//  Si lo ponemos en App directamente (fuera de BrowserRouter) falla

function AppLayout() {
  const location = useLocation()

  //  Acciones del store
  const setCarriers  = useStore(state => state.setCarriers)
  const setRamas     = useStore(state => state.setRamas)
  const setHistorial = useStore(state => state.setHistorial)
  const addToast     = useStore(state => state.addToast)
  const setLoading   = useStore(state => state.setLoading)

  //  Carga inicial de datos 
  // [] vacío → se ejecuta UNA SOLA VEZ cuando la app arranca
  // Cargamos carriers, ramas e historial para tenerlos disponibles
  // en todos los componentes desde el primer momento
  useEffect(() => {
    async function cargarDatosIniciales() {
      setLoading(true)
      try {
        // Promise.all ejecuta las 3 llamadas EN PARALELO
        // Es más rápido que hacerlas una por una (secuencial)
        // Si una falla, el catch lo captura
        const [configData, ramasData, historialData] = await Promise.all([
          getCarriers(),
          getRamas(),
          getHistorial(),
        ])

        // configData tiene { carriers: [...], finalCols: [...], ramas: [...] }
        setCarriers(configData.carriers || [])
        setRamas(ramasData || [])
        setHistorial(historialData || [])

      } catch (error) {
        console.error('Error cargando datos iniciales:', error)
        addToast('error', 'No se pudo conectar con el backend. Verifica que esté corriendo en localhost:5000')
      } finally {
        // finally se ejecuta SIEMPRE — haya error o no
        // Así el spinner de carga siempre se detiene
        setLoading(false)
      }
    }

    cargarDatosIniciales()
  }, []) // ← [] es crítico aquí — sin esto haría la llamada en bucle infinito

  return (
    <div className="app-layout">

      {/* ── SIDEBAR ─────────────────────────────────────────────────
          Fijo a la izquierda, siempre visible
          Recibe pathname para saber qué item resaltar
      ─────────────────────────────────────────────────────────────── */}
      <Sidebar />

      {/* ── CONTENIDO PRINCIPAL ─────────────────────────────────────
          Todo lo que cambia según la URL va aquí
      ─────────────────────────────────────────────────────────────── */}
      <div className="app-content">

        {/* Topbar sticky en la parte superior */}
        <Topbar pathname={location.pathname} />

        {/* Área de páginas — cada Route muestra su componente */}
        <main className="page-body">
          <Routes>

            {/* Redirige / a /procesar automáticamente */}
            <Route path="/" element={<Navigate to="/procesar" replace />} />

            {/* Páginas principales */}
            <Route path="/procesar"      element={<Procesar />} />
            <Route path="/indicadores"   element={<Indicadores />} />
            <Route path="/historial"     element={<Historial />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="/watch"         element={<WatchFolder />} />
            <Route path="/facturacion" element={<Facturacion />} />
            <Route path="/picking" element={<Picking />} />
            <Route path="/sbl"     element={<SBL />} />
            {/* Ruta 404 — cualquier URL desconocida */}
            <Route path="*" element={
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">Página no encontrada</div>
                <div className="empty-state-desc">
                  La URL que buscas no existe en el sistema
                </div>
              </div>
            } />

          </Routes>
        </main>

      </div>

      {/* ── TOAST CONTAINER ─────────────────────────────────────────
          Siempre montado — muestra notificaciones desde cualquier página
          Está fuera del app-content para que flote sobre todo
      ─────────────────────────────────────────────────────────────── */}
      <ToastContainer />

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL: App
//
//  BrowserRouter DEBE ser el componente más externo
//  Todo lo que necesite useNavigate, useLocation o Link
//  debe estar DENTRO de BrowserRouter
// ══════════════════════════════════════════════════════════════════════════
function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App