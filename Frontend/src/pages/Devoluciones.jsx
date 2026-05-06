import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Search, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import { getDevoluciones, buildDownloadUrl } from '../api/index'

function useDebounce(value, delay = 400) {
  const [deb, setDeb] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDeb(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return deb
}

export default function Devoluciones() {
  const [data,     setData]     = useState([])
  const [columnas, setColumnas] = useState([])
  const [total,    setTotal]    = useState(0)
  const [pages,    setPages]    = useState(1)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(false)

  const [carrier,  setCarrier]  = useState('')
  const [estado,   setEstado]   = useState('')
  const [busqueda, setBusqueda] = useState('')

  const debCarrier  = useDebounce(carrier)
  const debEstado   = useDebounce(estado)
  const debBusqueda = useDebounce(busqueda)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getDevoluciones({
        page,
        limit: 50,
        carrier:  debCarrier,
        estado:   debEstado,
        busqueda: debBusqueda,
      })
      setData(res.data)
      setColumnas(res.columnas || [])
      setTotal(res.total)
      setPages(res.pages)
    } catch (_) {}
    finally { setLoading(false) }
  }, [page, debCarrier, debEstado, debBusqueda])

  useEffect(() => { setPage(1) }, [debCarrier, debEstado, debBusqueda])
  useEffect(() => { fetchData() }, [fetchData])

  const downloadUrl = buildDownloadUrl({ carrier: debCarrier, estado: debEstado, busqueda: debBusqueda })

  const pageNums = () => {
    const nums = []
    const start = Math.max(1, page - 2)
    const end   = Math.min(pages, page + 2)
    for (let i = start; i <= end; i++) nums.push(i)
    return nums
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>Devoluciones</h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          {total.toLocaleString('es-CO')} registros encontrados
        </p>
      </motion.div>

      {/* Filtros */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}
      >
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            className="input" style={{ paddingLeft: 30, width: '100%' }}
            placeholder="Buscar en todos los campos..."
            value={busqueda} onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <input
          className="input" style={{ flex: '0 0 160px' }}
          placeholder="Transportadora..."
          value={carrier} onChange={e => setCarrier(e.target.value)}
        />
        <input
          className="input" style={{ flex: '0 0 160px' }}
          placeholder="Estado..."
          value={estado} onChange={e => setEstado(e.target.value)}
        />
        <a href={downloadUrl} download className="btn btn-secondary" style={{ textDecoration: 'none' }}>
          <Download size={14} /> Exportar
        </a>
      </motion.div>

      {/* Tabla */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="table-wrapper"
        style={{ marginBottom: 16 }}
      >
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
            Cargando...
          </div>
        ) : data.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>
            {total === 0 ? 'Sin datos — carga un archivo en Procesar' : 'No se encontraron resultados'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {columnas.map(col => <th key={col}>{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i}>
                  {columnas.map(col => (
                    <td key={col} title={String(row[col] ?? '')}>
                      {row[col] != null ? String(row[col]) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </motion.div>

      {/* Paginación */}
      {pages > 1 && (
        <div className="pagination">
          <button className="page-btn" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}>
            <ChevronLeft size={14} />
          </button>
          {pageNums().map(n => (
            <button key={n} className={`page-btn${n===page?' active':''}`} onClick={() => setPage(n)}>
              {n}
            </button>
          ))}
          <button className="page-btn" onClick={() => setPage(p => Math.min(pages, p+1))} disabled={page===pages}>
            <ChevronRight size={14} />
          </button>
          <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>
            Página {page} de {pages}
          </span>
        </div>
      )}
    </div>
  )
}
