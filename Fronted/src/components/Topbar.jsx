import useStore from '../store/index'

// ── TÍTULOS POR PÁGINA ─────────────────────────────────────────────────────
// Mapeamos cada ruta a un título y subtítulo descriptivo
const PAGE_INFO = {
  '/procesar':      { titulo: 'Procesar Archivos',   subtitulo: 'Carga y unificación de reportes por rama' },
  '/indicadores':   { titulo: 'Indicadores',          subtitulo: 'Dashboard interactivo de gestión logística' },
  '/historial':     { titulo: 'Historial',            subtitulo: 'Registro de todos los procesamientos' },
  '/configuracion': { titulo: 'Configuración',        subtitulo: 'Gestión de transportadoras y ramas' },
}

function Topbar({ pathname }) {
  const loading = useStore(state => state.loading)
  const info    = PAGE_INFO[pathname] || { titulo: 'SAT Prebel', subtitulo: '' }

  return (
    <header className="topbar">

      {/* Título de la página actual */}
      <div>
        <div className="topbar-title">{info.titulo}</div>
        {info.subtitulo && (
          <div className="topbar-subtitle">{info.subtitulo}</div>
        )}
      </div>

      {/* Lado derecho — indicadores globales */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

        {/* Spinner de carga global */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div className="spinner" style={{ width: '14px', height: '14px' }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Cargando...
            </span>
          </div>
        )}

        {/* Fecha y hora actual */}
        <div style={{
          fontSize:   '0.75rem',
          color:      'var(--text-muted)',
          textAlign:  'right',
          lineHeight: 1.4,
        }}>
          <div style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('es-CO', {
              weekday: 'short',
              day:     '2-digit',
              month:   'short',
              year:    'numeric',
            })}
          </div>
          <div>Prebel S.A.</div>
        </div>

        {/* Avatar / iniciales del sistema */}
        <div style={{
          width:          '32px',
          height:         '32px',
          borderRadius:   '50%',
          background:     'var(--accent-light)',
          border:         '2px solid var(--accent)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontSize:       '0.75rem',
          fontWeight:     '700',
          color:          'var(--accent)',
          flexShrink:     0,
        }}>
          TI
        </div>

      </div>

    </header>
  )
}

export default Topbar