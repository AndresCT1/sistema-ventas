import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function Layout() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-violet-800 text-white px-4 py-3 flex items-center justify-between shadow-md sticky top-0 z-10">
        <div>
          <h1 className="text-base font-bold leading-tight">WOW TEL</h1>
          {profile && <p className="text-xs text-violet-200">{profile.full_name} · {profile.role}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/perfil')}
            className="text-violet-200 hover:text-white p-1.5 rounded-lg transition-colors"
            title="Mi perfil"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </button>
          <button
            onClick={handleLogout}
            className="text-xs bg-violet-900 hover:bg-violet-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      {/* Bottom nav — 4 tabs */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex shadow-lg">
        <NavLink to="/" end className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${isActive ? 'text-violet-700 font-semibold' : 'text-slate-500'}`}>
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
          Inicio
        </NavLink>
        <NavLink to="/referidos" className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${isActive ? 'text-violet-700 font-semibold' : 'text-slate-500'}`}>
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Referidos
        </NavLink>
        <NavLink to="/ventas" className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${isActive ? 'text-violet-700 font-semibold' : 'text-slate-500'}`}>
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
          </svg>
          Ventas
        </NavLink>
        <NavLink to="/comisiones" className={({ isActive }) =>
          `flex-1 flex flex-col items-center py-2 text-xs transition-colors ${isActive ? 'text-violet-700 font-semibold' : 'text-slate-500'}`}>
          <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Comisiones
        </NavLink>
      </nav>
    </div>
  )
}
