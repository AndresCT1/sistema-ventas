import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePushNotifications } from '../hooks/usePushNotifications'
import { supabase } from '../lib/supabase'

const DISMISSED_KEY = 'push_notif_dismissed'

export default function Layout() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const { isSupported, isSubscribed, permission, loading, subscribe } = usePushNotifications()
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    if (
      !loading && isSupported &&
      permission !== 'granted' && permission !== 'denied' &&
      !isSubscribed && !localStorage.getItem(DISMISSED_KEY)
    ) setShowBanner(true)
    else setShowBanner(false)
  }, [loading, isSupported, permission, isSubscribed])

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  async function handleAllowNotifications() {
    setShowBanner(false)
    await subscribe()
  }

  function handleDismissBanner() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShowBanner(false)
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F8F7FF' }}>

      {/* Header — degradado naranja → morado */}
      <header
        className="text-white px-4 py-3 flex items-center justify-between sticky top-0 z-10"
        style={{
          background: 'linear-gradient(to right, #FF6B00, #7C3AED)',
          boxShadow: '0 2px 12px rgba(124,58,237,0.2)',
        }}
      >
        <h1 className="text-xl font-extrabold tracking-tight text-white">VENDAMOS</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/perfil')}
            className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg transition-all duration-200"
          >
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {profile && <span className="text-xs font-medium text-white truncate max-w-[80px]">{profile.full_name.split(' ')[0]}</span>}
          </button>
          <button
            onClick={handleLogout}
            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-all duration-200 text-white font-medium"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Banner notificaciones */}
      {showBanner && (
        <div className="shrink-0 px-4 py-3 flex items-start gap-3" style={{ background: '#FF6B00' }}>
          <svg className="w-4 h-4 text-white shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">¿Activar notificaciones para recordatorios de llamadas?</p>
            <div className="flex gap-2 mt-1.5">
              <button onClick={handleAllowNotifications} className="text-xs bg-white text-[#FF6B00] font-bold px-3 py-1.5 rounded-lg">Permitir</button>
              <button onClick={handleDismissBanner}      className="text-xs text-white/80 hover:text-white px-3 py-1.5">Ahora no</button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white flex"
        style={{ borderTop: '2px solid #FF6B00', boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }}
      >
        {[
          { to: '/',          label: 'Inicio',     icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', end: true },
          { to: '/referidos', label: 'Referidos',  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
          { to: '/ventas',    label: 'Ventas',     icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
          { to: '/comisiones',label: 'Comisiones', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { to: '/pagos',     label: 'Pagos',      icon: 'M9 14l2 2 4-4m5 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        ].map(({ to, label, icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-[10px] font-medium transition-colors duration-200 ${
                isActive ? 'text-[#FF6B00]' : 'text-slate-400'
              }`
            }
          >
            <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
            </svg>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
