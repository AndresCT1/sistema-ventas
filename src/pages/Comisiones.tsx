import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import {
  PLANES, getCurrentPeriodo, getPeriodoDates, shiftPeriodo, periodoLabel,
  getScheme, calcNominal1, calcNominal2, calcPenalizacion, getPenaltyInfo,
  ONP, neto, fmt,
} from '../lib/comisiones'
import type { Profile, Venta, Cosecha } from '../types'

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(s: string) {
  const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`
}

function clamp(val: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, val))
}

// ── sub-components ────────────────────────────────────────────────────────────

function MontoRow({ label, value, highlight, negative, small }: {
  label: string; value: string; highlight?: boolean; negative?: boolean; small?: boolean
}) {
  return (
    <div className={`flex justify-between items-center ${small ? 'py-0.5' : 'py-1'}`}>
      <span className={`${small ? 'text-xs text-slate-500' : 'text-sm text-slate-600'}`}>{label}</span>
      <span className={`font-semibold tabular-nums ${highlight ? 'text-blue-700 text-base' : small ? 'text-xs text-slate-700' : 'text-sm text-slate-800'} ${negative ? 'text-red-600' : ''}`}>
        {negative ? '−' : ''}{value}
      </span>
    </div>
  )
}

function PctInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600 shrink-0">{label}</span>
      <div className="flex items-center border border-slate-300 rounded-lg overflow-hidden flex-1">
        <input
          type="number" min={0} max={100} step={0.01}
          value={value}
          onChange={e => onChange(clamp(parseFloat(e.target.value) || 0))}
          className="w-full px-2 py-1.5 text-sm focus:outline-none text-right"
        />
        <span className="px-2 text-xs text-slate-400 bg-slate-50 border-l border-slate-300 shrink-0">%</span>
      </div>
    </div>
  )
}

// ── types ─────────────────────────────────────────────────────────────────────

interface PeriodoData {
  periodo: string
  ventas: Venta[]
  cosecha: Cosecha | null
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function Comisiones() {
  const { profile } = useAuth()

  // Admin: selector de vendedor
  const [vendedores, setVendedores] = useState<Profile[]>([])
  const [targetId, setTargetId] = useState<string>('')
  const [target, setTarget] = useState<Profile | null>(null)

  // Data de las 3 cosechas
  const [data, setData] = useState<[PeriodoData, PeriodoData, PeriodoData] | null>(null)
  const [loading, setLoading] = useState(true)

  // Campos editables: pct_boleta y no_pago_count por periodo
  const [pcts, setPcts] = useState<Record<string, { pct: number; noPago: number }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  // Historial
  const [showHistorial, setShowHistorial] = useState(false)
  const [historial, setHistorial] = useState<(Cosecha & { ventas_count?: number })[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  // ── carga inicial ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!profile) return
    if (profile.role === 'admin') {
      loadVendedores()
    } else {
      setTargetId(profile.id)
      setTarget(profile)
    }
  }, [profile])

  async function loadVendedores() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setVendedores(data ?? [])
    if (data && data.length > 0) {
      setTargetId(data[0].id)
      setTarget(data[0])
    }
  }

  function handleSelectVendedor(id: string) {
    const v = vendedores.find(x => x.id === id)
    setTargetId(id)
    setTarget(v ?? null)
  }

  // ── carga de datos ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!targetId) return
    setLoading(true)

    const p0 = getCurrentPeriodo()
    const p1 = shiftPeriodo(p0, 1)
    const p2 = shiftPeriodo(p0, 2)
    const periodos = [p0, p1, p2]

    // Cargar ventas de los 3 períodos en paralelo
    const ventasPromises = periodos.map(p => {
      const { start, end } = getPeriodoDates(p)
      return supabase.from('ventas').select('*')
        .eq('vendedor_id', targetId)
        .gte('fecha_instalacion', start)
        .lte('fecha_instalacion', end)
        .order('fecha_instalacion', { ascending: true })
        .then(r => r.data ?? [])
    })

    // Cargar cosechas guardadas
    const cosechasPromise = supabase.from('cosechas').select('*')
      .eq('vendedor_id', targetId)
      .in('periodo', periodos)
      .then(r => r.data ?? [])

    const [v0, v1, v2, cosechasArr] = await Promise.all([...ventasPromises, cosechasPromise]) as [Venta[], Venta[], Venta[], Cosecha[]]

    const cosechaMap: Record<string, Cosecha> = {}
    cosechasArr.forEach(c => { cosechaMap[c.periodo] = c })

    const newData: [PeriodoData, PeriodoData, PeriodoData] = [
      { periodo: p0, ventas: v0, cosecha: cosechaMap[p0] ?? null },
      { periodo: p1, ventas: v1, cosecha: cosechaMap[p1] ?? null },
      { periodo: p2, ventas: v2, cosecha: cosechaMap[p2] ?? null },
    ]

    setData(newData)

    // Inicializar estado editable con lo que hay en DB (o defaults)
    const newPcts: Record<string, { pct: number; noPago: number }> = {}
    newData.forEach(({ periodo, cosecha }) => {
      const idx = periodos.indexOf(periodo)
      const pctKey = idx === 0 ? 'pct_boleta_1' : idx === 1 ? 'pct_boleta_2' : 'pct_boleta_3'
      newPcts[periodo] = {
        pct: cosecha ? (cosecha[pctKey as keyof Cosecha] as number) : 100,
        noPago: cosecha?.no_pago_count ?? 0,
      }
    })
    setPcts(newPcts)
    setLoading(false)
  }, [targetId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ── guardar cosecha ─────────────────────────────────────────────────────────

  async function saveCosecha(pd: PeriodoData, anticipo: number, pctIdx: 0 | 1 | 2) {
    if (!targetId || !target) return
    setSaving(s => ({ ...s, [pd.periodo]: true }))

    const scheme = getScheme(target.fecha_ingreso_wow, pd.periodo)
    const n1 = calcNominal1(pd.ventas.length, pd.periodo, scheme)
    const n2 = calcNominal2(pd.ventas)
    const ntotal = n1 + n2
    const { start, end } = getPeriodoDates(pd.periodo)
    const pctVal = pcts[pd.periodo]?.pct ?? 100
    const noPago = pcts[pd.periodo]?.noPago ?? 0

    const row: Partial<Cosecha> & { vendedor_id: string; periodo: string } = {
      vendedor_id: targetId,
      periodo: pd.periodo,
      fecha_inicio: start,
      fecha_fin: end,
      total_ventas: pd.ventas.length,
      nominal_1: n1,
      nominal_2: n2,
      nominal_total: ntotal,
      updated_at: new Date().toISOString(),
    }

    if (pctIdx === 0) row.pct_boleta_1 = pctVal
    if (pctIdx === 1) row.pct_boleta_2 = pctVal
    if (pctIdx === 2) { row.pct_boleta_3 = pctVal; row.no_pago_count = noPago }

    // Mantener valores previos si ya existe
    if (pd.cosecha) {
      if (pctIdx !== 0) row.pct_boleta_1 = pd.cosecha.pct_boleta_1
      if (pctIdx !== 1) row.pct_boleta_2 = pd.cosecha.pct_boleta_2
      if (pctIdx !== 2) row.pct_boleta_3 = pd.cosecha.pct_boleta_3
      if (pctIdx !== 2) row.no_pago_count = pd.cosecha.no_pago_count
    } else {
      if (pctIdx !== 0) row.pct_boleta_1 = 100
      if (pctIdx !== 1) row.pct_boleta_2 = 100
      if (pctIdx !== 2) row.pct_boleta_3 = 100
      if (pctIdx !== 2) row.no_pago_count = 0
    }

    await supabase.from('cosechas').upsert(row, { onConflict: 'vendedor_id,periodo' })
    setSaving(s => ({ ...s, [pd.periodo]: false }))
    loadData()
  }

  // ── historial ───────────────────────────────────────────────────────────────

  async function loadHistorial() {
    if (!targetId) return
    setLoadingHist(true)
    const { data } = await supabase.from('cosechas').select('*')
      .eq('vendedor_id', targetId)
      .order('periodo', { ascending: false })
    setHistorial(data ?? [])
    setLoadingHist(false)
  }

  function openHistorial() {
    setShowHistorial(true)
    loadHistorial()
  }

  // ── cálculo por sección ─────────────────────────────────────────────────────

  function calcSection(pd: PeriodoData, anticipo_pct: number, pctIdx: 0 | 1 | 2) {
    const scheme = target ? getScheme(target.fecha_ingreso_wow, pd.periodo) : 'normal'
    const n1 = calcNominal1(pd.ventas.length, pd.periodo, scheme)
    const n2 = calcNominal2(pd.ventas)
    const ntotal = n1 + n2

    const pctBoleta = (pcts[pd.periodo]?.pct ?? 100) / 100
    const noPago = pcts[pd.periodo]?.noPago ?? 0

    const anticipoBrutoBase = ntotal * anticipo_pct * pctBoleta

    let penalizacion = 0
    if (pctIdx === 2) {
      penalizacion = calcPenalizacion(pd.ventas, noPago, pd.periodo, scheme, anticipoBrutoBase)
    }

    const anticipoBruto = Math.max(0, anticipoBrutoBase - penalizacion)
    const anticipoNeto  = neto(anticipoBruto)

    return { scheme, n1, n2, ntotal, anticipoBruto, anticipoNeto, penalizacion, noPago }
  }

  // ── render ──────────────────────────────────────────────────────────────────

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
      </div>
    )
  }

  const [pd0, pd1, pd2] = data
  const s0 = calcSection(pd0, 0.40, 0)
  const s1 = calcSection(pd1, 0.30, 1)
  const s2 = calcSection(pd2, 0.30, 2)

  const sueldoBruto = s0.anticipoBruto + s1.anticipoBruto + s2.anticipoBruto
  const descuentoOnp = sueldoBruto * ONP
  const sueldoNeto   = sueldoBruto - descuentoOnp

  const { start: start0, end: end0 } = getPeriodoDates(pd0.periodo)
  const { start: start1, end: end1 } = getPeriodoDates(pd1.periodo)
  const { start: start2, end: end2 } = getPeriodoDates(pd2.periodo)

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-4 pb-6">

      {/* Título + selector admin */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-800">Comisiones</h2>
        {profile?.role === 'admin' && (
          <select
            value={targetId}
            onChange={e => handleSelectVendedor(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white max-w-[160px]"
          >
            {vendedores.map(v => (
              <option key={v.id} value={v.id}>{v.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Esquema detectado */}
      {target && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs text-blue-700">
            {target.fecha_ingreso_wow
              ? `Ingresó: ${formatDate(target.fecha_ingreso_wow)}`
              : 'Sin fecha de ingreso WOW'}
          </span>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s0.scheme === 'promotor' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
            {s0.scheme === 'promotor' ? 'Nuevo promotor' : 'Esquema normal'}
          </span>
        </div>
      )}

      {/* ── COSECHA ACTUAL ─────────────────────────────────────────────── */}
      <CosechaCard
        titulo={`Cosecha actual — ${periodoLabel(pd0.periodo)}`}
        subtitulo={`${formatDate(start0)} al ${formatDate(end0)}`}
        color="blue"
      >
        <MontoRow label="Ventas del período"       value={String(pd0.ventas.length)} />
        <MontoRow label="Comisión Nominal 1"        value={fmt(s0.n1)} small />
        <MontoRow label="Comisión Nominal 2 (planes)" value={fmt(s0.n2)} small />
        <div className="border-t border-slate-100 my-1" />
        <MontoRow label="Comisión Total Nominal"    value={fmt(s0.ntotal)} highlight />
        <MontoRow label="Anticipo 40% bruto"        value={fmt(s0.anticipoBruto)} />
        <MontoRow label="Anticipo 40% neto (−13% ONP)" value={fmt(s0.anticipoNeto)} highlight />
        <div className="mt-3 space-y-2">
          <PctInput label="% boleta 1" value={pcts[pd0.periodo]?.pct ?? 100}
            onChange={v => setPcts(p => ({ ...p, [pd0.periodo]: { ...p[pd0.periodo], pct: v } }))} />
          <SaveButton loading={saving[pd0.periodo]} onClick={() => saveCosecha(pd0, s0.anticipoBruto, 0)} />
        </div>
      </CosechaCard>

      {/* ── COSECHA ANTERIOR ───────────────────────────────────────────── */}
      <CosechaCard
        titulo={`Cosecha anterior — ${periodoLabel(pd1.periodo)}`}
        subtitulo={`${formatDate(start1)} al ${formatDate(end1)}`}
        color="slate"
      >
        <MontoRow label="Ventas del período"     value={String(pd1.ventas.length)} />
        <MontoRow label="Comisión Total Nominal" value={fmt(s1.ntotal)} highlight />
        <MontoRow label="Anticipo 30% bruto"     value={fmt(s1.anticipoBruto)} />
        <MontoRow label="Anticipo 30% neto (−13% ONP)" value={fmt(s1.anticipoNeto)} highlight />
        <div className="mt-3 space-y-2">
          <PctInput label="% boleta 2" value={pcts[pd1.periodo]?.pct ?? 100}
            onChange={v => setPcts(p => ({ ...p, [pd1.periodo]: { ...p[pd1.periodo], pct: v } }))} />
          <SaveButton loading={saving[pd1.periodo]} onClick={() => saveCosecha(pd1, s1.anticipoBruto, 1)} />
        </div>
      </CosechaCard>

      {/* ── COSECHA ANTEPASADA ─────────────────────────────────────────── */}
      <CosechaCard
        titulo={`Cosecha antepasada — ${periodoLabel(pd2.periodo)}`}
        subtitulo={`${formatDate(start2)} al ${formatDate(end2)}`}
        color="slate"
      >
        <MontoRow label="Ventas del período"     value={String(pd2.ventas.length)} />
        <MontoRow label="Comisión Total Nominal" value={fmt(s2.ntotal)} highlight />
        <MontoRow label="Anticipo 30% bruto base" value={fmt(s2.ntotal * 0.30 * ((pcts[pd2.periodo]?.pct ?? 100) / 100))} />
        {s2.penalizacion > 0 && (
          <MontoRow label="Penalización boleta 3" value={fmt(s2.penalizacion)} negative />
        )}
        <MontoRow label="Anticipo 30% bruto neto" value={fmt(s2.anticipoBruto)} />
        <MontoRow label="Anticipo 30% neto (−13% ONP)" value={fmt(s2.anticipoNeto)} highlight />

        {/* Detalle penalización */}
        {pd2.ventas.length > 0 && (pcts[pd2.periodo]?.noPago ?? 0) > 0 && (() => {
          const np = pcts[pd2.periodo]?.noPago ?? 0
          const total = pd2.ventas.length
          const pctNP = np / total
          const { rango, factor } = getPenaltyInfo(pctNP)
          return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-1 space-y-0.5">
              <p className="text-xs text-red-700 font-medium">Penalización activa</p>
              <p className="text-xs text-red-600">% no pago: {(pctNP * 100).toFixed(1)}% → Rango {rango} → Factor {factor}×</p>
              <p className="text-xs text-red-600">Afecta las últimas {np} ventas del período</p>
            </div>
          )
        })()}

        <div className="mt-3 space-y-2">
          <PctInput label="% boleta 3" value={pcts[pd2.periodo]?.pct ?? 100}
            onChange={v => setPcts(p => ({ ...p, [pd2.periodo]: { ...p[pd2.periodo], pct: v } }))} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-600 shrink-0">Clientes que no pagaron</span>
            <input
              type="number" min={0} max={pd2.ventas.length} step={1}
              value={pcts[pd2.periodo]?.noPago ?? 0}
              onChange={e => setPcts(p => ({ ...p, [pd2.periodo]: { ...p[pd2.periodo], noPago: Math.max(0, parseInt(e.target.value) || 0) } }))}
              className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-right"
            />
          </div>
          <SaveButton loading={saving[pd2.periodo]} onClick={() => saveCosecha(pd2, s2.anticipoBruto, 2)} />
        </div>
      </CosechaCard>

      {/* ── SUELDO DEL MES ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-blue-800 to-blue-700 rounded-2xl p-5 text-white shadow-lg">
        <p className="text-sm font-medium text-blue-200 mb-3">Sueldo estimado del mes</p>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-blue-100">Sueldo bruto</span>
            <span className="font-bold text-xl tabular-nums">{fmt(sueldoBruto)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-blue-200">Descuento ONP (13%)</span>
            <span className="text-sm text-blue-200 tabular-nums">−{fmt(descuentoOnp)}</span>
          </div>
          <div className="border-t border-blue-600 pt-2 flex justify-between items-center">
            <span className="font-semibold text-white">Sueldo neto</span>
            <span className="font-bold text-2xl tabular-nums">{fmt(sueldoNeto)}</span>
          </div>
        </div>
      </div>

      {/* Botón historial */}
      <button
        onClick={openHistorial}
        className="w-full border border-slate-300 rounded-xl py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Ver historial de cosechas
      </button>

      {/* ── MODAL HISTORIAL ────────────────────────────────────────────── */}
      {showHistorial && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
              <h3 className="font-bold text-slate-800">Historial de cosechas</h3>
              <button onClick={() => setShowHistorial(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {loadingHist ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700" />
                </div>
              ) : historial.length === 0 ? (
                <p className="text-center text-slate-500 text-sm py-8">Sin cosechas guardadas</p>
              ) : historial.map(c => {
                const { start, end } = getPeriodoDates(c.periodo)
                const scheme = target ? getScheme(target.fecha_ingreso_wow, c.periodo) : 'normal'
                const n1 = calcNominal1(c.total_ventas, c.periodo, scheme)
                const n2 = c.nominal_2
                const ntotal = n1 + n2
                return (
                  <div key={c.id ?? c.periodo} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-slate-800">{periodoLabel(c.periodo)}</p>
                        <p className="text-xs text-slate-500">{formatDate(start)} al {formatDate(end)}</p>
                      </div>
                      <span className="text-sm font-bold text-blue-700 tabular-nums">{fmt(ntotal)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <p className="text-xs text-slate-400">Ventas</p>
                        <p className="font-bold text-slate-700">{c.total_ventas}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <p className="text-xs text-slate-400">Nominal 1</p>
                        <p className="font-bold text-slate-700 text-xs">{fmt(n1)}</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-slate-200">
                        <p className="text-xs text-slate-400">Nominal 2</p>
                        <p className="font-bold text-slate-700 text-xs">{fmt(n2)}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-3 text-xs text-slate-500">
                      <span>Boleta 1: {c.pct_boleta_1}%</span>
                      <span>Boleta 2: {c.pct_boleta_2}%</span>
                      <span>Boleta 3: {c.pct_boleta_3}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FECHA INGRESO WOW ─────────────────────────────────────
          Solo para vendedores sin fecha ingresada */}
      {target && !target.fecha_ingreso_wow && profile?.id === target.id && (
        <FechaIngresoPrompt onSaved={loadData} vendedorId={targetId} />
      )}
    </div>
  )
}

// ── Card de cosecha ───────────────────────────────────────────────────────────

function CosechaCard({ titulo, subtitulo, color, children }: {
  titulo: string; subtitulo: string; color: 'blue' | 'slate'; children: React.ReactNode
}) {
  const border = color === 'blue' ? 'border-blue-200' : 'border-slate-200'
  const header = color === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-200'
  return (
    <div className={`bg-white border ${border} rounded-2xl overflow-hidden shadow-sm`}>
      <div className={`px-4 py-3 border-b ${header}`}>
        <p className="font-semibold text-slate-800 text-sm">{titulo}</p>
        <p className="text-xs text-slate-500">{subtitulo}</p>
      </div>
      <div className="px-4 py-3 space-y-1">{children}</div>
    </div>
  )
}

function SaveButton({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold py-2 rounded-lg transition-colors disabled:opacity-60"
    >
      {loading ? 'Guardando...' : 'Guardar'}
    </button>
  )
}

// ── Prompt para ingresar fecha WOW si falta ───────────────────────────────────

function FechaIngresoPrompt({ vendedorId, onSaved }: { vendedorId: string; onSaved: () => void }) {
  const [fecha, setFecha] = useState('')
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  async function handleSave() {
    if (!fecha) return
    setSaving(true)
    await supabase.from('profiles').update({ fecha_ingreso_wow: fecha }).eq('id', vendedorId)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-amber-800">Configura tu fecha de ingreso a WOW</p>
        <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-600 ml-2 shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-amber-700 mt-1 mb-3">
        Necesaria para detectar si aplica esquema de nuevo promotor (Mes 0 / Mes 1).
      </p>
      <div className="flex gap-2">
        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        />
        <button onClick={handleSave} disabled={!fecha || saving}
          className="bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {saving ? '...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Planes display helper para historial ─────────────────────────────────────
const _PLANES_UNUSED = PLANES // keep import used
void _PLANES_UNUSED
