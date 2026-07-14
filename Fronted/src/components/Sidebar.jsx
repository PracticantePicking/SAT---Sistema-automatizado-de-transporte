import { useNavigate, useLocation } from 'react-router-dom'
import { useSocketStatus } from '../hooks/useSocket'
import logo from '../assets/logo-30x30.png'
//            ITEMS DE NAVEGACIÓN          
// Definimos la estructura del menú como datos, no como HTML hardcodeado
// Ventaja: si quieres agregar una página nueva, solo agregas un objeto aquí
const NAV_ITEMS = [
  {
    id:    'procesar',
    path:  '/procesar',
    icon:  '⚡',
    label: 'Procesar',
  },
  {
    id:    'indicadores',
    path:  '/indicadores',
    icon:  '📊',
    label: 'Indicadores',
    //desc:  'Dashboard de control reclamo por filtros',
  },
  {
    id:    'historial',
    path:  '/historial',
    icon:  '📋',
    label: 'Historial',
    //desc:  'Procesamientos anteriores',
  },
  {
    id:    'configuracion',
    path:  '/configuracion',
    icon:  '⚙️',
    label: 'Configuración',
    //desc:  'Transportadoras y ramas',
  },
]
const FINANCIAL_ITEMS = [
  {
  id:    'Inventario',
  path:  '/inventario',
  icon:  '🗃️',
  label: 'Inventario',
  },
  {
  id:    'Controles reclamos',
  path:  '/control-reclamo',
  icon:  '📢',
  label: 'Controles reclamos',
  desc:  'Dashboard de control reclamo por filtros',
  },

];

const PRODUCTION_ITEMS = [
   {
    id:    'sbl',
    path:  '/sbl',
    icon:  '📦',
    label: 'Productividad SBL',
  },
  {
    id:    'picking',
    path:  '/picking',
    icon:  '🚚',
    label: 'Productividad Picking',
  },
];

//  COMPONENTE: Sidebar
function Sidebar() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const connected = useSocketStatus()

  // La página activa es la que coincide con la URL actual
  // location.pathname → "/procesar"
  // item.path         → "/procesar"
  const isActive = (path) => location.pathname === path

  return (
    <aside className="sidebar">

      {/*  LOGO / HEADER  */}
       <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img
            src={logo}
            alt="Prebel"
            style={{
              width:        '36px',
              height:       '36px',
              borderRadius: '8px',
              objectFit:    'contain',
              flexShrink:   0,
            }}
          />
          <div>
            <h1 style={{ fontSize:'0.9rem', fontWeight:'700', color:'#FFFFFF', lineHeight:1.2 }}>
              SAT
            </h1>
            <span style={{ fontSize:'0.7rem', color:'var(--sidebar-text)', lineHeight:1 }}>
              Análisis 360 de DISNAL
            </span>
          </div>
        </div>

      {/*  NAVEGACIÓN  */}
      <nav className="sidebar-nav">

        <div className="nav-section-label">Módulo Logistico</div>
        
        {/* Iteramos sobre NAV_ITEMS y creamos un botón por cada uno */}
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={item.desc}  // tooltip al hacer hover
          >
            {/* Ícono */}
            <span className="nav-icon">{item.icon}</span>

            {/* Texto */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '0.65rem', opacity: 0.6, lineHeight: 1 }}>
                {item.desc}
              </span>
            </div>

            {/* Indicador activo — barra derecha */}
            {isActive(item.path) && (
              <div style={{
                marginLeft:  'auto',
                width:       '4px',
                height:      '20px',
                borderRadius:'2px',
                background:  '#FFFFFF',
                opacity:     0.8,
              }} />
            )}
          </div>
        ))}

        {/* ... Modulo de estrategia financiera */}
        <div className="nav-section-label">Módulo financiero</div>

        {FINANCIAL_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={item.desc}
          >
            <span className="nav-icon">{item.icon}</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '0.65rem', opacity: 0.6, lineHeight: 1 }}>
                {item.desc}
              </span>
            </div>

            {isActive(item.path) && (
              <div style={{
                marginLeft:  'auto',
                width:       '4px',
                height:      '20px',
                borderRadius:'2px',
                background:  '#FFFFFF',
                opacity:     0.8,
              }} />
            )}
          </div>
        ))}  
        {/* ... Modulo de productividad */}
        <div className="nav-section-label">Módulo de productividad</div>
        {PRODUCTION_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
            title={item.desc}
          >
            <span className="nav-icon">{item.icon}</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                {item.label}
              </span>
              <span style={{ fontSize: '0.65rem', opacity: 0.6, lineHeight: 1 }}>
                {item.desc}
              </span>
            </div>

            {isActive(item.path) && (
              <div style={{
                marginLeft:  'auto',
                width:       '4px',
                height:      '20px',
                borderRadius:'2px',
                background:  '#FFFFFF',
                opacity:     0.8,
              }} />
            )}
          </div>
        ))} 

      </nav>

      {/*  FOOTER — Estado del servidor          */}
      <div className="sidebar-footer">

        {/* Estado de conexión Socket.IO */}
        <div className="sidebar-status">
          <div className={`status-dot ${connected ? '' : 'offline'}`} />
          <span>
            {connected ? 'Servidor conectado' : 'Sin conexión'}
          </span>
        </div>

        {/* Separador */}
        <div style={{ height: '1px', background: 'var(--sidebar-border)', margin: '10px 0' }} />

        {/* Info del sistema */}
        <div style={{ fontSize: '0.7rem', color: 'var(--sidebar-text)', opacity: 0.5 }}>
          <div>Prebel S.A.S</div>
        </div>

      </div>

    </aside>
  )
}

export default Sidebar