import { useState, useEffect }              from 'react'
import useStore                             from '../store/index'
import { useToast }                         from '../components/Toast'
import {
  getCarriers, getRamas,
  createCarrier, updateCarrier, deleteCarrier,
  createRama, asignarCarrierARama, quitarCarrierDeRama
} from '../api/index'

// ══════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTE: CarrierCard
//  Tarjeta de una transportadora dentro de una rama
// ══════════════════════════════════════════════════════════════════════════
function CarrierCard({ carrier, ramaId, onQuitarDeRama, onEditMapping }) {
  return (
    <div style={{
      display:      'flex',
      alignItems:   'center',
      gap:          '10px',
      padding:      '10px 14px',
      background:   'var(--bg-surface)',
      border:       '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      marginBottom: '6px',
    }}>

      {/* Punto de color del carrier */}
      <div style={{
        width:        '10px',
        height:       '10px',
        borderRadius: '50%',
        background:   carrier.color || '#1B3A6B',
        flexShrink:   0,
      }} />

      {/* Nombre */}
      <span style={{ flex: 1, fontWeight: 500, fontSize: '0.875rem' }}>
        {carrier.name}
      </span>

      {/* Badge estático */}
      {carrier.isStatic && (
        <span className="badge badge-accent" style={{ fontSize: '0.65rem' }}>
          Estática
        </span>
      )}

      {/* Acciones */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => onEditMapping(carrier)}
          title="Editar mapeo de columnas"
        >
          ✎ Mapeo
        </button>

        {!carrier.isStatic && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onQuitarDeRama(ramaId, carrier.id)}
            title="Quitar de esta rama"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTE: MappingModal
//  Panel para editar el mapeo de columnas de una transportadora
// ══════════════════════════════════════════════════════════════════════════
function MappingPanel({ carrier, onClose, onSave }) {
  // Estado local del mapeo — copia del mapeo actual del carrier
  const [mapping, setMapping] = useState(carrier.mapping || {})
  const [guardando, setGuardando] = useState(false)
  const toast = useToast()

  async function handleGuardar() {
    setGuardando(true)
    try {
      await onSave(carrier.id, mapping)
      toast.success(`Mapeo de ${carrier.name} guardado`)
      onClose()
    } catch (e) {
      toast.error('Error al guardar el mapeo')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{
      position:   'fixed',
      inset:      0,
      background: 'rgba(0,0,0,0.4)',
      display:    'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex:     200,
    }}>
      <div style={{
        background:   'var(--bg-surface)',
        borderRadius: 'var(--radius-xl)',
        width:        '560px',
        maxHeight:    '80vh',
        display:      'flex',
        flexDirection:'column',
        boxShadow:    'var(--shadow-lg)',
        overflow:     'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding:      '18px 20px',
          borderBottom: '1px solid var(--border)',
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          background:   'var(--bg-surface2)',
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Mapeo de columnas — {carrier.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
              Escribe el nombre exacto de cada columna en el Excel original
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Body — lista de columnas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {Object.entries(mapping).map(([colFinal, colOrigen]) => (
            <div key={colFinal} style={{
              display:       'grid',
              gridTemplateColumns: '1fr 1fr',
              gap:           '10px',
              marginBottom:  '10px',
              alignItems:    'center',
            }}>
              {/* Columna final (sistema) — solo lectura */}
              <div style={{
                padding:      '7px 10px',
                background:   'var(--accent-light)',
                borderRadius: 'var(--radius-sm)',
                fontSize:     '0.8rem',
                fontWeight:   500,
                color:        'var(--accent)',
                fontFamily:   'var(--font-mono)',
              }}>
                {colFinal}
              </div>

              {/* Columna origen (Excel) — editable */}
              <input
                className="form-input"
                style={{ fontSize: '0.8rem' }}
                value={colOrigen || ''}
                placeholder="Nombre en el Excel..."
                onChange={e => setMapping(prev => ({
                  ...prev,
                  [colFinal]: e.target.value
                }))}
              />
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding:   '14px 20px',
          borderTop: '1px solid var(--border)',
          display:   'flex',
          gap:       '8px',
          justifyContent: 'flex-end',
        }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            onClick={handleGuardar}
            disabled={guardando}
          >
            {guardando ? (
              <><div className="spinner" style={{ width: '14px', height: '14px' }} /> Guardando...</>
            ) : '💾 Guardar mapeo'}
          </button>
        </div>

      </div>
    </div>
  )
}


//  PÁGINA: Configuracion

function Configuracion() {
  const toast = useToast()

  // ── Store global ──────────────────────────────────────────────────
  const carriers  = useStore(state => state.carriers)
  const ramas     = useStore(state => state.ramas)
  const setCarriers = useStore(state => state.setCarriers)
  const setRamas    = useStore(state => state.setRamas)

  // ── Estado local ──────────────────────────────────────────────────
  const [ramaAbierta,    setRamaAbierta]    = useState('disnal')
  const [carrierEditando, setCarrierEditando] = useState(null)
  const [nuevoCarrier,   setNuevoCarrier]   = useState({ nombre: '', color: '#1B3A6B' })
  const [creando,        setCreando]        = useState(false)
  const [mostrarForm,    setMostrarForm]    = useState(null) // id de rama donde crear

  // ── Recargar datos ────────────────────────────────────────────────
  async function recargar() {
    try {
      const [cfg, ram] = await Promise.all([getCarriers(), getRamas()])
      setCarriers(cfg.carriers || [])
      setRamas(ram || [])
    } catch {
      toast.error('Error al recargar la configuración')
    }
  }

  // ── ACCIÓN: Crear carrier en una rama ─────────────────────────────
  async function handleCrearCarrier(ramaId) {
    if (!nuevoCarrier.nombre.trim()) {
      toast.warning('Escribe un nombre para la transportadora')
      return
    }
    setCreando(true)
    try {
      await createCarrier({
        name:    nuevoCarrier.nombre.trim(),
        color:   nuevoCarrier.color,
        rama_id: ramaId,
      })
      toast.success(`Transportadora "${nuevoCarrier.nombre}" creada`)
      setNuevoCarrier({ nombre: '', color: '#1B3A6B' })
      setMostrarForm(null)
      await recargar()
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al crear la transportadora')
    } finally {
      setCreando(false)
    }
  }

  //  ACCIÓN: Quitar carrier de una rama 
  async function handleQuitarDeRama(ramaId, carrierId) {
    const ok = window.confirm('¿Quitar esta transportadora de la rama?')
    if (!ok) return
    try {
      await deleteCarrier(carrierId)
      toast.success('Transportadora quitada de la rama')
      await recargar()
    } catch {
      toast.error('Error al quitar la transportadora')
    }
  }

  //  ACCIÓN: Guardar mapeo 
  async function handleGuardarMapeo(carrierId, mapping) {
    await updateCarrier(carrierId, { mapping })
    await recargar()
  }

  //  RENDER 
  return (
    <div>

      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
          Transportadoras por rama
        </h2>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
          Cada rama tiene sus propias transportadoras y configuración de columnas
        </p>
      </div>

      {/* Acordeón de ramas */}
      <div className="accordion">
        {ramas.map(rama => {

          const estaAbierta = ramaAbierta === rama.id
          const carriersDeRama = rama.carriers_detail || []

          return (
            <div key={rama.id} className="accordion-item">

              {/* Header de la rama */}
              <div
                className={`accordion-header ${estaAbierta ? 'open' : ''}`}
                onClick={() => setRamaAbierta(estaAbierta ? null : rama.id)}
              >
                <div className="accordion-title">
                  {/* Ícono por rama */}
                  <span style={{ fontSize: '1.1rem' }}>
                    {rama.id === 'disnal'   ? '🏢' :
                     rama.id === 'cedi'     ? '🏭' :
                     rama.id === 'rionegro' ? '🏗' : '📦'}
                  </span>
                  {rama.name}
                  <span className="accordion-badge">
                    {carriersDeRama.length} transportadora{carriersDeRama.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <span className={`accordion-chevron ${estaAbierta ? 'open' : ''}`}>
                  ▾
                </span>
              </div>

              {/* Body de la rama */}
              {estaAbierta && (
                <div className="accordion-body">

                  {/* Lista de carriers */}
                  {carriersDeRama.length === 0 ? (
                    <div style={{
                      padding:    '20px',
                      textAlign:  'center',
                      color:      'var(--text-muted)',
                      fontSize:   '0.8rem',
                      background: 'var(--bg-surface2)',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '12px',
                    }}>
                      Sin transportadoras asignadas a esta rama
                    </div>
                  ) : (
                    carriersDeRama.map(carrier => (
                      <CarrierCard
                        key={carrier.id}
                        carrier={carrier}
                        ramaId={rama.id}
                        onQuitarDeRama={handleQuitarDeRama}
                        onEditMapping={setCarrierEditando}
                      />
                    ))
                  )}

                  {/* Formulario nueva transportadora */}
                  {mostrarForm === rama.id ? (
                    <div style={{
                      padding:      '12px',
                      background:   'var(--bg-surface2)',
                      borderRadius: 'var(--radius-md)',
                      border:       '1px dashed var(--border)',
                      marginTop:    '8px',
                    }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '10px' }}>
                        Nueva transportadora en {rama.name}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                          <label className="form-label">Nombre</label>
                          <input
                            className="form-input"
                            placeholder="Ej: TCC, Envia, Deprisa..."
                            value={nuevoCarrier.nombre}
                            onChange={e => setNuevoCarrier(p => ({
                              ...p, nombre: e.target.value
                            }))}
                            onKeyDown={e => e.key === 'Enter' && handleCrearCarrier(rama.id)}
                          />
                        </div>

                        <div className="form-group">
                          <label className="form-label">Color</label>
                          <input
                            type="color"
                            value={nuevoCarrier.color}
                            onChange={e => setNuevoCarrier(p => ({
                              ...p, color: e.target.value
                            }))}
                            style={{
                              width:        '40px',
                              height:       '36px',
                              border:       '1px solid var(--border)',
                              borderRadius: 'var(--radius-md)',
                              cursor:       'pointer',
                              padding:      '2px',
                            }}
                          />
                        </div>

                        <button
                          className="btn btn-primary"
                          onClick={() => handleCrearCarrier(rama.id)}
                          disabled={creando}
                        >
                          {creando ? (
                            <div className="spinner" style={{ width: '14px', height: '14px' }} />
                          ) : '+ Crear'}
                        </button>

                        <button
                          className="btn btn-secondary"
                          onClick={() => {
                            setMostrarForm(null)
                            setNuevoCarrier({ nombre: '', color: '#1B3A6B' })
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Botón para mostrar el formulario
                    <button
                      className="btn btn-secondary"
                      style={{ marginTop: '8px', width: '100%' }}
                      onClick={() => setMostrarForm(rama.id)}
                  
                    >
                      + Nueva transportadora
                    </button>
                  )}

                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Modal de mapeo */}
      {carrierEditando && (
        <MappingPanel
          carrier={carrierEditando}
          onClose={() => setCarrierEditando(null)}
          onSave={handleGuardarMapeo}
        />
      )}

    </div>
  )
}

export default Configuracion