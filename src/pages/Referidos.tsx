import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { validateTelefono, validateFechaLlamada } from '../lib/validaciones'
import type { Referido } from '../types'

const ESTADOS = ['pendiente', 'llamado', 'convertido'] as const
type Estado = typeof ESTADOS[number]

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente:  'Pendiente',
  llamado:    'Llamado',
  convertido: 'Convertido',
}

const ESTADO_STYLE: Record<Estado, { bg: string; text: string; border: string }> = {
  pendiente:  { bg: '#FFF3EA', text: '#FF6B00', border: '#FFD0AA' },
  llamado:    { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  convertido: { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const emptyForm = {
  nombre: '', telefono: '', fecha_llamada: '',
  hora_llamada: '', notas: '', estado: 'pendiente' as Estado,
}

type FormErrors = { telefono: string; fecha_llamada: string }
type Touched    = { telefono: boolean; fecha_llamada: boolean }

function getErrors(form: typeof emptyForm): FormErrors {
  return {
    telefono:      validateTelefono(form.telefono),
    fecha_llamada: validateFechaLlamada(form.fecha_llamada),
  }
}

// ── Helpers de estilo ─────────────────────────────────────────────────────────

function inputCls(field: keyof Touched, touched: Touched, errors: FormErrors): string {
  const base = 'w-full rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none transition-all'
  if (!touched[field]) return `${base} border border-slate-200 focus:ring-2 focus:ring-[#FF6B00]`
  if (errors[field])   return `${base} border-2 border-red-500 focus:ring-2 focus:ring-red-100`
  return `${base} border-2 border-green-500 focus:ring-2 focus:ring-green-100`
}

function FieldError({ msg }: { msg: string }) {
  return msg ? <p className="text-xs text-red-500 mt-1">⚠ {msg}</p> : null
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Referidos() {
  const { profile } = useAuth()
  const [referidos, setReferidos] = useState<Referido[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Referido | null>(null)
  const [form, setForm]           = useState(emptyForm)
  const [saving, setSaving]       = useState(false)
  const [filterEstado, setFilter] = useState<Estado | 'todos'>('todos')
  const [search, setSearch]       = useState('')
  const [errors, setErrors]       = useState<FormErrors>({ telefono: '', fecha_llamada: '' })
  const [touched, setTouched]     = useState<Touched>({ telefono: false, fecha_llamada: false })

  useEffect(() => { if (profile) loadReferidos() }, [profile])

  async function loadReferidos() {
    setLoading(true)
    const query = supabase.from('referidos').select('*').order('fecha_llamada', { ascending: true })
    if (profile?.role !== 'admin') query.eq('vendedor_id', profile!.id)
    const { data } = await query
    setReferidos(data ?? [])
    setLoading(false)
  }

  function resetModal() {
    setErrors({ telefono: '', fecha_llamada: '' })
    setTouched({ telefono: false, fecha_llamada: false })
  }

  function openNew() {
    setEditing(null); setForm(emptyForm); resetModal(); setShowModal(true)
  }
  function openEdit(r: Referido) {
    setEditing(r)
    setForm({ nombre: r.nombre, telefono: r.telefono, fecha_llamada: r.fecha_llamada, hora_llamada: r.hora_llamada ?? '', notas: r.notas ?? '', estado: r.estado })
    resetModal(); setShowModal(true)
  }

  function handleChange(field: keyof FormErrors, value: string) {
    const updated = { ...form, [field]: value }
    setForm(f => ({ ...f, [field]: value }))
    if (touched[field]) setErrors(e => ({ ...e, [field]: getErrors(updated as typeof emptyForm)[field] }))
  }

  function handleBlur(field: keyof FormErrors) {
    setTouched(t => ({ ...t, [field]: true }))
    setErrors(e => ({ ...e, [field]: getErrors(form)[field] }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); if (!profile) return
    // Tocar todos los campos y validar
    setTouched({ telefono: true, fecha_llamada: true })
    const errs = getErrors(form)
    setErrors(errs)
    if (Object.values(errs).some(v => v !== '')) return

    setSaving(true)
    const payload = { nombre: form.nombre, telefono: form.telefono, fecha_llamada: form.fecha_llamada, hora_llamada: form.hora_llamada || null, notas: form.notas || null, estado: form.estado }
    if (editing) await supabase.from('referidos').update(payload).eq('id', editing.id)
    else         await supabase.from('referidos').insert({ ...payload, vendedor_id: profile.id })
    setSaving(false); setShowModal(false); loadReferidos()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este referido?')) return
    await supabase.from('referidos').delete().eq('id', id); loadReferidos()
  }

  async function cambiarEstado(r: Referido, estado: Estado) {
    await supabase.from('referidos').update({ estado }).eq('id', r.id); loadReferidos()
  }

  const allErrors = getErrors(form)
  const canSave   = !saving && Object.values(allErrors).every(v => v === '') && !!form.nombre && !!form.fecha_llamada

  const filtered = referidos.filter(r => {
    const matchE = filterEstado === 'todos' || r.estado === filterEstado
    const matchS = r.nombre.toLowerCase().includes(search.toLowerCase()) || r.telefono.includes(search)
    return matchE && matchS
  })

  return (
    <div className="px-4 py-5 max-w-lg mx-auto pb-24">
      <div className="mb-4">
        <h2 className="text-xl font-extrabold text-[#1A1A2E] border-b-2 border-[#FF6B00] pb-1 inline-block">Referidos</h2>
      </div>

      <div className="space-y-2 mb-4">
        <input type="text" placeholder="Buscar por nombre o teléfono..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['todos', ...ESTADOS] as const).map(e => (
            <button key={e} onClick={() => setFilter(e)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full font-semibold border transition-all duration-200"
              style={filterEstado === e
                ? { background: '#FF6B00', color: '#fff', borderColor: '#FF6B00' }
                : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
              {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No hay referidos</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => {
            const st = ESTADO_STYLE[r.estado]
            return (
              <div key={r.id} className="bg-white rounded-xl p-4 transition-all duration-200"
                style={{ borderLeft: '4px solid #FF6B00', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1A1A2E] truncate">{r.nombre}</p>
                    <p className="text-sm text-slate-500">{r.telefono}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {formatDate(r.fecha_llamada)}
                      {r.hora_llamada && <span className="ml-1.5 font-semibold" style={{ color: '#FF6B00' }}>· {r.hora_llamada.substring(0, 5)}</span>}
                    </p>
                    {r.notas && <p className="text-xs text-slate-400 italic mt-1 line-clamp-2">{r.notas}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border"
                    style={{ background: st.bg, color: st.text, borderColor: st.border }}>
                    {ESTADO_LABEL[r.estado]}
                  </span>
                </div>
                <div className="flex gap-2 mt-3 flex-wrap">
                  {ESTADOS.filter(e => e !== r.estado).map(e => (
                    <button key={e} onClick={() => cambiarEstado(r, e)}
                      className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all duration-200"
                      style={{ background: '#F8F7FF', color: '#64748B' }}>
                      → {ESTADO_LABEL[e]}
                    </button>
                  ))}
                  <button onClick={() => openEdit(r)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium ml-auto"
                    style={{ background: '#F3F0FF', color: '#7C3AED' }}>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(r.id)}
                    className="text-xs px-2.5 py-1 rounded-lg font-medium"
                    style={{ background: '#FFF5F5', color: '#EF4444' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* FAB */}
      <button onClick={openNew}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full text-white font-bold text-2xl flex items-center justify-center transition-all duration-200 active:scale-95"
        style={{ background: '#FF6B00', boxShadow: '0 4px 20px rgba(255,107,0,0.45)' }}>
        +
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-[#1A1A2E]">{editing ? 'Editar referido' : 'Nuevo referido'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              {/* Nombre */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Nombre completo *</label>
                <input required type="text" value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all"
                  placeholder="Juan Pérez" />
              </div>

              {/* Teléfono con validación */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Teléfono *</label>
                <input type="tel" value={form.telefono} maxLength={9}
                  onChange={e => handleChange('telefono', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => handleBlur('telefono')}
                  className={inputCls('telefono', touched, errors)}
                  placeholder="987654321" />
                <FieldError msg={touched.telefono ? errors.telefono : ''} />
              </div>

              {/* Fecha y hora */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Fecha *</label>
                  <input type="date" value={form.fecha_llamada}
                    onChange={e => handleChange('fecha_llamada', e.target.value)}
                    onBlur={() => handleBlur('fecha_llamada')}
                    className={inputCls('fecha_llamada', touched, errors)} />
                  <FieldError msg={touched.fecha_llamada ? errors.fecha_llamada : ''} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">
                    Hora <span className="text-slate-400 font-normal">(opc.)</span>
                  </label>
                  <input type="time" value={form.hora_llamada}
                    onChange={e => setForm(f => ({ ...f, hora_llamada: e.target.value }))}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all" />
                </div>
              </div>
              {form.hora_llamada && (
                <p className="text-xs -mt-2" style={{ color: '#FF6B00' }}>Recibirás una notificación antes de la llamada.</p>
              )}

              {editing && (
                <div>
                  <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Estado</label>
                  <select value={form.estado} onChange={e => setForm(f => ({ ...f, estado: e.target.value as Estado }))}
                    className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all">
                    {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Notas (opcional)</label>
                <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3} className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF6B00] resize-none transition-all"
                  placeholder="Información adicional..." />
              </div>

              <button type="submit" disabled={!canSave}
                className="w-full text-white font-bold py-3 rounded-lg text-sm transition-all duration-200 disabled:opacity-50"
                style={{ background: '#FF6B00' }}>
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar referido'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
