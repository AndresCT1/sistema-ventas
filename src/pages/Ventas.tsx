import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PLANES, getPlanByPrecio } from '../lib/comisiones'
import type { Venta } from '../types'

const WOW_BOLETA_URL = 'https://wowperu.pe/pagar-boleta/'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function diffDays(dateStr: string) {
  const d = new Date(dateStr)
  const t = new Date(new Date().toISOString().split('T')[0])
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}

function getMesOptions() {
  const options: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = d.toISOString().substring(0, 7)
    const label = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return options
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

const today = new Date().toISOString().split('T')[0]

const emptyForm = {
  cliente_nombre: '',
  cliente_telefono: '',
  cliente_direccion: '',
  codigo_pago: '',
  fecha_inicio: today,
  plan_precio: '',
}

// ── Badge de estado de pago ───────────────────────────────────────────────────

function EstadoBadge({ estado, fecha }: { estado?: string | null; fecha?: string | null }) {
  const fechaFmt = fecha ? ` · ${formatDate(fecha.split('T')[0])}` : ''
  if (estado === 'pagado') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
        Al día{fechaFmt}
      </span>
    )
  }
  if (estado === 'deuda') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        Con deuda{fechaFmt}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
      Sin verificar
    </span>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Ventas() {
  const { profile } = useAuth()
  const [ventas, setVentas]             = useState<Venta[]>([])
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState<Venta | null>(null)
  const [form, setForm]                 = useState(emptyForm)
  const [saving, setSaving]             = useState(false)
  const [search, setSearch]             = useState('')
  const [mesSeleccionado, setMesSel]    = useState(new Date().toISOString().substring(0, 7))
  const [showDetalle, setShowDetalle]   = useState<Venta | null>(null)

  // Estado boleta
  const [showBoleta, setShowBoleta]         = useState<Venta | null>(null)
  const [iframeState, setIframeState]       = useState<'loading' | 'loaded' | 'blocked'>('loading')
  const [savingEstado, setSavingEstado]     = useState(false)

  const mesOptions = getMesOptions()

  // Timeout para detectar si iframe fue bloqueado
  useEffect(() => {
    if (!showBoleta) return
    const timer = setTimeout(() => {
      setIframeState(s => s === 'loading' ? 'blocked' : s)
    }, 5000)
    return () => clearTimeout(timer)
  }, [showBoleta])

  const loadVentas = useCallback(async () => {
    setLoading(true)
    const mesInicio = mesSeleccionado + '-01'
    const d = new Date(mesInicio)
    d.setMonth(d.getMonth() + 1)
    const mesFin = d.toISOString().split('T')[0]

    const query = supabase.from('ventas').select('*')
      .gte('fecha_inicio', mesInicio)
      .lt('fecha_inicio', mesFin)
      .order('fecha_inicio', { ascending: false })

    if (profile?.role !== 'admin') query.eq('vendedor_id', profile!.id)

    const { data } = await query
    setVentas(data ?? [])
    setLoading(false)
  }, [profile, mesSeleccionado])

  useEffect(() => {
    if (profile) loadVentas()
  }, [profile, loadVentas])

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  function openEdit(v: Venta) {
    setEditing(v)
    setForm({
      cliente_nombre:    v.cliente_nombre,
      cliente_telefono:  v.cliente_telefono,
      cliente_direccion: v.cliente_direccion,
      codigo_pago:       v.codigo_pago,
      fecha_inicio:      v.fecha_inicio,
      plan_precio:       v.plan_precio ? String(v.plan_precio) : '',
    })
    setShowModal(true)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSaving(true)
    const fecha_renovacion = addMonths(form.fecha_inicio, 6)
    const payload = {
      cliente_nombre:    form.cliente_nombre,
      cliente_telefono:  form.cliente_telefono,
      cliente_direccion: form.cliente_direccion,
      codigo_pago:       form.codigo_pago,
      fecha_inicio:      form.fecha_inicio,
      fecha_renovacion,
      plan_precio: form.plan_precio ? parseFloat(form.plan_precio) : null,
    }
    if (editing) {
      await supabase.from('ventas').update(payload).eq('id', editing.id)
    } else {
      await supabase.from('ventas').insert({ ...payload, vendedor_id: profile.id })
    }
    setSaving(false)
    setShowModal(false)
    loadVentas()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta venta?')) return
    await supabase.from('ventas').delete().eq('id', id)
    loadVentas()
  }

  async function handleVerBoleta(v: Venta) {
    await copyToClipboard(v.codigo_pago)
    setIframeState('loading')
    setShowBoleta(v)
  }

  async function handleEstadoPago(estado: 'pagado' | 'deuda') {
    if (!showBoleta) return
    setSavingEstado(true)
    await supabase.from('ventas').update({
      estado_pago: estado,
      fecha_verificacion: new Date().toISOString(),
    }).eq('id', showBoleta.id)
    setSavingEstado(false)
    setShowBoleta(null)
    loadVentas()
  }

  const filtered = ventas.filter(v =>
    v.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
    v.cliente_telefono.includes(search) ||
    v.codigo_pago.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-slate-800">Ventas</h2>
        <button onClick={openNew}
          className="bg-violet-700 text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar
        </button>
      </div>

      <div className="mb-3">
        <select value={mesSeleccionado} onChange={e => setMesSel(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
          {mesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="mb-4">
        <input type="text" placeholder="Buscar por nombre, teléfono o código..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-700" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-sm">No hay ventas registradas en este mes</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const diff = diffDays(v.fecha_renovacion)
            const venceProxima = diff <= 30
            const plan = getPlanByPrecio(v.plan_precio)
            return (
              <div key={v.id}
                className={`bg-white border rounded-xl p-4 shadow-sm ${venceProxima && diff >= 0 ? 'border-amber-300' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{v.cliente_nombre}</p>
                    <p className="text-sm text-slate-600">{v.cliente_telefono}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Código: {v.codigo_pago}</p>
                    {plan && <p className="text-xs text-violet-600 mt-0.5">{plan.descripcion}</p>}
                    <p className="text-xs text-slate-500">
                      Instalación: {formatDate(v.fecha_inicio)} · Vence: {formatDate(v.fecha_renovacion)}
                    </p>
                    <div className="mt-1.5">
                      <EstadoBadge estado={v.estado_pago} fecha={v.fecha_verificacion} />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {venceProxima && diff >= 0 && (
                      <span className={`text-xs px-2 py-1 rounded-full font-medium text-white ${diff <= 7 ? 'bg-red-500' : 'bg-amber-500'}`}>
                        {diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${diff}d`}
                      </span>
                    )}
                    {diff < 0 && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium text-white bg-slate-400">Vencido</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => setShowDetalle(v)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors">
                    Ver detalle
                  </button>
                  <button onClick={() => handleVerBoleta(v)}
                    className="text-xs bg-violet-50 hover:bg-violet-100 text-violet-700 font-medium px-2.5 py-1 rounded-lg transition-colors">
                    Ver boleta
                  </button>
                  <button onClick={() => openEdit(v)}
                    className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg transition-colors ml-auto">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(v.id)}
                    className="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg transition-colors">
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal Ver Boleta ─────────────────────────────────────────────────── */}
      {showBoleta && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">

          {/* Header */}
          <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white">
            <button onClick={() => setShowBoleta(null)}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 truncate text-sm">{showBoleta.cliente_nombre}</p>
              <p className="text-xs text-slate-500">Verificar boleta</p>
            </div>
          </div>

          {/* Aviso código copiado */}
          <div className="shrink-0 bg-violet-50 border-b border-violet-200 px-4 py-3 flex items-start gap-2.5">
            <svg className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 3l2 2 4-4" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-violet-800">
                Código copiado: {showBoleta.codigo_pago}
              </p>
              <p className="text-xs text-violet-600 mt-0.5">
                Pégalo en el campo de la página
              </p>
            </div>
          </div>

          {/* Área iframe */}
          <div className="flex-1 relative overflow-hidden">

            {/* Spinner mientras carga */}
            {iframeState === 'loading' && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50 gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-700" />
                <p className="text-xs text-slate-500">Cargando página...</p>
              </div>
            )}

            {/* Iframe (visible solo cuando loaded) */}
            {iframeState !== 'blocked' && (
              <iframe
                src={WOW_BOLETA_URL}
                title="Pagar boleta WOW"
                className={`w-full h-full border-0 ${iframeState === 'loading' ? 'invisible' : 'visible'}`}
                onLoad={() => setIframeState('loaded')}
              />
            )}

            {/* Fallback si iframe fue bloqueado */}
            {iframeState === 'blocked' && (
              <div className="flex flex-col items-center justify-center h-full gap-5 p-8 bg-slate-50">
                <div className="w-16 h-16 rounded-2xl bg-slate-200 flex items-center justify-center">
                  <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-slate-700">La página no puede mostrarse aquí</p>
                  <p className="text-xs text-slate-500 mt-1">El código ya fue copiado al portapapeles</p>
                </div>
                <a
                  href={WOW_BOLETA_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-violet-700 hover:bg-violet-800 text-white font-bold px-8 py-4 rounded-2xl text-sm flex items-center gap-2.5 transition-colors shadow-lg shadow-violet-200 active:scale-95"
                >
                  Abrir página de WOW
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            )}
          </div>

          {/* Botones de estado */}
          <div className="shrink-0 p-4 border-t border-slate-200 bg-white grid grid-cols-2 gap-3">
            <button
              onClick={() => handleEstadoPago('pagado')}
              disabled={savingEstado}
              className="bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Cliente al día
            </button>
            <button
              onClick={() => handleEstadoPago('deuda')}
              disabled={savingEstado}
              className="bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Tiene deuda
            </button>
          </div>
        </div>
      )}

      {/* ── Modal Detalle ──────────────────────────────────────────────────────── */}
      {showDetalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">Detalle de venta</h3>
              <button onClick={() => setShowDetalle(null)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Row label="Cliente"        value={showDetalle.cliente_nombre} />
              <Row label="Teléfono"       value={showDetalle.cliente_telefono} />
              <Row label="Dirección"      value={showDetalle.cliente_direccion} />
              <Row label="Código de pago" value={showDetalle.codigo_pago} />
              {showDetalle.plan_precio && (
                <Row label="Plan" value={getPlanByPrecio(showDetalle.plan_precio)?.descripcion ?? String(showDetalle.plan_precio)} />
              )}
              <Row label="Instalación" value={formatDate(showDetalle.fecha_inicio)} />
              <Row label="Renovación"  value={formatDate(showDetalle.fecha_renovacion)} />
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Estado pago</span>
                <EstadoBadge estado={showDetalle.estado_pago} fecha={showDetalle.fecha_verificacion} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Formulario ───────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">{editing ? 'Editar venta' : 'Registrar venta'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del cliente *</label>
                <input required type="text" value={form.cliente_nombre}
                  onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Juan Pérez" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono *</label>
                <input required type="tel" value={form.cliente_telefono}
                  onChange={e => setForm(f => ({ ...f, cliente_telefono: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="+51 999 999 999" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dirección *</label>
                <input required type="text" value={form.cliente_direccion}
                  onChange={e => setForm(f => ({ ...f, cliente_direccion: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Av. Principal 123" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Código de pago *</label>
                <input required type="text" value={form.codigo_pago}
                  onChange={e => setForm(f => ({ ...f, codigo_pago: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="COD-0001" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Plan vendido *</label>
                <select required value={form.plan_precio}
                  onChange={e => setForm(f => ({ ...f, plan_precio: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 bg-white">
                  <option value="">Seleccionar plan...</option>
                  {PLANES.map(p => <option key={p.precio} value={p.precio}>{p.descripcion}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fecha de instalación *</label>
                <input required type="date" value={form.fecha_inicio}
                  onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                {form.fecha_inicio && (
                  <p className="text-xs text-slate-500 mt-1">
                    Renovación automática: {formatDate(addMonths(form.fecha_inicio, 6))} · Define a qué cosecha pertenece esta venta
                  </p>
                )}
              </div>
              <button type="submit" disabled={saving}
                className="w-full bg-violet-700 hover:bg-violet-800 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-60">
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar venta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-slate-500 shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}
