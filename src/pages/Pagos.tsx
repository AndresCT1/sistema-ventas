import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getFacturaActiva, estadoFactura } from '../lib/facturas'
import BoletaModal from '../components/BoletaModal'
import type { Venta } from '../types'

type FiltroF  = 'todas' | '1' | '2' | '3'
type FiltroEs = 'todos' | 'pagado' | 'no_pago' | 'sin_verificar'
type EstadoF  = 'sin_verificar' | 'pagado' | 'no_pago'

const ESTADO_LABEL: Record<EstadoF, string> = {
  sin_verificar: 'Sin verif.',
  pagado:        'Pagado',
  no_pago:       'No pagó',
}

function formatDate(s: string) {
  const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`
}

function BadgeEstado({ estado }: { estado?: string | null }) {
  const e = (estado ?? 'sin_verificar') as EstadoF
  const cls = e === 'pagado'   ? 'bg-green-100 text-green-700'
            : e === 'no_pago'  ? 'bg-red-100 text-red-600'
            : 'bg-slate-100 text-slate-500'
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${cls}`}>
      {ESTADO_LABEL[e]}
    </span>
  )
}

export default function Pagos() {
  const { profile } = useAuth()
  const [ventas, setVentas]         = useState<Venta[]>([])
  const [loading, setLoading]       = useState(true)
  const [filtroF, setFiltroF]       = useState<FiltroF>('todas')
  const [filtroEs, setFiltroEs]     = useState<FiltroEs>('todos')
  const [showBoleta, setShowBoleta] = useState<Venta | null>(null)

  const today = new Date().toISOString().split('T')[0]

  const loadVentas = useCallback(async () => {
    setLoading(true)
    const query = supabase.from('ventas').select('*').order('fecha_inicio', { ascending: false })
    if (profile?.role !== 'admin') query.eq('vendedor_id', profile!.id)
    const { data } = await query
    setVentas(data ?? [])
    setLoading(false)
  }, [profile])

  useEffect(() => { if (profile) loadVentas() }, [profile, loadVentas])

  // ── Resumen global ──────────────────────────────────────────────────────────
  function countEstado(fnum: 1|2|3, est: EstadoF) {
    return ventas.filter(v => estadoFactura(v as unknown as Record<string, unknown>, fnum) === est).length
  }
  function pctPago(fnum: 1|2|3) {
    if (!ventas.length) return 0
    const pagados = ventas.filter(v => estadoFactura(v as unknown as Record<string, unknown>, fnum) === 'pagado').length
    return Math.round((pagados / ventas.length) * 100)
  }

  // ── Filtrado ────────────────────────────────────────────────────────────────
  const filtered = ventas.filter(v => {
    const activa = getFacturaActiva(v.fecha_inicio, today)

    if (filtroF !== 'todas') {
      if (activa !== Number(filtroF)) return false
    }

    if (filtroEs !== 'todos') {
      const fnum = (filtroF !== 'todas' ? Number(filtroF) : activa) as 1|2|3|null
      if (!fnum) return filtroEs === 'sin_verificar'
      if (estadoFactura(v as unknown as Record<string, unknown>, fnum) !== filtroEs) return false
    }

    return true
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-violet-700" />
    </div>
  )

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5 pb-6">
      <h2 className="text-lg font-bold text-slate-800">Pagos</h2>

      {/* Resumen global */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100">
          <p className="text-sm font-semibold text-violet-800">Resumen global</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 w-24"></th>
                <th className="px-3 py-2.5 text-xs font-semibold text-green-600 text-center">Pagado</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-red-500 text-center">No pagó</th>
                <th className="px-3 py-2.5 text-xs font-semibold text-slate-400 text-center">Sin verif.</th>
              </tr>
            </thead>
            <tbody>
              {([1,2,3] as const).map(n => (
                <tr key={n} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">Factura {n}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm font-bold text-green-600">{countEstado(n,'pagado')}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm font-bold text-red-500">{countEstado(n,'no_pago')}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-sm font-bold text-slate-400">{countEstado(n,'sin_verificar')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* % de pago */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 grid grid-cols-3 gap-3">
          {([1,2,3] as const).map(n => (
            <div key={n} className="text-center">
              <p className="text-xs text-slate-500">% pago F{n}</p>
              <p className={`text-lg font-bold ${pctPago(n) >= 84 ? 'text-green-600' : pctPago(n) >= 70 ? 'text-amber-500' : 'text-red-500'}`}>
                {pctPago(n)}%
              </p>
              <p className="text-[10px] text-slate-400">dato para comisiones</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['todas','1','2','3'] as FiltroF[]).map(f => (
            <button key={f} onClick={() => setFiltroF(f)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filtroF === f ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-slate-600 border-slate-300'
              }`}>
              {f === 'todas' ? 'Todas' : `Factura ${f}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['todos','pagado','no_pago','sin_verificar'] as FiltroEs[]).map(e => (
            <button key={e} onClick={() => setFiltroEs(e)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                filtroEs === e ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300'
              }`}>
              {e === 'todos' ? 'Todos' : e === 'pagado' ? 'Pagado' : e === 'no_pago' ? 'No pagó' : 'Sin verificar'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de clientes */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-500 text-sm">
          No hay clientes con ese filtro
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const activa = getFacturaActiva(v.fecha_inicio, today)
            return (
              <div key={v.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{v.cliente_nombre}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Instalación: {formatDate(v.fecha_inicio)}
                    </p>
                    {activa ? (
                      <p className="text-xs text-violet-600 font-medium mt-0.5">Factura activa: F{activa}</p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-0.5">Sin factura activa</p>
                    )}

                    {/* Badges F1/F2/F3 */}
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {([1,2,3] as const).map(n => {
                        const est = estadoFactura(v as unknown as Record<string,unknown>, n)
                        return (
                          <span key={n} className="flex items-center gap-1">
                            <span className={`text-[10px] font-bold ${activa === n ? 'text-violet-700' : 'text-slate-400'}`}>F{n}</span>
                            <BadgeEstado estado={est} />
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <button onClick={() => setShowBoleta(v)}
                    className="w-full bg-violet-50 hover:bg-violet-100 text-violet-700 font-semibold text-sm py-2 rounded-lg transition-colors">
                    Ver boleta
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Ver Boleta */}
      {showBoleta && (
        <BoletaModal venta={showBoleta} onClose={() => setShowBoleta(null)} onSaved={loadVentas} />
      )}
    </div>
  )
}
