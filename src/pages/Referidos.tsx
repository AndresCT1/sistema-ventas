import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Referido } from '../types'

const ESTADOS = ['pendiente', 'llamado', 'convertido'] as const
type Estado = typeof ESTADOS[number]

const ESTADO_LABEL: Record<Estado, string> = {
  pendiente: 'Pendiente',
  llamado: 'Llamado',
  convertido: 'Convertido',
}

const ESTADO_COLOR: Record<Estado, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  llamado: 'bg-blue-100 text-blue-800 border-blue-300',
  convertido: 'bg-green-100 text-green-800 border-green-300',
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

const emptyForm = { nombre: '', telefono: '', fecha_llamada: '', notas: '', estado: 'pendiente' as Estado }

export default function Referidos() {
  const { profile } = useAuth()
  const [referidos, setReferidos] = useState<Referido[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Referido | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filterEstado, setFilterEstado] = useState<Estado | 'todos'>('todos')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (profile) loadReferidos()
  }, [profile])

  async function loadReferidos() {
    setLoading(true)
    const query = supabase.from('referidos').select('*').order('fecha_llamada', { ascending: true })
    if (profile?.role !== 'admin') query.eq('vendedor_id', profile!.id)
    const { data } = await query
    setReferidos(data ?? [])
    setLoading(false)
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(r: Referido) {
    setEditing(r)
    setForm({ nombre: r.nombre, telefono: r.telefono, fecha_llamada: r.fecha_llamada, notas: r.notas ?? '', estado: r.estado })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    if (editing) {
      await supabase.from('referidos').update(form).eq('id', editing.id)
    } else {
      await supabase.from('referidos').insert({ ...form, vendedor_id: profile.id })
    }
    setSaving(false)
    setShowModal(false)
    loadReferidos()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este referido?')) return
    await supabase.from('referidos').delete().eq('id', id)
    loadReferidos()
  }

  async function cambiarEstado(r: Referido, estado: Estado) {
    await supabase.from('referidos').update({ estado }).eq('id', r.id)
    loadReferidos()
  }

  const filtered = referidos.filter(r => {
    const matchEstado = filterEstado === 'todos' || r.estado === filterEstado
    const matchSearch = r.nombre.toLowerCase().includes(search.toLowerCase()) ||
      r.telefono.includes(search)
    return matchEstado && matchSearch
  })

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">Referidos</h2>
        <button
          onClick={openNew}
          className="bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Agregar
        </button>
      </div>

      {/* Search & filter */}
      <div className="space-y-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['todos', ...ESTADOS] as const).map(e => (
            <button
              key={e}
              onClick={() => setFilterEstado(e)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filterEstado === e ? 'bg-blue-700 text-white border-blue-700' : 'bg-white text-slate-600 border-slate-300'
              }`}
            >
              {e === 'todos' ? 'Todos' : ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">
          No hay referidos {filterEstado !== 'todos' ? `con estado "${ESTADO_LABEL[filterEstado as Estado]}"` : ''}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(r => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{r.nombre}</p>
                  <p className="text-sm text-slate-600">{r.telefono}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Llamar: {formatDate(r.fecha_llamada)}</p>
                  {r.notas && <p className="text-xs text-slate-400 italic mt-1 line-clamp-2">{r.notas}</p>}
                </div>
                <span className={`shrink-0 text-xs px-2 py-1 rounded-full border font-medium ${ESTADO_COLOR[r.estado]}`}>
                  {ESTADO_LABEL[r.estado]}
                </span>
              </div>

              <div className="flex gap-2 mt-3 flex-wrap">
                {ESTADOS.filter(e => e !== r.estado).map(e => (
                  <button
                    key={e}
                    onClick={() => cambiarEstado(r, e)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    → {ESTADO_LABEL[e]}
                  </button>
                ))}
                <button
                  onClick={() => openEdit(r)}
                  className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg transition-colors ml-auto"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{editing ? 'Editar referido' : 'Nuevo referido'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre completo *</label>
                <input
                  required
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Juan Pérez"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono *</label>
                <input
                  required
                  type="tel"
                  value={form.telefono}
                  onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+54 11 1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha programada para llamar *</label>
                <input
                  required
                  type="date"
                  value={form.fecha_llamada}
                  onChange={e => setForm(f => ({ ...f, fecha_llamada: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {editing && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value as Estado }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ESTADOS.map(e => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas (opcional)</label>
                <textarea
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  rows={3}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Información adicional..."
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60"
              >
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Agregar referido'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
