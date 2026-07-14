import { useState, useEffect, useRef } from 'react'
import useStore        from '../store/index'
import { useToast }    from '../components/Toast'
import { useSocket }   from '../hooks/useSocket'
import {
  uploadFile,
  procesarArchivos,
  getJobStatus,
  getHistorial,
} from '../api/index'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ══════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTE: MappingModal
// ══════════════════════════════════════════════════════════════════════════
function MappingModal({ datos, onConfirmar, onCancelar }) {
  const [mapping, setMapping] = useState(() => {
    const inicial = {}
    // El backend puede retornar sugerencias con clave "col" o "sugerido"
    Object.entries(datos.sugerencias || {}).forEach(([colFinal, info]) => {
      const col       = info?.col || info?.sugerido || datos.mapeo_actual?.[colFinal] || ''
      const confianza = info?.confianza || info?.score || 0
      inicial[colFinal] = { col, confianza }
    })
    // Agregar columnas del mapeo_actual que no tienen sugerencia
    Object.entries(datos.mapeo_actual || {}).forEach(([colFinal, colOrigen]) => {
      if (!inicial[colFinal]) {
        inicial[colFinal] = { col: colOrigen || '', confianza: 0 }
      }
    })
    return inicial
  })

  function getColor(c) { return c >= 85 ? '#16A34A' : c >= 60 ? '#CA8A04' : '#DC2626' }

  const total     = Object.keys(mapping).length
  const correctas = Object.values(mapping).filter(v => v.confianza >= 85).length
  const verificar = Object.values(mapping).filter(v => v.confianza >= 60 && v.confianza < 85).length
  const hayProblemas = Object.values(mapping).some(v => v.confianza < 60)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)',
      display:'flex', alignItems:'center', justifyContent:'center', zIndex:400 }}>
      <div style={{ background:'var(--bg-surface)', borderRadius:'var(--radius-xl)',
        width:'580px', maxHeight:'85vh', display:'flex', flexDirection:'column',
        boxShadow:'var(--shadow-lg)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'18px 22px', borderBottom:'1px solid var(--border)',
          display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'4px' }}>
              Mapeo de columnas — {datos.carrier || 'Transportadora'}
            </div>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', display:'flex', alignItems:'center', gap:'4px' }}>
              📄 {datos.original}
            </div>
            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'3px' }}>
              El sistema detectó las columnas del archivo. Verifica o ajusta las sugerencias automáticas.
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onCancelar}>✕</button>
        </div>

        {/* Columnas detectadas */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 22px' }}>
          {Object.entries(mapping).map(([colFinal, info]) => {
            const pct = Number(info.confianza.toFixed(1))
            const color = getColor(info.confianza)
            return (
              <div key={colFinal} style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr',
                gap:'8px', alignItems:'center', marginBottom:'8px' }}>

                {/* Columna del sistema */}
                <div style={{ padding:'7px 10px', background:'var(--accent-light)',
                  borderRadius:'var(--radius-sm)', fontSize:'0.8rem', fontWeight:600,
                  color:'var(--accent)', fontFamily:'var(--font-mono)',
                  overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {colFinal}
                </div>

                {/* Badge de confianza */}
                <div style={{ fontSize:'0.72rem', fontWeight:700, color, minWidth:'40px', textAlign:'center', whiteSpace:'nowrap' }}>
                  {pct > 0 ? `${pct}%` : '→'}
                </div>

                {/* Select con columnas del Excel */}
                <select
                  className="form-select"
                  style={{ fontSize:'0.8rem', borderColor: info.confianza < 60 ? '#DC2626' : info.confianza < 85 ? '#CA8A04' : 'var(--border)' }}
                  value={info.col || ''}
                  onChange={e => setMapping(prev => ({
                    ...prev,
                    [colFinal]: { ...prev[colFinal], col: e.target.value }
                  }))}
                >
                  <option value="">— Sin asignar —</option>
                  {(datos.columnas_excel || []).map(col => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding:'14px 22px', borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:'var(--bg-surface2)' }}>
          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>
            {datos.columnas_excel?.length || 0} columnas detectadas en el Excel
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => onConfirmar(mapping)}>
               Confirmar y guardar mapeo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTE: FileSlot
// ══════════════════════════════════════════════════════════════════════════
function FileSlot({ archivo, onArchivoSubido, onEliminar, carrier, disabled, placeholder }) {
  const inputRef = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  const toast = useToast()

  async function handleFile(file) {
    if (!file) return
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.warning('Solo se aceptan archivos .xlsx o .xls')
      return
    }
    setSubiendo(true)
    try {
      const res = await uploadFile(file, carrier.id)
      onArchivoSubido({
        filename:       res.filename,
        original:       res.original || file.name,
        columnas_excel: res.columnas_excel,
        sugerencias:    res.sugerencias,
        mapeo_actual:   res.mapeo_actual,
      })
    } catch {
      toast.error(`Error subiendo ${file.name}`)
    } finally {
      setSubiendo(false)
    }
  }

  // Slot con archivo confirmado
  if (archivo) {
    return (
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px',
        background:'var(--bg-surface2)', borderRadius:'var(--radius-sm)',
        border:'1px solid var(--border)', marginBottom:'6px' }}>
        <span style={{ fontSize:'0.9rem', flexShrink:0 }}>📎</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'0.75rem', fontWeight:500, color:'var(--text-secondary)',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={archivo.original}>
            {archivo.original}
          </div>
          {archivo.rows > 0 && (
            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>
              {Number(archivo.rows).toLocaleString('es-CO')} filas
            </div>
          )}
        </div>
        <span className="badge" style={{ background:'#F0FFF4', color:'#16A34A', fontSize:'0.65rem' }}>✓ Mapeado</span>
        <button onClick={() => onEliminar(carrier.id, archivo.filename)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'1rem', padding:'0 2px', flexShrink:0 }}>
          ×
        </button>
      </div>
    )
  }

  // Slot vacío
  return (
    <div onClick={() => !disabled && !subiendo && inputRef.current?.click()}
      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px',
        borderRadius:'var(--radius-sm)', border:'1px dashed var(--border)', marginBottom:'6px',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, transition:'var(--transition)' }}
      onMouseEnter={e => !disabled && (e.currentTarget.style.borderColor = 'var(--accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (!disabled) handleFile(e.dataTransfer.files[0]) }}
    >
      <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }}
        onChange={e => handleFile(e.target.files[0])} />
      {subiendo
        ? <div className="spinner" style={{ width:'14px', height:'14px', flexShrink:0 }} />
        : <span style={{ fontSize:'0.9rem', opacity:0.4, flexShrink:0 }}>📎</span>}
      <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>
        {subiendo ? 'Subiendo...' : placeholder}
      </span>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  SUBCOMPONENTE: CarrierCard
// ══════════════════════════════════════════════════════════════════════════
function CarrierCard({ carrier, archivos, onSubir, onEliminar, disabled }) {
  const [slots,      setSlots]      = useState(Math.max(1, archivos.length))
  const [modalDatos, setModalDatos] = useState(null)
  const MAX_SLOTS = 4

  useEffect(() => {
    if (archivos.length >= slots) {
      setSlots(Math.min(archivos.length + 1, MAX_SLOTS))
    }
  }, [archivos.length])

  function handleArchivoSubido(datos) {
    setModalDatos({ ...datos, carrier: carrier.name })  // ← agregar carrier.name
  }
  function handleConfirmar(mapping) {
    const mappingFinal = {}
    Object.entries(mapping).forEach(([colFinal, info]) => {
      mappingFinal[colFinal] = info.col || ''
    })
    onSubir(carrier.id, {
      filename: modalDatos.filename,
      original: modalDatos.original,
      rows:     0,
      mapping:  mappingFinal,
    })
    setModalDatos(null)
  }

  async function handleCancelar() {
    try {
      await fetch(`${BASE_URL}/api/upload/${modalDatos.filename}`, { method: 'DELETE' })
    } catch { /* ignorar */ }
    setModalDatos(null)
  }

  return (
    <>
      <div style={{
        background:   'var(--bg-surface)',
        border:       `1.5px solid ${archivos.length > 0 ? carrier.color || '#2563EB' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        overflow:     'hidden',
        transition:   'border-color 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          padding:      '10px 14px',
          background:   archivos.length > 0 ? `${carrier.color || '#2563EB'}12` : 'var(--bg-surface2)',
          borderBottom: '1px solid var(--border)',
          display:      'flex', alignItems:'center', gap:'8px',
        }}>
          <div style={{ width:'10px', height:'10px', borderRadius:'50%',
            background: carrier.color || '#2563EB', flexShrink:0 }} />
          <span style={{ fontWeight:700, fontSize:'0.875rem', flex:1 }}>{carrier.name}</span>
          {carrier.isStatic && (
            <span className="badge badge-muted" style={{ fontSize:'0.65rem' }}>estática</span>
          )}
          {archivos.length > 0 && (
            <span className="badge" style={{
              background: `${carrier.color || '#2563EB'}20`,
              color: carrier.color || '#2563EB', fontSize:'0.68rem' }}>
              {archivos.length}
            </span>
          )}
        </div>

        {/* Slots */}
        <div style={{ padding:'10px 12px' }}>
          {Array.from({ length: slots }).map((_, i) => {
            const archivo = archivos[i] || null
            return (
              <FileSlot
                key={archivo ? archivo.filename : `empty-${i}`}
                archivo={archivo}
                carrier={carrier}
                onArchivoSubido={handleArchivoSubido}
                onEliminar={onEliminar}
                disabled={disabled}
                placeholder={`Archivo ${i + 1} — Arrastra o haz click`}
              />
            )
          })}

          {/* Botón + Archivo */}
          {slots < MAX_SLOTS && (
            <button
              onClick={() => setSlots(s => Math.min(s + 1, MAX_SLOTS))}
              disabled={disabled}
              style={{ width:'100%', padding:'6px', background:'none',
                border:'1px dashed var(--border)', borderRadius:'var(--radius-sm)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                color:'var(--text-muted)', fontSize:'0.75rem', marginTop:'4px', transition:'var(--transition)' }}
              onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)' }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-muted)' }}
            >
              + Archivo
            </button>
          )}
        </div>
      </div>

      {/* Modal de validación */}
      {modalDatos && (
        <MappingModal
          datos={modalDatos}
          onConfirmar={handleConfirmar}
          onCancelar={handleCancelar}
        />
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  PÁGINA: Procesar
// ══════════════════════════════════════════════════════════════════════════
function Procesar() {
  const toast = useToast()

  const ramas           = useStore(s => s.ramas)
  const archivosSubidos = useStore(s => s.archivosSubidos)
  const agregarArchivo  = useStore(s => s.agregarArchivo)
  const eliminarArchivo = useStore(s => s.eliminarArchivo)
  const limpiarArchivos = useStore(s => s.limpiarArchivos)
  const jobActual       = useStore(s => s.jobActual)
  const setJobActual    = useStore(s => s.setJobActual)
  const resultado       = useStore(s => s.resultadoProcesamiento)
  const setResultado    = useStore(s => s.setResultadoProcesamiento)
  const setHistorial    = useStore(s => s.setHistorial)

  const [ramaSeleccionada, setRamaSeleccionada] = useState('disnal')
  const [procesando,  setProcesando]  = useState(false)
  const [progreso,    setProgreso]    = useState(0)
  const [mensajeJob,  setMensajeJob]  = useState('')
  const pollingRef = useRef(null)

  // Socket.IO — progreso en tiempo real
  useSocket('job_progress', (data) => {
    if (data.pct !== undefined) setProgreso(data.pct)
    if (data.msg)               setMensajeJob(data.msg)
  })

  // Polling del estado del job
  useEffect(() => {
    if (!jobActual?.job_id || !procesando) return
    pollingRef.current = setInterval(async () => {
      try {
        const status = await getJobStatus(jobActual.job_id)
        setProgreso(status.pct || 0)
        setMensajeJob(status.msg || '')
        if (status.status === 'done') {
          clearInterval(pollingRef.current)
          setProcesando(false)
          setProgreso(100)
          setResultado(status.result)
          setJobActual(null)
          limpiarArchivos()
          // Recargar historial automáticamente
          try {
            const nuevoHistorial = await getHistorial()
            setHistorial(nuevoHistorial)
          } catch { /* ignorar */ }
          toast.success('¡Excel generado correctamente!')
        } else if (status.status === 'error') {
          clearInterval(pollingRef.current)
          setProcesando(false)
          toast.error(`Error: ${status.error}`)
          setJobActual(null)
        }
      } catch { /* ignorar */ }
    }, 1500)
    return () => clearInterval(pollingRef.current)
  }, [jobActual, procesando])

  // Datos de la rama seleccionada
  const ramaActiva     = ramas.find(r => r.id === ramaSeleccionada)
  const carriersRama   = ramaActiva?.carriers_detail || []
  const totalArchivos  = Object.values(archivosSubidos).reduce((acc, arr) => acc + arr.length, 0)

  async function handleProcesar() {
    if (totalArchivos === 0) {
      toast.warning('Sube al menos un archivo Excel antes de procesar')
      return
    }
    const jobs = carriersRama
      .filter(c => (archivosSubidos[c.id]?.length || 0) > 0)
      .map(c => ({
        carrier_id: c.id,
        files:      archivosSubidos[c.id].map(f => f.filename),
      }))

    setProcesando(true)
    setProgreso(0)
    setMensajeJob('Iniciando procesamiento...')
    setResultado(null)
    try {
      const res = await procesarArchivos(ramaSeleccionada, jobs)
      setJobActual(res)
    } catch (e) {
      setProcesando(false)
      toast.error(e.response?.data?.detail || 'Error al iniciar el procesamiento')
    }
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'1px',
        background:'var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden', border:'1px solid var(--border)' }}>
        {[
          { label:'Archivos cargados', valor: totalArchivos },
          { label:'Filas procesadas',  valor: resultado ? Number(resultado.total_rows||0).toLocaleString('es-CO') : '—' },
          { label:'% ON TIME',         valor: resultado?.metricas?.on_time?.pct ? `${resultado.metricas.on_time.pct}%` : '—' },
          { label:'Transportadoras',   valor: carriersRama.length },
        ].map(({ label, valor }) => (
          <div key={label} style={{ padding:'14px 18px', background:'var(--bg-surface)' }}>
            <div style={{ fontSize:'1.6rem', fontWeight:700, color:'var(--accent)', lineHeight:1 }}>{valor}</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'4px', fontWeight:500 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Selector de Rama */}
      <div className="card" style={{ padding:'14px 18px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <span style={{ fontSize:'0.8rem', fontWeight:600, color:'var(--text-secondary)', whiteSpace:'nowrap' }}>Rama</span>
          <select className="form-select" style={{ width:'200px' }}
            value={ramaSeleccionada}
            onChange={e => { setRamaSeleccionada(e.target.value); limpiarArchivos() }}>
            {ramas.map(r => (
              <option key={r.id} value={r.id}>
                {r.id === 'disnal' ? '🏢' : r.id === 'cedi' ? '🏭' : r.id === 'rionegro' ? '🏗' : '📦'} {r.name}
              </option>
            ))}
          </select>
          <span style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>
            {carriersRama.length} transportadora{carriersRama.length !== 1 ? 's' : ''} configurada{carriersRama.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Barra de progreso */}
      {procesando && (
        <div className="card" style={{ padding:'18px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
              <div className="spinner" />
              <span style={{ fontWeight:600 }}>Procesando archivos...</span>
            </div>
            <span style={{ fontWeight:700, color:'var(--accent)', fontSize:'1.1rem' }}>{progreso}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width:`${progreso}%` }} />
          </div>
          {mensajeJob && (
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'8px' }}>{mensajeJob}</div>
          )}
        </div>
      )}

      {/* Resultado */}
      {resultado && !procesando && (
        <div className="card">
          <div className="card-header" style={{ background:'#F0FFF4', borderColor:'#9AE6B4' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              <span style={{ fontSize:'1.2rem' }}>✅</span>
              <div>
                <div style={{ fontWeight:600, color:'#16A34A' }}>Excel generado correctamente</div>
                <div style={{ fontSize:'0.75rem', color:'#16A34A', opacity:0.8 }}>
                  {Number(resultado.total_rows||0).toLocaleString('es-CO')} filas
                  {resultado.total_devoluciones > 0 && ` · ${resultado.total_devoluciones} devoluciones`}
                  {resultado.rama && ` · Rama: ${resultado.rama}`}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:'8px' }}>
              <button className="btn btn-primary btn-sm"
                onClick={() => window.open(`${BASE_URL}/api/download/${resultado.output_file}`, '_blank')}>
                ⬇ Descargar Excel
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setResultado(null)}>✕</button>
            </div>
          </div>

          {/* Reporte de calidad */}
          {resultado.reportes && Object.keys(resultado.reportes).length > 0 && (
            <div className="card-body">
              <div style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:'10px' }}>Reporte de calidad</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                {Object.entries(resultado.reportes).map(([carrier, rep]) => (
                  <div key={carrier} style={{ padding:'10px 14px', background:'var(--bg-surface2)',
                    borderRadius:'var(--radius-md)', border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'6px' }}>
                      <span style={{ fontWeight:600, fontSize:'0.85rem' }}>{carrier}</span>
                      <span className={`badge ${(rep.score||0) >= 80 ? 'badge-success' : (rep.score||0) >= 60 ? 'badge-warning' : 'badge-error'}`}>
                        Score: {rep.score || 0}
                      </span>
                    </div>
                    {(rep.issues || []).map((issue, i) => (
                      <div key={i} style={{ fontSize:'0.75rem', color:'var(--text-secondary)', marginTop:'3px', display:'flex', gap:'5px' }}>
                        <span style={{ color: issue.tipo === 'error' ? '#DC2626' : issue.tipo === 'warning' ? '#CA8A04' : '#2563EB', flexShrink:0 }}>●</span>
                        {issue.mensaje}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {resultado.preview?.length > 0 && (
            <div className="card-body" style={{ borderTop:'1px solid var(--border)' }}>
              <div style={{ fontWeight:600, fontSize:'0.85rem', marginBottom:'10px' }}>
                Vista previa — primeras {Math.min(resultado.preview.length, 10)} filas
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ fontSize:'0.72rem', whiteSpace:'nowrap', width:'100%' }}>
                  <thead>
                    <tr style={{ background:'var(--bg-surface2)' }}>
                      {(resultado.columns||[]).map(col => (
                        <th key={col} style={{ padding:'5px 8px', textAlign:'left', fontWeight:600,
                          color:'var(--text-secondary)', borderBottom:'1px solid var(--border)', fontSize:'0.7rem' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.preview.slice(0,10).map((row, i) => (
                      <tr key={i} style={{ borderTop:'1px solid var(--border)',
                        background: i%2===0 ? 'var(--bg-surface)' : 'var(--bg-surface2)' }}>
                        {(resultado.columns||[]).map(col => (
                          <td key={col} style={{ padding:'5px 8px', color:'var(--text-secondary)' }}>{row[col] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tarjetas de transportadoras */}
      {carriersRama.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">⚙️</div>
            <div className="empty-state-title">Sin transportadoras en {ramaActiva?.name}</div>
            <div className="empty-state-desc">Ve a Configuración para agregar transportadoras a esta rama.</div>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(carriersRama.length,3)},1fr)`, gap:'14px' }}>
          {carriersRama.map(carrier => (
            <CarrierCard
              key={carrier.id}
              carrier={carrier}
              archivos={archivosSubidos[carrier.id] || []}
              onSubir={agregarArchivo}
              onEliminar={eliminarArchivo}
              disabled={procesando}
            />
          ))}
        </div>
      )}

      {/* Botones principales */}
      {carriersRama.length > 0 && (
        <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
          <button className="btn btn-primary btn-lg" onClick={handleProcesar}
            disabled={totalArchivos === 0 || procesando} style={{ minWidth:'240px' }}>
            {procesando
              ? <><div className="spinner" style={{ width:'16px', height:'16px' }} /> Procesando...</>
              : <> Generar Excel Unificado</>}
          </button>
          <button className="btn btn-secondary" onClick={limpiarArchivos}
            disabled={totalArchivos === 0 || procesando}>
            🗑 Limpiar todo
          </button>
          {totalArchivos > 0 && (
            <span style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
              {totalArchivos} archivo{totalArchivos > 1 ? 's' : ''} listo{totalArchivos > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

    </div>
  )
}

export default Procesar