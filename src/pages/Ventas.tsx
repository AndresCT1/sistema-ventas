import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PLANES, getPlanByPrecio } from '../lib/comisiones'
import { getFacturaActiva, estadoFactura } from '../lib/facturas'
import {
  validateNombreCliente, validateTelefono, validateDireccion,
  validateCodigo, validatePlan, validateFechaInstalacion,
} from '../lib/validaciones'
import BoletaModal from '../components/BoletaModal'
import type { Venta } from '../types'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`
}
function addMonths(dateStr: string, months: number) {
  const d = new Date(dateStr); d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}
function diffDays(dateStr: string) {
  const d = new Date(dateStr), t = new Date(new Date().toISOString().split('T')[0])
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}
function getMesOptions() {
  const opts: { value: string; label: string }[] = []
  const now = new Date()
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = d.toISOString().substring(0, 7)
    const label = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) })
  }
  return opts
}

const today = new Date().toISOString().split('T')[0]
const emptyForm = { cliente_nombre:'', cliente_telefono:'', cliente_direccion:'', codigo_pago:'', fecha_inicio: today, plan_precio:'' }

// ── Validación ────────────────────────────────────────────────────────────────

type FormErrors = {
  cliente_nombre: string; cliente_telefono: string; cliente_direccion: string
  codigo_pago: string; plan_precio: string; fecha_inicio: string
}
type Touched = Record<keyof FormErrors, boolean>

function getErrors(form: typeof emptyForm): FormErrors {
  return {
    cliente_nombre:   validateNombreCliente(form.cliente_nombre),
    cliente_telefono: validateTelefono(form.cliente_telefono),
    cliente_direccion:validateDireccion(form.cliente_direccion),
    codigo_pago:      validateCodigo(form.codigo_pago),
    plan_precio:      validatePlan(form.plan_precio),
    fecha_inicio:     validateFechaInstalacion(form.fecha_inicio),
  }
}

const emptyErrors: FormErrors = { cliente_nombre:'', cliente_telefono:'', cliente_direccion:'', codigo_pago:'', plan_precio:'', fecha_inicio:'' }
const emptyTouched: Touched   = { cliente_nombre:false, cliente_telefono:false, cliente_direccion:false, codigo_pago:false, plan_precio:false, fecha_inicio:false }

function inputCls(field: keyof Touched, touched: Touched, errors: FormErrors) {
  const base = 'w-full rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none transition-all'
  if (!touched[field]) return `${base} border border-slate-200 focus:ring-2 focus:ring-[#FF6B00]`
  if (errors[field])   return `${base} border-2 border-red-500 focus:ring-2 focus:ring-red-100`
  return `${base} border-2 border-green-500 focus:ring-2 focus:ring-green-100`
}

function FieldError({ msg }: { msg: string }) {
  return msg ? <p className="text-xs text-red-500 mt-1">⚠ {msg}</p> : null
}

// ── Badges F1/F2/F3 ───────────────────────────────────────────────────────────
function FacturasBadges({ v }: { v: Venta }) {
  const activa = getFacturaActiva(v.fecha_inicio, today)
  return (
    <div className="flex gap-1 mt-1.5">
      {([1,2,3] as const).map(n => {
        const est = estadoFactura(v as unknown as Record<string,unknown>, n)
        const bg   = est === 'pagado'  ? '#D1FAE5' : est === 'no_pago' ? '#FEE2E2' : '#F1F5F9'
        const text = est === 'pagado'  ? '#059669' : est === 'no_pago' ? '#DC2626' : '#94A3B8'
        const ring = activa === n ? '2px solid #FF6B00' : '1px solid transparent'
        return (
          <span key={n} className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: bg, color: text, outline: ring }}>
            F{n}
          </span>
        )
      })}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function Ventas() {
  const { profile } = useAuth()
  const [ventas, setVentas]           = useState<Venta[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<Venta | null>(null)
  const [form, setForm]               = useState(emptyForm)
  const [saving, setSaving]           = useState(false)
  const [search, setSearch]           = useState('')
  const [mesSeleccionado, setMesSel]  = useState(new Date().toISOString().substring(0, 7))
  const [showDetalle, setShowDetalle] = useState<Venta | null>(null)
  const [showBoleta, setShowBoleta]   = useState<Venta | null>(null)
  const [errors, setErrors]           = useState<FormErrors>(emptyErrors)
  const [touched, setTouched]         = useState<Touched>(emptyTouched)
  const mesOptions = getMesOptions()

  const loadVentas = useCallback(async () => {
    setLoading(true)
    const mesInicio = mesSeleccionado + '-01'
    const d = new Date(mesInicio); d.setMonth(d.getMonth() + 1)
    const query = supabase.from('ventas').select('*')
      .gte('fecha_inicio', mesInicio).lt('fecha_inicio', d.toISOString().split('T')[0])
      .order('fecha_inicio', { ascending: false })
    if (profile?.role !== 'admin') query.eq('vendedor_id', profile!.id)
    const { data } = await query
    setVentas(data ?? [])
    setLoading(false)
  }, [profile, mesSeleccionado])

  useEffect(() => { if (profile) loadVentas() }, [profile, loadVentas])

  function resetModal() { setErrors(emptyErrors); setTouched(emptyTouched) }

  function openNew() { setEditing(null); setForm(emptyForm); resetModal(); setShowModal(true) }
  function openEdit(v: Venta) {
    setEditing(v)
    setForm({ cliente_nombre: v.cliente_nombre, cliente_telefono: v.cliente_telefono, cliente_direccion: v.cliente_direccion, codigo_pago: v.codigo_pago, fecha_inicio: v.fecha_inicio, plan_precio: v.plan_precio ? String(v.plan_precio) : '' })
    resetModal(); setShowModal(true)
  }

  function handleChange(field: keyof FormErrors, value: string) {
    const updated = { ...form, [field]: value }
    setForm(f => ({ ...f, [field]: value }))
    if (touched[field]) setErrors(e => ({ ...e, [field]: getErrors(updated)[field] }))
  }

  function handleBlur(field: keyof FormErrors) {
    setTouched(t => ({ ...t, [field]: true }))
    setErrors(e => ({ ...e, [field]: getErrors(form)[field] }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault(); if (!profile) return
    const allTouched = Object.fromEntries(Object.keys(emptyTouched).map(k => [k, true])) as Touched
    setTouched(allTouched)
    const errs = getErrors(form)
    setErrors(errs)
    if (Object.values(errs).some(v => v !== '')) return

    setSaving(true)
    const payload = { cliente_nombre: form.cliente_nombre, cliente_telefono: form.cliente_telefono, cliente_direccion: form.cliente_direccion, codigo_pago: form.codigo_pago, fecha_inicio: form.fecha_inicio, fecha_renovacion: addMonths(form.fecha_inicio, 6), plan_precio: parseFloat(form.plan_precio) }
    if (editing) await supabase.from('ventas').update(payload).eq('id', editing.id)
    else         await supabase.from('ventas').insert({ ...payload, vendedor_id: profile.id })
    setSaving(false); setShowModal(false); loadVentas()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar esta venta?')) return
    await supabase.from('ventas').delete().eq('id', id); loadVentas()
  }

  const allErrors = getErrors(form)
  const canSave   = !saving && Object.values(allErrors).every(v => v === '')

  const filtered = ventas.filter(v =>
    v.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
    v.cliente_telefono.includes(search) ||
    v.codigo_pago.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="px-4 py-5 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-extrabold text-[#1A1A2E] border-b-2 border-[#FF6B00] pb-1">Ventas</h2>
        <button onClick={openNew}
          className="text-white text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 active:scale-95 transition-all duration-200"
          style={{ background: '#FF6B00', boxShadow: '0 2px 8px rgba(255,107,0,0.3)' }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Registrar
        </button>
      </div>

      <div className="mb-3">
        <select value={mesSeleccionado} onChange={e => setMesSel(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {mesOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="mb-4">
        <input type="text" placeholder="Buscar por nombre, teléfono o código..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#FF6B00] transition-all"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-slate-400 text-sm">No hay ventas en este mes</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const diff = diffDays(v.fecha_renovacion)
            const plan = getPlanByPrecio(v.plan_precio)
            return (
              <div key={v.id} className="bg-white rounded-xl p-4 transition-all duration-200"
                style={{ borderLeft: '4px solid #FF6B00', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#1A1A2E] truncate">{v.cliente_nombre}</p>
                    <p className="text-sm text-slate-500">{v.cliente_telefono}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Código: {v.codigo_pago}</p>
                    {plan && <p className="text-xs font-medium mt-0.5" style={{ color: '#7C3AED' }}>{plan.descripcion}</p>}
                    <p className="text-xs text-slate-400">Instalación: {formatDate(v.fecha_inicio)} · Vence: {formatDate(v.fecha_renovacion)}</p>
                    <FacturasBadges v={v} />
                  </div>
                  <div className="shrink-0 flex flex-col gap-1 items-end">
                    {diff >= 0 && diff <= 30 && (
                      <span className="text-xs font-bold text-white px-2 py-1 rounded-full"
                        style={{ background: diff <= 7 ? '#EF4444' : '#FF6B00' }}>
                        {diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${diff}d`}
                      </span>
                    )}
                    {diff < 0 && <span className="text-xs font-medium text-white px-2 py-1 rounded-full bg-slate-400">Vencido</span>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={() => setShowDetalle(v)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: '#F8F7FF', color: '#64748B' }}>
                    Ver detalle
                  </button>
                  <button onClick={() => setShowBoleta(v)}
                    className="text-xs font-bold px-3 py-1 rounded-lg text-white active:scale-95 transition-all"
                    style={{ background: '#FF6B00' }}>
                    Ver boleta
                  </button>
                  <button onClick={() => openEdit(v)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg ml-auto"
                    style={{ background: '#F3F0FF', color: '#7C3AED' }}>
                    Editar
                  </button>
                  <button onClick={() => handleDelete(v.id)}
                    className="text-xs font-medium px-2.5 py-1 rounded-lg"
                    style={{ background: '#FFF5F5', color: '#EF4444' }}>
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showBoleta && <BoletaModal venta={showBoleta} onClose={() => setShowBoleta(null)} onSaved={loadVentas} />}

      {/* Modal Detalle */}
      {showDetalle && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-[#1A1A2E]">Detalle de venta</h3>
              <button onClick={() => setShowDetalle(null)} className="text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[['Cliente', showDetalle.cliente_nombre], ['Teléfono', showDetalle.cliente_telefono], ['Dirección', showDetalle.cliente_direccion], ['Código', showDetalle.codigo_pago], ['Instalación', formatDate(showDetalle.fecha_inicio)], ['Renovación', formatDate(showDetalle.fecha_renovacion)]].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400 shrink-0">{l}</span>
                  <span className="text-sm font-semibold text-[#1A1A2E] text-right">{v}</span>
                </div>
              ))}
              {showDetalle.plan_precio && (
                <div className="flex justify-between gap-3">
                  <span className="text-sm text-slate-400 shrink-0">Plan</span>
                  <span className="text-sm font-semibold text-right" style={{ color: '#7C3AED' }}>
                    {getPlanByPrecio(showDetalle.plan_precio)?.descripcion}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400">Facturas</span>
                <FacturasBadges v={showDetalle} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Formulario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-[#1A1A2E]">{editing ? 'Editar venta' : 'Registrar venta'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">

              {/* Nombre */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Nombre del cliente *</label>
                <input type="text" value={form.cliente_nombre}
                  onChange={e => handleChange('cliente_nombre', e.target.value)}
                  onBlur={() => handleBlur('cliente_nombre')}
                  className={inputCls('cliente_nombre', touched, errors)}
                  placeholder="Juan Pérez" />
                <FieldError msg={touched.cliente_nombre ? errors.cliente_nombre : ''} />
              </div>

              {/* Teléfono */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Teléfono *</label>
                <input type="tel" value={form.cliente_telefono} maxLength={9}
                  onChange={e => handleChange('cliente_telefono', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => handleBlur('cliente_telefono')}
                  className={inputCls('cliente_telefono', touched, errors)}
                  placeholder="987654321" />
                <FieldError msg={touched.cliente_telefono ? errors.cliente_telefono : ''} />
              </div>

              {/* Dirección */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Dirección *</label>
                <input type="text" value={form.cliente_direccion}
                  onChange={e => handleChange('cliente_direccion', e.target.value)}
                  onBlur={() => handleBlur('cliente_direccion')}
                  className={inputCls('cliente_direccion', touched, errors)}
                  placeholder="Av. Principal 123, Miraflores" />
                <FieldError msg={touched.cliente_direccion ? errors.cliente_direccion : ''} />
              </div>

              {/* Código de pago */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Código de pago *</label>
                <input type="text" value={form.codigo_pago} maxLength={11}
                  onChange={e => handleChange('codigo_pago', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => handleBlur('codigo_pago')}
                  className={inputCls('codigo_pago', touched, errors)}
                  placeholder="20261234567" />
                <FieldError msg={touched.codigo_pago ? errors.codigo_pago : ''} />
              </div>

              {/* Plan */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Plan vendido *</label>
                <select value={form.plan_precio}
                  onChange={e => handleChange('plan_precio', e.target.value)}
                  onBlur={() => handleBlur('plan_precio')}
                  className={inputCls('plan_precio', touched, errors)}>
                  <option value="">Seleccionar plan...</option>
                  {PLANES.map(p => <option key={p.precio} value={p.precio}>{p.descripcion}</option>)}
                </select>
                <FieldError msg={touched.plan_precio ? errors.plan_precio : ''} />
              </div>

              {/* Fecha de instalación */}
              <div>
                <label className="block text-sm font-semibold text-[#1A1A2E] mb-1.5">Fecha de instalación *</label>
                <input type="date" value={form.fecha_inicio}
                  onChange={e => handleChange('fecha_inicio', e.target.value)}
                  onBlur={() => handleBlur('fecha_inicio')}
                  className={inputCls('fecha_inicio', touched, errors)} />
                <FieldError msg={touched.fecha_inicio ? errors.fecha_inicio : ''} />
                {!errors.fecha_inicio && form.fecha_inicio && (
                  <p className="text-xs text-slate-400 mt-1">
                    Renovación: {formatDate(addMonths(form.fecha_inicio, 6))} · Define la cosecha
                  </p>
                )}
              </div>

              <button type="submit" disabled={!canSave}
                className="w-full text-white font-bold py-3 rounded-lg text-sm transition-all disabled:opacity-50"
                style={{ background: '#FF6B00' }}>
                {saving ? 'Guardando...' : editing ? 'Guardar cambios' : 'Registrar venta'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
