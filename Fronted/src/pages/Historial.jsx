import { useState }                    from 'react'
import useStore                        from '../store/index'
import { useToast }                    from '../components/Toast'
import { deleteHistorial,
         downloadHistorial }           from '../api/index'
import { useNavigate }                 from 'react-router-dom'

// ── COLORES POR RAMA ───────────────────────────────────────────────────────
const RAMA_COLORES = {
  DISNAL:   { bg: '#EBF0FA', color: '#1B3A6B' },
  disnal:   { bg: '#EBF0FA', color: '#1B3A6B' },
  CEDI:     { bg: '#F0FFF4', color: '#38A169' },
  cedi:     { bg: '#F0FFF4', color: '#38A169' },
  Rionegro: { bg: '#FFFFF0', color: '#D69E2E' },
  rionegro: { bg: '#FFFFF0', color: '#D69E2E' },
}

function formatFecha(fecha) {
  if (!fecha) return '—'
  const d = new Date(fecha.replace(' ', 'T'))
  const dia  = d.toLocaleDateString('es-CO', { day:'2-digit', month:'2-digit', year:'numeric' })
  const hora = d.toLocaleTimeString('es-CO', { hour:'2-digit', minute:'2-digit' })
  return `${dia} ${hora}`
}

function formatNum(n) {
  if (!n && n !== 0) return '—'
  return Number(n).toLocaleString('es-CO')
}

// ══════════════════════════════════════════════════════════════════════════
//  MODAL DE CONFIRMACIÓN
// ══════════════════════════════════════════════════════════════════════════
function ConfirmModal({ mensaje, onAceptar, onCancelar }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:500 }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius-xl)',
        width:'420px', boxShadow:'var(--shadow-lg)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'20px 22px 0', display:'flex', alignItems:'flex-start', gap:'14px' }}>
          <div style={{ width:'40px', height:'40px', borderRadius:'50%',
            background:'#FFF5F5', display:'flex', alignItems:'center',
            justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>
            🗑
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.95rem', marginBottom:'6px' }}>
              Eliminar registro
            </div>
            <div style={{ fontSize:'0.82rem', color:'var(--text-secondary)', lineHeight:1.5 }}>
              {mensaje}
            </div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'6px' }}>
              Esta acción no se puede deshacer.
            </div>
          </div>
        </div>

        {/* Botones */}
        <div style={{ padding:'18px 22px', display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
          <button className="btn btn-danger" onClick={onAceptar}>Eliminar</button>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  PÁGINA: Historial
// ══════════════════════════════════════════════════════════════════════════
function Historial() {
  const navigate = useNavigate()
  const toast    = useToast()

  const historial           = useStore(s => s.historial)
  const eliminarDeHistorial = useStore(s => s.eliminarDeHistorial)
  const setFiltro           = useStore(s => s.setFiltro)

  const [eliminandoId, setEliminandoId] = useState(null)
  const [confirmando,  setConfirmando]  = useState(null)

  // ── Iniciar eliminación — abre el modal ───────────────────────────
  function handleEliminar(id, archivo) {
    setConfirmando({ id, archivo })
  }

  // ── Confirmar eliminación ─────────────────────────────────────────
  async function confirmarEliminar() {
    const { id, archivo } = confirmando
    setConfirmando(null)
    setEliminandoId(id)
    try {
      await deleteHistorial(id)
      eliminarDeHistorial(id)
      toast.success('Registro eliminado correctamente')
    } catch {
      toast.error('Error al eliminar el registro')
    } finally {
      setEliminandoId(null)
    }
  }

  // ── Ver en indicadores ────────────────────────────────────────────
  function handleVerIndicadores(registro) {
    setFiltro('historial_id', registro.id)
    setFiltro('rama', registro.rama?.toLowerCase() || '')
    navigate('/indicadores')
  }

  // ── Descargar Excel ───────────────────────────────────────────────
  function handleDescargar(filename) {
    downloadHistorial(filename)
    toast.info(`Descargando ${filename}...`)
  }

  return (
    <div>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'20px' }}>
        <div>
          <h2 style={{ fontSize:'1.1rem', fontWeight:600, color:'var(--text-primary)' }}>
            Procesamientos registrados
          </h2>
          <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'2px' }}>
            {historial.length} registro{historial.length !== 1 ? 's' : ''} en total
          </p>
        </div>
      </div>

      {/* Tabla */}
      {historial.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">Sin procesamientos aún</div>
            <div className="empty-state-desc">
              Cuando proceses archivos en la pestaña Procesar, aparecerán aquí automáticamente.
            </div>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Archivo</th>
                  <th>Filas</th>
                  <th>Transportadoras</th>
                  <th>Rama</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((reg, idx) => {
                  const carriers   = Array.isArray(reg.carriers) ? reg.carriers : []
                  const ramaKey    = reg.rama || ''
                  const ramaStyle  = RAMA_COLORES[ramaKey] || { bg:'var(--bg-surface2)', color:'var(--text-muted)' }
                  const ramaLabel  = ramaKey ? ramaKey.toUpperCase() : null

                  return (
                    <tr key={reg.id}>

                      {/* Número */}
                      <td style={{ color:'var(--text-muted)', width:'40px' }}>
                        {historial.length - idx}
                      </td>

                      {/* Fecha */}
                      <td style={{ whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:500 }}>
                          {formatFecha(reg.fecha).split(' ')[0]}
                        </div>
                        <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>
                          {formatFecha(reg.fecha).split(' ')[1]}
                        </div>
                      </td>

                      {/* Archivo */}
                      <td>
                        <div style={{ fontSize:'0.8rem', fontFamily:'var(--font-mono)',
                          color:'var(--text-secondary)', maxWidth:'220px',
                          overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                          title={reg.archivo}>
                          {reg.archivo}
                        </div>
                      </td>

                      {/* Filas */}
                      <td>
                        <span style={{ fontWeight:600, color:'var(--text-primary)' }}>
                          {formatNum(reg.total_filas)}
                        </span>
                      </td>

                      {/* Transportadoras */}
                      <td>
                        <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                          {carriers.length > 0 ? carriers.map((c, i) => (
                            <span key={i} className="badge badge-accent">{c}</span>
                          )) : (
                            <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>—</span>
                          )}
                        </div>
                      </td>

                      {/* Rama */}
                      <td>
                        {ramaLabel ? (
                          <span className="badge" style={{ background:ramaStyle.bg, color:ramaStyle.color }}>
                            {ramaLabel}
                          </span>
                        ) : (
                          <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>—</span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td>
                        <div style={{ display:'flex', gap:'6px' }}>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => handleVerIndicadores(reg)}
                            title="Ver indicadores">
                            📊 Ver
                          </button>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => handleDescargar(reg.archivo)}
                            title="Descargar Excel">
                            ⬇
                          </button>
                          <button className="btn btn-danger btn-sm"
                            onClick={() => handleEliminar(reg.id, reg.archivo)}
                            disabled={eliminandoId === reg.id}
                            title="Eliminar registro">
                            {eliminandoId === reg.id
                              ? <div className="spinner" style={{ width:'12px', height:'12px' }} />
                              : '🗑'}
                          </button>
                        </div>
                      </td>

                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de confirmación */}
      {confirmando && (
        <ConfirmModal
          mensaje={`¿Eliminar el archivo "${confirmando.archivo}"? El Excel también será eliminado del servidor.`}
          onAceptar={confirmarEliminar}
          onCancelar={() => setConfirmando(null)}
        />
      )}

    </div>
  )
}

export default Historial