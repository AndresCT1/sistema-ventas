import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function Perfil() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name: '', fecha_ingreso_wow: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name,
        fecha_ingreso_wow: profile.fecha_ingreso_wow ?? '',
      })
    }
  }, [profile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles').update({
      full_name: form.full_name,
      fecha_ingreso_wow: form.fecha_ingreso_wow || null,
    }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (!profile) return null

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="text-violet-700 hover:text-violet-900 flex items-center gap-1 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Volver
        </button>
        <h2 className="text-lg font-bold text-slate-800">Mi perfil</h2>
      </div>

      {/* Avatar */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-violet-700 flex items-center justify-center shadow-md">
          <span className="text-3xl font-bold text-white">
            {profile.full_name.charAt(0).toUpperCase()}
          </span>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input
            type="email"
            value={profile.email}
            disabled
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
          <input
            required
            type="text"
            value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Fecha de ingreso a WOW
            {!profile.fecha_ingreso_wow && (
              <span className="ml-2 text-xs text-amber-600 font-normal">⚠ Pendiente</span>
            )}
          </label>
          <input
            type="date"
            value={form.fecha_ingreso_wow}
            onChange={e => setForm(f => ({ ...f, fecha_ingreso_wow: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
          <p className="text-xs text-slate-400 mt-1">
            Define si aplica el esquema de nuevo promotor (Mes 0 / Mes 1) en el cálculo de comisiones.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
          <input
            type="text"
            value={profile.role === 'admin' ? 'Administrador' : 'Vendedor'}
            disabled
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-400"
          />
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
            Perfil actualizado correctamente
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-violet-700 hover:bg-violet-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
        >
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  )
}
