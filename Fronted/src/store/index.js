import { create } from 'zustand'

// ── ¿QUÉ ES create()? ─────────────────────────────────────────────────────
// create() recibe una función que retorna un objeto con:
//   - Estado: los datos (carriers, ramas, historial...)
//   - Acciones: funciones para modificar el estado (set...)
//
// set() es la función de Zustand para actualizar el estado
// Siempre recibe el estado anterior y retorna el nuevo
// ─────────────────────────────────────────────────────────────────────────

const useStore = create((set, get) => ({

  // ══════════════════════════════════════════════════════════════════════
  //  CARRIERS Y RAMAS
  //  Se cargan al iniciar la app y se comparten en toda la aplicación
  // ══════════════════════════════════════════════════════════════════════

  carriers: [],   // lista completa de transportadoras del sistema
  ramas: [],      // lista de ramas con sus carriers expandidos

  setCarriers: (carriers) => set({ carriers }),
  setRamas:    (ramas)    => set({ ramas }),

  // Busca una transportadora por su ID sin ir al backend
  // Útil cuando necesitas el nombre o color de un carrier
  getCarrierById: (id) => {
    const { carriers } = get()
    return carriers.find(c => c.id === id) || null
  },

  // Busca una rama por su ID
  getRamaById: (id) => {
    const { ramas } = get()
    return ramas.find(r => r.id === id) || null
  },

  // ══════════════════════════════════════════════════════════════════════
  //  PROCESAR
  //  Estado del módulo de procesamiento de archivos
  // ══════════════════════════════════════════════════════════════════════

  // Rama seleccionada actualmente en la pestaña Procesar
  // Por defecto DISNAL porque es la que tiene carriers configurados
  ramaSeleccionada: 'disnal',
  setRamaSeleccionada: (id) => set({ ramaSeleccionada: id }),

  // Archivos subidos por carrier — estructura:
  // { "carrier_abc": [{ filename: "...", original: "...", rows: 0 }] }
  archivosSubidos: {},

  // Agrega un archivo a la lista de un carrier específico
  agregarArchivo: (carrierId, archivo) =>
    set(state => ({
      archivosSubidos: {
        ...state.archivosSubidos,
        [carrierId]: [
          ...(state.archivosSubidos[carrierId] || []),
          archivo
        ]
      }
    })),

  // Elimina un archivo específico de un carrier
  eliminarArchivo: (carrierId, filename) =>
    set(state => ({
      archivosSubidos: {
        ...state.archivosSubidos,
        [carrierId]: (state.archivosSubidos[carrierId] || [])
          .filter(f => f.filename !== filename)
      }
    })),

  // Limpia todos los archivos (después de procesar o al cambiar de rama)
  limpiarArchivos: () => set({ archivosSubidos: {} }),

  // Estado del job de procesamiento en curso
  // null = sin job activo
  jobActual: null,
  setJobActual: (job) => set({ jobActual: job }),

  // Resultado del último procesamiento exitoso
  resultadoProcesamiento: null,
  setResultadoProcesamiento: (res) => set({ resultadoProcesamiento: res }),

  // ══════════════════════════════════════════════════════════════════════
  //  HISTORIAL
  //  Lista de todos los procesamientos guardados en la base de datos
  // ══════════════════════════════════════════════════════════════════════

  historial: [],
  setHistorial: (historial) => set({ historial }),

  // Elimina un registro del historial localmente
  // (después de que el backend confirme la eliminación)
  eliminarDeHistorial: (id) =>
    set(state => ({
      historial: state.historial.filter(h => h.id !== id)
    })),

  // ══════════════════════════════════════════════════════════════════════
  //  DASHBOARD / INDICADORES
  //  Estado de los filtros y datos del dashboard
  // ══════════════════════════════════════════════════════════════════════

  // Filtros activos del dashboard
  // Cuando el usuario cambia un filtro se actualiza aquí
  // y el componente Indicadores hace una nueva llamada a la API
  filtrosDashboard: {
    historial_id:     null,
    rama:             '',
    transportador:    '',
    ciudad_destino:   '',
    mes:              '',
    estado:           '',
    numero_documento: '',
    destinatario:     '',
  },

  // Actualiza un filtro específico sin tocar los demás
  // Uso: setFiltro('transportador', 'Solistica')
  setFiltro: (key, value) =>
    set(state => ({
      filtrosDashboard: {
        ...state.filtrosDashboard,
        [key]: value
      }
    })),

  // Limpia todos los filtros y vuelve al estado inicial
  limpiarFiltros: () =>
    set({
      filtrosDashboard: {
        historial_id:     null,
        rama:             '',
        transportador:    '',
        ciudad_destino:   '',
        mes:              '',
        estado:           '',
        numero_documento: '',
        destinatario:     '',
      }
    }),

  // Datos del dashboard cargados desde la API
  dashboardData: null,
  setDashboardData: (data) => set({ dashboardData: data }),

// ══════════════════════════════════════════════════════════════════════
  //  UI GLOBAL
  //  Estado de la interfaz que afecta a toda la app
  // ══════════════════════════════════════════════════════════════════════

  // Página activa — controla qué resalta en el sidebar
  paginaActiva: 'procesar',
  setPaginaActiva: (pagina) => set({ paginaActiva: pagina }),

  // Sistema de notificaciones (toasts)
  // Cada toast: { id, tipo: 'success'|'error'|'warning'|'info', mensaje }
  toasts: [],

  // Agrega una notificación y la elimina automáticamente después de 4s
  addToast: (tipo, mensaje) => {
    const id = Date.now()
    set(state => ({
      toasts: [...state.toasts, { id, tipo, mensaje }]
    }))
    // Auto-eliminar después de 4 segundos
    setTimeout(() => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id)
      }))
    }, 4000)
  },

  removeToast: (id) =>
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id)
    })),

  // Estado de carga global — muestra spinner en el topbar
  loading: false,
  setLoading: (loading) => set({ loading }),

}))

export default useStore