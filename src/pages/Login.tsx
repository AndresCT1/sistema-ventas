import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/')
    })
  }, [navigate])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('Email o contraseña incorrectos')
    else navigate('/')
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #FF6B00 100%)' }}
    >
      {/* Branding */}
      <div className="text-center mb-8 animate-fade-in">
        <h1 className="text-5xl font-extrabold text-white tracking-tight drop-shadow-md">
          VENDAMOS
        </h1>
        <p className="text-white/80 text-sm mt-2 font-medium">Sistema de gestión WOW Perú</p>
      </div>

      {/* Card */}
      <div
        className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 animate-fade-in"
        style={{ animationDelay: '0.1s' }}
      >
        <h2 className="text-lg font-bold text-[#1A1A2E] mb-6 text-center">Iniciar sesión</h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent transition-all duration-200"
              placeholder="tu@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00] focus:border-transparent transition-all duration-200"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full text-white font-bold py-3 rounded-lg text-sm transition-all duration-200 disabled:opacity-60 active:scale-[0.98] mt-2"
            style={{ background: loading ? '#ccc' : '#FF6B00' }}
            onMouseEnter={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#E05A00' }}
            onMouseLeave={e => { if (!loading) (e.target as HTMLButtonElement).style.background = '#FF6B00' }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>

      <p className="text-white/50 text-xs mt-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
        WOW Perú © {new Date().getFullYear()}
      </p>
    </div>
  )
}
