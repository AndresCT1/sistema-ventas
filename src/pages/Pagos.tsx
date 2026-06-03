import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { getFacturaActiva, estadoFactura } from '../lib/facturas'
import BoletaModal from '../components/BoletaModal'
import type { Venta } from '../types'

type FiltroF  = 'todas' | '1' | '2' | '3'
type FiltroEs = 'todos' | 'pagado' | 'no_pago' | 'sin_verificar'
type EstadoF  = 'sin_verificar' | 'pagado' | 'no_pago'

function formatDate(s: string) { const [y,m,d]=s.split('-'); return `${d}/${m}/${y}` }

function BadgeEstado({ estado }: { estado?: string | null }) {
  const e = (estado ?? 'sin_verificar') as EstadoF
  const styles: Record<EstadoF, { bg: string; text: string; label: string }> = {
    pagado:        { bg: '#D1FAE5', text: '#059669', label: 'Pagado' },
    no_pago:       { bg: '#FEE2E2', text: '#DC2626', label: 'No pagó' },
    sin_verificar: { bg: '#F1F5F9', text: '#94A3B8', label: 'Sin verif.' },
  }
  const s = styles[e]
  return (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.text }}>
      {s.label}
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

  function count(fnum: 1|2|3, est: EstadoF) {
    return ventas.filter(v => estadoFactura(v as unknown as Record<string,unknown>, fnum) === est).length
  }
  function pctPago(fnum: 1|2|3) {
    if (!ventas.length) return 0
    return Math.round((ventas.filter(v => estadoFactura(v as unknown as Record<string,unknown>, fnum) === 'pagado').length / ventas.length) * 100)
  }

  const filtered = ventas.filter(v => {
    const activa = getFacturaActiva(v.fecha_inicio, today)
    if (filtroF !== 'todas' && activa !== Number(filtroF)) return false
    if (filtroEs !== 'todos') {
      const fnum = (filtroF !== 'todas' ? Number(filtroF) : activa) as 1|2|3|null
      if (!fnum) return filtroEs === 'sin_verificar'
      if (estadoFactura(v as unknown as Record<string,unknown>, fnum) !== filtroEs) return false
    }
    return true
  })

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00]" />
    </div>
  )

  return (
    <div className="px-4 py-5 max-w-lg mx-auto space-y-5 pb-6">

      <h2 className="text-xl font-extrabold text-[#1A1A2E] border-b-2 border-[#FF6B00] pb-1 inline-block">Pagos</h2>

      {/* Resumen global */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
        <div className="px-4 py-3" style={{ background: 'linear-gradient(to right, #FF6B00, #FF8C38)' }}>
          <p className="text-sm font-bold text-white">Resumen global</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '2px solid #FFF3EA' }}>
                <th className="text-left px-4 py-2.5 text-xs font-bold text-[#FF6B00] w-24"></th>
                <th className="px-3 py-2.5 text-xs font-bold text-center text-green-600">Pagado</th>
                <th className="px-3 py-2.5 text-xs font-bold text-center text-red-500">No pagó</th>
                <th className="px-3 py-2.5 text-xs font-bold text-center text-slate-400">Sin verif.</th>
              </tr>
            </thead>
            <tbody>
              {([1,2,3] as const).map(n => (
                <tr key={n} style={{ borderBottom: '1px solid #F8F7FF' }}>
                  <td className="px-4 py-2.5 text-xs font-bold" style={{ color: '#FF6B00' }}>Factura {n}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-green-600">{count(n,'pagado')}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-red-500">{count(n,'no_pago')}</td>
                  <td className="px-3 py-2.5 text-center font-bold text-slate-400">{count(n,'sin_verificar')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* % de pago */}
        <div className="px-4 py-3 grid grid-cols-3 gap-3" style={{ background: '#FFF9F5' }}>
          {([1,2,3] as const).map(n => {
            const pct = pctPago(n)
            const color = pct >= 84 ? '#059669' : pct >= 70 ? '#D97706' : '#DC2626'
            return (
              <div key={n} className="text-center">
                <p className="text-xs text-slate-500">% pago F{n}</p>
                <p className="text-xl font-extrabold" style={{ color }}>{pct}%</p>
                <p className="text-[9px] text-slate-400">para comisiones</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['todas','1','2','3'] as FiltroF[]).map(f => (
            <button key={f} onClick={() => setFiltroF(f)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full font-semibold border transition-all duration-200"
              style={filtroF === f ? { background:'#FF6B00', color:'#fff', borderColor:'#FF6B00' } : { background:'#fff', color:'#64748B', borderColor:'#E2E8F0' }}>
              {f === 'todas' ? 'Todas' : `Factura ${f}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {(['todos','pagado','no_pago','sin_verificar'] as FiltroEs[]).map(e => (
            <button key={e} onClick={() => setFiltroEs(e)}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full font-semibold border transition-all duration-200"
              style={filtroEs === e ? { background:'#1A1A2E', color:'#fff', borderColor:'#1A1A2E' } : { background:'#fff', color:'#64748B', borderColor:'#E2E8F0' }}>
              {e === 'todos' ? 'Todos' : e === 'pagado' ? 'Pagado' : e === 'no_pago' ? 'No pagó' : 'Sin verificar'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No hay clientes con ese filtro</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(v => {
            const activa = getFacturaActiva(v.fecha_inicio, today)
            return (
              <div key={v.id} className="bg-white rounded-xl p-4 transition-all"
                style={{ borderLeft: '4px solid #FF6B00', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="mb-3">
                  <p className="font-bold text-[#1A1A2E]">{v.cliente_nombre}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Instalación: {formatDate(v.fecha_inicio)}</p>
                  {activa ? (
                    <p className="text-xs font-semibold mt-0.5" style={{ color: '#FF6B00' }}>Factura activa: F{activa}</p>
                  ) : (
                    <p className="text-xs text-slate-400 mt-0.5">Sin factura activa</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {([1,2,3] as const).map(n => (
                      <span key={n} className="flex items-center gap-1">
                        <span className="text-[10px] font-bold" style={{ color: activa === n ? '#FF6B00' : '#94A3B8' }}>F{n}</span>
                        <BadgeEstado estado={estadoFactura(v as unknown as Record<string,unknown>, n)} />
                      </span>
                    ))}
                  </div>
                </div>
                <button onClick={() => setShowBoleta(v)}
                  className="w-full text-white font-bold text-sm py-2.5 rounded-lg transition-all duration-200 active:scale-[0.98]"
                  style={{ background: '#FF6B00' }}>
                  Ver boleta
                </button>
              </div>
            )
          })}
        </div>
      )}

      {showBoleta && <BoletaModal venta={showBoleta} onClose={() => setShowBoleta(null)} onSaved={loadVentas} />}
    </div>
  )
}
