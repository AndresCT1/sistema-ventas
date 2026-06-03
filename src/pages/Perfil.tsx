import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePushNotifications } from '../hooks/usePushNotifications'

const ANTICIPACION_OPTS = [
  { value: 30,  label: '30 minutos antes' },
  { value: 60,  label: '1 hora antes' },
  { value: 120, label: '2 horas antes' },
]

export default function Perfil() {
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const { isSupported, isSubscribed, permission, subscribe, unsubscribe } = usePushNotifications()

  const [form, setForm] = useState({
    full_name: '',
    fecha_ingreso_wow: '',
    anticipacion_notif: 60,
  })
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [subLoading, setSubLoading] = useState(false)

  useEffect(() => {
    if (profile) {
      setForm({
        full_name:          profile.full_name,
        fecha_ingreso_wow:  profile.fecha_ingreso_wow ?? '',
        anticipacion_notif: profile.anticipacion_notif ?? 60,
      })
    }
  }, [profile])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    await supabase.from('profiles').update({
      full_name:          form.full_name,
      fecha_ingreso_wow:  form.fecha_ingreso_wow || null,
      anticipacion_notif: form.anticipacion_notif,
    }).eq('id', profile.id)
    await refreshProfile()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  async function handleToggleNotif() {
    setSubLoading(true)
    if (isSubscribed) {
      await unsubscribe()
    } else {
      await subscribe()
    }
    setSubLoading(false)
  }

  if (!profile) return null

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)}
          className="text-violet-700 hover:text-violet-900 flex items-center gap-1 text-sm font-medium">
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
          <input type="email" value={profile.email} disabled
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-400" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
          <input required type="text" value={form.full_name}
            onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Fecha de ingreso a WOW
            {!profile.fecha_ingreso_wow && (
              <span className="ml-2 text-xs text-amber-600 font-normal">⚠ Pendiente</span>
            )}
          </label>
          <input type="date" value={form.fecha_ingreso_wow}
            onChange={e => setForm(f => ({ ...f, fecha_ingreso_wow: e.target.value }))}
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
          <p className="text-xs text-slate-400 mt-1">
            Define si aplica el esquema de nuevo promotor en comisiones.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
          <input type="text" value={profile.role === 'admin' ? 'Administrador' : 'Vendedor'} disabled
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-400" />
        </div>

        {/* Anticipación de notificaciones */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Anticipación de notificaciones
          </label>
          <div className="grid grid-cols-3 gap-2">
            {ANTICIPACION_OPTS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, anticipacion_notif: opt.value }))}
                className={`py-2.5 px-2 rounded-xl text-xs font-semibold border transition-all ${
                  form.anticipacion_notif === opt.value
                    ? 'bg-violet-700 text-white border-violet-700'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-violet-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Recibirás la notificación antes de la hora programada de llamada.
          </p>
        </div>

        {saved && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700 font-medium">
            Perfil actualizado correctamente
          </div>
        )}

        <button type="submit" disabled={saving}
          className="w-full bg-violet-700 hover:bg-violet-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      {/* Sección de notificaciones */}
      {isSupported && (
        <div className="mt-6 border-t border-slate-200 pt-6">
          <h3 className="text-sm font-semibold text-slate-800 mb-3">Notificaciones push</h3>

          {permission === 'denied' ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              Las notificaciones están bloqueadas en este dispositivo.
              Actívalas desde la configuración del navegador.
            </div>
          ) : (
            <div className={`rounded-xl p-4 border flex items-start gap-3 ${
              isSubscribed ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                isSubscribed ? 'bg-green-100' : 'bg-slate-200'
              }`}>
                <svg className={`w-4 h-4 ${isSubscribed ? 'text-green-600' : 'text-slate-500'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">
                  {isSubscribed ? 'Notificaciones activas' : 'Notificaciones desactivadas'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isSubscribed
                    ? 'Recibirás recordatorios de llamadas y contratos por vencer.'
                    : 'Actívalas para recibir recordatorios en este dispositivo.'}
                </p>
                <button onClick={handleToggleNotif} disabled={subLoading}
                  className={`mt-2.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                    isSubscribed
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-violet-700 text-white hover:bg-violet-800'
                  }`}>
                  {subLoading ? '...' : isSubscribed ? 'Desactivar' : 'Activar notificaciones'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
