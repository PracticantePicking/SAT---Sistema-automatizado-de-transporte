import { Component } from 'react'

// Evita que un error de renderizado (p.ej. mutaciones de DOM ajenas a React,
// como la traducción automática del navegador) deje toda la pantalla en blanco.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary capturó un error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          background: '#FFF5F5', border: '1px solid #FEB2B2', borderRadius: '10px',
          padding: '16px 20px', margin: '16px 0', fontSize: '0.85rem', color: '#742A2A',
        }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>⚠️ Ocurrió un error al mostrar esta sección</div>
          <div style={{ marginBottom: '10px' }}>
            Si tu navegador tiene activa la traducción automática de la página, desactívala e intenta de nuevo.
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              background: '#C53030', color: '#fff', border: 'none', borderRadius: '6px',
              padding: '6px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
            }}>
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
