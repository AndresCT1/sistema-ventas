import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import {
  getPeriodoDates, shiftPeriodo, periodoLabel, periodoShort,
  getScheme, calcNominal1, calcNominal2, calcPenalizacion, getPenaltyInfo,
  fmt,
} from '../lib/comisiones'
import type { Profile, Venta, Cosecha } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, val))
}

function getLastDay(pagoMes: string): string {
  const [y, m] = pagoMes.split('-').map(Number)
  const last = new Date(y, m, 0)
  return `${String(last.getDate()).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

function getPagoMeses(): string[] {
  const fy = 2026, fm = 3
  const today = new Date()
  const cy = today.getFullYear(), cm = today.getMonth() + 1
  const months: string[] = []
  let y = fy, m = fm
  while (y < cy || (y === cy && m <= cm)) {
    months.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

function periodoRango(periodo: string): string {
  const { start, end } = getPeriodoDates(periodo)
  const short = (s: string) => {
    const [, mo, d] = s.split('-').map(Number)
    const label = new Date(2000, mo - 1, d).toLocaleDateString('es', { month: 'short' }).replace('.', '')
    return `${d} ${label}`
  }
  return `${short(start)} – ${short(end)}`
}

// ── types ─────────────────────────────────────────────────────────────────────

interface PeriodoData {
  periodo: string
  antipoIdx: 0 | 1 | 2   // 0=mes1 40%, 1=mes2 30%, 2=mes3 30%
  ventas: Venta[]
  cosecha: Cosecha | null
}

interface AnticipoResult {
  scheme: 'normal' | 'promotor'
  n1: number; n2: number; ntotal: number
  anticipoBruto: number; penalizacion: number
}

// ── main component ────────────────────────────────────────────────────────────

export default function Comisiones() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [vendedores, setVendedores] = useState<Profile[]>([])
  const [targetId, setTargetId]     = useState<string>('')
  const [target, setTarget]         = useState<Profile | null>(null)

  const pagoMeses = getPagoMeses()
  const [pagoMes, setPagoMes]       = useState(pagoMeses[pagoMeses.length - 1])
  const [data, setData]             = useState<[PeriodoData, PeriodoData, PeriodoData] | null>(null)
  const [loading, setLoading]       = useState(true)
  const [showDetalle, setShowDetalle] = useState(false)
  const [pcts, setPcts]             = useState<Record<string, { pct: number; noPago: number }>>({})
  const [saving, setSaving]         = useState<Record<string, boolean>>({})

  const pillsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pillsRef.current) pillsRef.current.scrollLeft = pillsRef.current.scrollWidth
  }, [])

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'admin') loadVendedores()
    else { setTargetId(profile.id); setTarget(profile) }
  }, [profile])

  async function loadVendedores() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setVendedores(data ?? [])
    if (data?.length) { setTargetId(data[0].id); setTarget(data[0]) }
  }

  function handleSelectVendedor(id: string) {
    const v = vendedores.find(x => x.id === id)
    setTargetId(id); setTarget(v ?? null)
  }

  const loadData = useCallback(async () => {
    if (!targetId) return
    setLoading(true)

    // Las 3 cosechas que se cobran en el mes seleccionado
    const c1 = shiftPeriodo(pagoMes, 1) // anticipo mes 1 — 40%
    const c2 = shiftPeriodo(pagoMes, 2) // anticipo mes 2 — 30%
    const c3 = shiftPeriodo(pagoMes, 3) // anticipo mes 3 — 30%
    const periodos = [c1, c2, c3]

    const ventasP = periodos.map(p => {
      const { start, end } = getPeriodoDates(p)
      return supabase.from('ventas').select('*')
        .eq('vendedor_id', targetId)
        .gte('fecha_inicio', start)
        .lte('fecha_inicio', end)
        .order('fecha_inicio', { ascending: true })
        .then(r => r.data ?? [])
    })

    const cosechasP = supabase.from('cosechas').select('*')
      .eq('vendedor_id', targetId)
      .in('periodo', periodos)
      .then(r => r.data ?? [])

    const [v1, v2, v3, cosechasArr] = await Promise.all([...ventasP, cosechasP]) as [Venta[], Venta[], Venta[], Cosecha[]]

    const cm: Record<string, Cosecha> = {}
    cosechasArr.forEach(c => { cm[c.periodo] = c })

    const newData: [PeriodoData, PeriodoData, PeriodoData] = [
      { periodo: c1, antipoIdx: 0, ventas: v1, cosecha: cm[c1] ?? null },
      { periodo: c2, antipoIdx: 1, ventas: v2, cosecha: cm[c2] ?? null },
      { periodo: c3, antipoIdx: 2, ventas: v3, cosecha: cm[c3] ?? null },
    ]
    setData(newData)

    const newPcts: Record<string, { pct: number; noPago: number }> = {}
    newData.forEach(({ periodo, antipoIdx, cosecha }) => {
      const key = antipoIdx === 0 ? 'pct_boleta_1' : antipoIdx === 1 ? 'pct_boleta_2' : 'pct_boleta_3'
      newPcts[periodo] = {
        pct:    cosecha ? ((cosecha[key as keyof Cosecha] as number) ?? 100) : 100,
        noPago: cosecha?.no_pago_count ?? 0,
      }
    })
    setPcts(newPcts)
    setLoading(false)
  }, [targetId, pagoMes])

  useEffect(() => { loadData() }, [loadData])

  function calcAnticipo(pd: PeriodoData): AnticipoResult {
    const scheme = target ? getScheme(target.fecha_ingreso_wow, pd.periodo) : 'normal'
    const n1 = calcNominal1(pd.ventas.length, pd.periodo, scheme)
    const n2 = calcNominal2(pd.ventas)
    const ntotal = n1 + n2
    const pctBoleta = (pcts[pd.periodo]?.pct ?? 100) / 100
    const noPago    = pcts[pd.periodo]?.noPago ?? 0
    const pct       = pd.antipoIdx === 0 ? 0.40 : 0.30
    const base      = ntotal * pct * pctBoleta
    const pen       = pd.antipoIdx === 2
      ? calcPenalizacion(pd.ventas, noPago, pd.periodo, scheme, base)
      : 0
    return { scheme, n1, n2, ntotal, anticipoBruto: Math.max(0, base - pen), penalizacion: pen }
  }

  // Calcula % boleta desde los estados F1/F2/F3 registrados en pagos
  async function calcFromPagos(pd: PeriodoData) {
    const { start, end } = getPeriodoDates(pd.periodo)
    const { data: rows } = await supabase
      .from('ventas')
      .select('estado_f1, estado_f2, estado_f3')
      .eq('vendedor_id', targetId)
      .gte('fecha_inicio', start)
      .lte('fecha_inicio', end)

    if (!rows?.length) return
    const fKey = pd.antipoIdx === 0 ? 'estado_f1' : pd.antipoIdx === 1 ? 'estado_f2' : 'estado_f3'
    const pagados = rows.filter(r => r[fKey as keyof typeof r] === 'pagado').length
    const pct = Math.round((pagados / rows.length) * 100)
    setPcts(p => ({ ...p, [pd.periodo]: { ...p[pd.periodo], pct } }))
  }

  async function saveCosecha(pd: PeriodoData) {
    if (!targetId || !target) return
    setSaving(s => ({ ...s, [pd.periodo]: true }))

    const scheme = getScheme(target.fecha_ingreso_wow, pd.periodo)
    const n1 = calcNominal1(pd.ventas.length, pd.periodo, scheme)
    const n2 = calcNominal2(pd.ventas)
    const { start, end } = getPeriodoDates(pd.periodo)
    const pctVal = pcts[pd.periodo]?.pct ?? 100
    const noPago = pcts[pd.periodo]?.noPago ?? 0
    const prev   = pd.cosecha

    const row: Partial<Cosecha> & { vendedor_id: string; periodo: string } = {
      vendedor_id: targetId, periodo: pd.periodo,
      fecha_inicio: start, fecha_fin: end,
      total_ventas: pd.ventas.length,
      nominal_1: n1, nominal_2: n2, nominal_total: n1 + n2,
      pct_boleta_1: prev?.pct_boleta_1 ?? 100,
      pct_boleta_2: prev?.pct_boleta_2 ?? 100,
      pct_boleta_3: prev?.pct_boleta_3 ?? 100,
      no_pago_count: prev?.no_pago_count ?? 0,
      updated_at: new Date().toISOString(),
    }
    if (pd.antipoIdx === 0) row.pct_boleta_1 = pctVal
    if (pd.antipoIdx === 1) row.pct_boleta_2 = pctVal
    if (pd.antipoIdx === 2) { row.pct_boleta_3 = pctVal; row.no_pago_count = noPago }

    await supabase.from('cosechas').upsert(row, { onConflict: 'vendedor_id,periodo' })
    setSaving(s => ({ ...s, [pd.periodo]: false }))
    loadData()
  }

  // ── render ────────────────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00]" />
      </div>
    )
  }

  const [pd1, pd2, pd3] = data
  const a1 = calcAnticipo(pd1)
  const a2 = calcAnticipo(pd2)
  const a3 = calcAnticipo(pd3)
  const totalBruto = a1.anticipoBruto + a2.anticipoBruto + a3.anticipoBruto

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5 pb-6">

      {/* Título + selector admin */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold text-[#1A1A2E] border-b-2 border-[#FF6B00] pb-1">Comisiones</h2>
        {profile?.role === 'admin' && (
          <select value={targetId} onChange={e => handleSelectVendedor(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#FF6B00] bg-white max-w-[160px]">
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
          </select>
        )}
      </div>

      {/* Aviso sin fecha_ingreso_wow */}
      {target && !target.fecha_ingreso_wow && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5">
          <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <p className="text-xs font-semibold text-amber-800">Sin fecha de ingreso — se aplica esquema normal</p>
            {profile?.id === target?.id && (
              <button onClick={() => navigate('/perfil')} className="text-xs text-amber-700 underline mt-0.5">
                → Completar en mi perfil
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pills de meses */}
      <div ref={pillsRef} className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {pagoMeses.map(mes => (
          <button key={mes} onClick={() => setPagoMes(mes)}
            className="shrink-0 px-4 py-2 rounded-full text-sm font-semibold border transition-all duration-200"
            style={mes === pagoMes
              ? { background: '#FF6B00', color: '#fff', borderColor: '#FF6B00', boxShadow: '0 2px 8px rgba(255,107,0,0.3)' }
              : { background: '#fff', color: '#64748B', borderColor: '#E2E8F0' }}>
            {periodoShort(mes)}
          </button>
        ))}
      </div>

      {/* Tarjeta resumen */}
      <div className="rounded-2xl p-5 text-white"
        style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #7C3AED 100%)', boxShadow: '0 6px 24px rgba(255,107,0,0.3)' }}>
        <p className="text-xs font-medium text-white/70 mb-4">Pago: {getLastDay(pagoMes)}</p>
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.3)', paddingTop: '1rem' }}>
          <p className="text-xs font-bold tracking-widest text-white/70 uppercase mb-1">Total a cobrar</p>
          <p className="text-5xl font-extrabold tabular-nums mb-5">{fmt(totalBruto)}</p>
          <button onClick={() => setShowDetalle(true)}
            className="w-full font-bold py-3 rounded-xl text-sm active:scale-[0.98] transition-all duration-200"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#FF6B00' }}>
            Ver detalle
          </button>
        </div>
      </div>

      {/* Modal de detalle */}
      {showDetalle && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col">

            {/* Header modal */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-[#1A1A2E]">Detalle de comisiones</h3>
                <p className="text-xs text-slate-500 mt-0.5">Cobro el {getLastDay(pagoMes)}</p>
              </div>
              <button onClick={() => setShowDetalle(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Contenido scroll */}
            <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

              {/* Orden: mes 3 → mes 2 → mes 1 */}
              <CosechaCard
                periodo={pd3.periodo} antipoNum={3} pctAnticipo={30}
                ventas={pd3.ventas} anticipo={a3}
                pct={pcts[pd3.periodo]?.pct ?? 100}
                noPago={pcts[pd3.periodo]?.noPago ?? 0}
                onPctChange={v => setPcts(p => ({ ...p, [pd3.periodo]: { ...p[pd3.periodo], pct: v } }))}
                onNoPagoChange={v => setPcts(p => ({ ...p, [pd3.periodo]: { ...p[pd3.periodo], noPago: v } }))}
                saving={!!saving[pd3.periodo]}
                onSave={() => saveCosecha(pd3)}
                onCalcFromPagos={() => calcFromPagos(pd3)}
              />

              <CosechaCard
                periodo={pd2.periodo} antipoNum={2} pctAnticipo={30}
                ventas={pd2.ventas} anticipo={a2}
                pct={pcts[pd2.periodo]?.pct ?? 100}
                onPctChange={v => setPcts(p => ({ ...p, [pd2.periodo]: { ...p[pd2.periodo], pct: v } }))}
                saving={!!saving[pd2.periodo]}
                onSave={() => saveCosecha(pd2)}
                onCalcFromPagos={() => calcFromPagos(pd2)}
              />

              <CosechaCard
                periodo={pd1.periodo} antipoNum={1} pctAnticipo={40}
                ventas={pd1.ventas} anticipo={a1}
                pct={pcts[pd1.periodo]?.pct ?? 100}
                onPctChange={v => setPcts(p => ({ ...p, [pd1.periodo]: { ...p[pd1.periodo], pct: v } }))}
                saving={!!saving[pd1.periodo]}
                onSave={() => saveCosecha(pd1)}
                onCalcFromPagos={() => calcFromPagos(pd1)}
              />

              {/* Total */}
              <div className="pt-4 flex justify-between items-center" style={{ borderTop: '2px solid #FFF3EA' }}>
                <span className="text-sm font-bold text-[#1A1A2E] uppercase tracking-wide">Total mes</span>
                <span className="text-xl font-extrabold tabular-nums" style={{ color: '#FF6B00' }}>{fmt(totalBruto)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── CosechaCard ───────────────────────────────────────────────────────────────

function CosechaCard({
  periodo, antipoNum, pctAnticipo, ventas, anticipo,
  pct, noPago, onPctChange, onNoPagoChange, saving, onSave, onCalcFromPagos,
}: {
  periodo: string
  antipoNum: 1 | 2 | 3
  pctAnticipo: 30 | 40
  ventas: Venta[]
  anticipo: AnticipoResult
  pct: number
  noPago?: number
  onPctChange: (v: number) => void
  onNoPagoChange?: (v: number) => void
  saving: boolean
  onSave: () => void
  onCalcFromPagos: () => void
}) {
  const noVentas = ventas.length === 0
  const mesNombre = periodoLabel(periodo).split(' ')[0].toUpperCase()

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">

      {/* Encabezado */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold text-[#1A1A2E] tracking-wide">
            COSECHA {mesNombre}
          </p>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: '#FFF3EA', color: '#FF6B00', border: '1px solid #FFD0AA' }}>
            {pctAnticipo}% · anticipo mes {antipoNum}
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Período: {periodoRango(periodo)}</p>
      </div>

      {noVentas ? (
        <p className="text-sm text-slate-400 italic py-1">Sin ventas registradas</p>
      ) : (
        <>
          {/* Ventas + Nominal */}
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">Ventas: <strong className="text-slate-800">{ventas.length}</strong></span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">Nominal: <strong className="text-slate-800">{fmt(anticipo.ntotal)}</strong></span>
          </div>

          {/* % boleta */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-600">% boleta {antipoNum}</span>
            <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden w-28 bg-white">
              <input
                type="number" min={0} max={100} step={1}
                value={pct}
                onChange={e => onPctChange(clamp(parseFloat(e.target.value) || 0))}
                className="w-full px-2 py-1.5 text-sm text-right focus:outline-none"
              />
              <span className="px-2 text-xs text-slate-400 bg-slate-50 border-l border-slate-300">%</span>
            </div>
          </div>
          <button onClick={onCalcFromPagos}
            className="w-full text-xs font-semibold py-1.5 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5"
            style={{ background: '#FFF3EA', color: '#FF6B00', border: '1px solid #FFD0AA' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Calcular desde pagos registrados
          </button>

          {/* Clientes no pagaron (solo mes 3) */}
          {antipoNum === 3 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-600">Clientes que no pagaron</span>
              <input
                type="number" min={0} max={ventas.length} step={1}
                value={noPago ?? 0}
                onChange={e => onNoPagoChange?.(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#FF6B00] bg-white"
              />
            </div>
          )}

          {/* Anticipo */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Anticipo</span>
            <span className="text-sm font-bold tabular-nums" style={{ color: '#FF6B00' }}>{fmt(anticipo.anticipoBruto)}</span>
          </div>

          {/* Penalización (solo mes 3) */}
          {antipoNum === 3 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Penalización</span>
                <span className={`text-sm font-semibold tabular-nums ${anticipo.penalizacion > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                  {anticipo.penalizacion > 0 ? `−${fmt(anticipo.penalizacion)}` : fmt(0)}
                </span>
              </div>
              {anticipo.penalizacion > 0 && (noPago ?? 0) > 0 && (() => {
                const pctNP = (noPago ?? 0) / ventas.length
                const { rango, factor } = getPenaltyInfo(pctNP)
                return (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
                    {(pctNP * 100).toFixed(1)}% no pago → rango {rango} → factor {factor}×
                  </div>
                )
              })()}
            </>
          )}
        </>
      )}

      <button onClick={onSave} disabled={saving || noVentas}
        className="w-full text-white text-xs font-bold py-2.5 rounded-lg transition-all duration-200 disabled:opacity-40"
        style={{ background: '#FF6B00' }}>
        {saving ? 'Guardando...' : 'Guardar'}
      </button>
    </div>
  )
}
