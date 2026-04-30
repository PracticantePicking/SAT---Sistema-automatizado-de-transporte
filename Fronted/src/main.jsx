import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── ¿Qué hace esto? ───────────────────────────────────────────────────────
// createRoot toma el div#root del index.html
// y monta toda la app React dentro de él
//
// StrictMode activa advertencias extra en desarrollo
// No afecta la app en producción — solo ayuda a detectar problemas
// ─────────────────────────────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)