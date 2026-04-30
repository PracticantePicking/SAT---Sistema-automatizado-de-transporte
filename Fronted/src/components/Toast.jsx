import { useEffect } from 'react'
import useStore from '../store/index'

//  ICONOS POR TIPO 
// Mapeamos cada tipo de toast a un ícono y un estilo CSS
const TIPOS = {
  success: { icono: '✓', clase: 'toast-success' },
  error:   { icono: '✕', clase: 'toast-error'   },
  warning: { icono: '!', clase: 'toast-warning'  },
  info:    { icono: 'i', clase: 'toast-info'     },
}

//  COMPONENTE: ToastItem
//  Renderiza UN toast individual
//
//  Props:
//    toast  → { id, tipo, mensaje }
function ToastItem({ toast }) {
  // Leemos la función removeToast del store global
  // para poder cerrar el toast al hacer clic en la X
  const removeToast = useStore(state => state.removeToast)

  const { icono, clase } = TIPOS[toast.tipo] || TIPOS.info

  return (
    <div className={`toast ${clase}`}>

      {/* Ícono del tipo */}
      <span style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.7rem',
        fontWeight: '700',
        flexShrink: 0,
        background: 'currentColor',
        color: 'white',
      }}>
        {icono}
      </span>

      {/* Mensaje */}
      <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
        {toast.mensaje}
      </span>

      {/* Botón cerrar */}
      <button
        onClick={() => removeToast(toast.id)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '1rem',
          padding: '0 2px',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
//  COMPONENTE: ToastContainer
//  Renderiza TODOS los toasts activos en la esquina inferior derecha
//  Este es el componente que se monta en App.jsx una sola vez
// ══════════════════════════════════════════════════════════════════════════
function ToastContainer() {
  // Leemos la lista de toasts del store
  // Cada vez que se agrega o elimina un toast,
  // este componente se re-renderiza automáticamente
  const toasts = useStore(state => state.toasts)

  // Si no hay toasts no renderizamos nada
  if (toasts.length === 0) return null

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        // key es obligatorio en listas React
        // Le dice a React qué elemento cambió para actualizar solo ese
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

export default ToastContainer

// ══════════════════════════════════════════════════════════════════════════
//  HOOK DE CONVENIENCIA: useToast
//
//  En lugar de importar useStore en cada componente y escribir:
//    const addToast = useStore(state => state.addToast)
//    addToast('success', 'Guardado')
//
//  Con este hook escribes:
//    const toast = useToast()
//    toast.success('Guardado')
//    toast.error('Error al guardar')
// ══════════════════════════════════════════════════════════════════════════
export function useToast() {
  const addToast = useStore(state => state.addToast)

  return {
    success: (msg) => addToast('success', msg),
    error:   (msg) => addToast('error',   msg),
    warning: (msg) => addToast('warning', msg),
    info:    (msg) => addToast('info',    msg),
  }
}