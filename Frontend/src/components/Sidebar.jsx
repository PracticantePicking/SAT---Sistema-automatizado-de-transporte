import { NavLink } from 'react-router-dom'
import { LayoutDashboard, RotateCcw, Upload, History } from 'lucide-react'

const links = [
  { to: '/',            label: 'Dashboard',    icon: LayoutDashboard },
  { to: '/devoluciones',label: 'Devoluciones', icon: RotateCcw       },
  { to: '/procesar',    label: 'Procesar',     icon: Upload           },
  { to: '/historial',   label: 'Historial',    icon: History          },
]

export default function Sidebar() {
  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '24px 20px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700,
          }}>D</div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>SAT Devoluciones</div>
            <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>Prebel S.A.</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        fontSize: '0.7rem',
        color: 'rgba(255,255,255,0.2)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        v1.0 · Backend :5000
      </div>
    </aside>
  )
}
