import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

// ── URL del backend ────────────────────────────────────────────────────────
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000'

// ── INSTANCIA ÚNICA DE SOCKET ──────────────────────────────────────────────
// Creamos el socket FUERA del hook para que sea una sola conexión
// compartida por toda la app.
//
// Si lo creáramos dentro del hook, cada componente que use useSocket
// abriría una conexión nueva — muy ineficiente.
//
// autoConnect: false → nos conectamos manualmente cuando sea necesario
let socket = null

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection:        true,   // reconectar si se cae
      reconnectionAttempts: 5,     // máximo 5 intentos
      reconnectionDelay:   2000,   // esperar 2s entre intentos
    })
  }
  return socket
}

//  HOOK: useSocket
//
//  Uso básico:
//  const { connected } = useSocket()
//
//  Uso con evento:
//  useSocket('job_progress', (data) => {
//    console.log('Progreso:', data.pct)
//  })
//
//  Parámetros:
//    event    → nombre del evento Socket.IO a escuchar (opcional)
//    callback → función que se ejecuta cuando llega el evento (opcional)
// ══════════════════════════════════════════════════════════════════════════
export function useSocket(event, callback) {
  // useRef guarda el callback sin causar re-renders
  // Si usáramos useState, cada vez que cambia el callback
  // el componente se volvería a renderizar innecesariamente
  const callbackRef = useRef(callback)

  // Actualizar la referencia cuando cambia el callback
  // sin desconectar/reconectar el socket
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    const s = getSocket()

    // Conectar si no está conectado todavía
    if (!s.connected) {
      s.connect()
    }

    // Si se especificó un evento, registrar el listener
    if (event) {
      // Wrapper que llama al callback actual (no al del closure inicial)
      const handler = (data) => {
        if (callbackRef.current) {
          callbackRef.current(data)
        }
      }

      s.on(event, handler)

      // CLEANUP — esto es muy importante en React:
      // Cuando el componente se desmonta (sale de pantalla)
      // hay que quitar el listener para evitar memory leaks
      // (funciones que siguen corriendo aunque el componente no exista)
      return () => {
        s.off(event, handler)
      }
    }
  }, [event]) // solo re-ejecuta si cambia el nombre del evento
}

// ══════════════════════════════════════════════════════════════════════════
//  HOOK: useSocketStatus
//
//  Retorna si el socket está conectado o no
//  Útil para mostrar el punto verde/rojo en el sidebar
//
//  Uso:
//  const connected = useSocketStatus()
// ══════════════════════════════════════════════════════════════════════════
export function useSocketStatus() {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const s = getSocket()

    if (!s.connected) s.connect()

    const onConnect    = () => setConnected(true)
    const onDisconnect = () => setConnected(false)

    s.on('connect',    onConnect)
    s.on('disconnect', onDisconnect)

    setConnected(s.connected)

    return () => {
      s.off('connect',    onConnect)
      s.off('disconnect', onDisconnect)
    }
  }, [])

  return connected
}

// ══════════════════════════════════════════════════════════════════════════
//  UTILIDAD: emitSocket
//
//  Para enviar eventos al servidor desde cualquier parte de la app
//  sin necesidad de estar dentro de un componente React
//
//  Uso:
//  emitSocket('join_room', { room: 'job_123' })
// ══════════════════════════════════════════════════════════════════════════
export function emitSocket(event, data) {
  const s = getSocket()
  if (s.connected) {
    s.emit(event, data)
  } else {
    console.warn(`Socket no conectado. No se pudo emitir: ${event}`)
  }
}

export default getSocket