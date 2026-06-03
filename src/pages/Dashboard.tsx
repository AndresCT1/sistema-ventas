import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Referido, Venta } from '../types'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function today() {
  return new Date().toISOString().split('T')[0]
}

function addDays(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function diffDays(dateStr: string) {
  const d = new Date(dateStr)
  const t = new Date(today())
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [referidosHoy, setReferidosHoy] = useState<Referido[]>([])
  const [referidosProximos, setReferidosProximos] = useState<Referido[]>([])
  const [ventasPorVencer, setVentasPorVencer] = useState<Venta[]>([])
  const [stats, setStats] = useState({ pendientesMes: 0, ventasMes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (profile) loadData()
  }, [profile])

  async function loadData() {
    setLoading(true)
    const isAdmin = profile?.role === 'admin'
    const t = today()
    const in3 = addDays(3)
    const in30 = addDays(30)
    const mesInicio = t.substring(0, 7) + '-01'
    const mesFin = addDays(31).substring(0, 7) + '-01'

    const refQuery = supabase.from('referidos').select('*')
    const ventQuery = supabase.from('ventas').select('*')

    if (!isAdmin) {
      refQuery.eq('vendedor_id', profile!.id)
      ventQuery.eq('vendedor_id', profile!.id)
    }

    const [refHoyRes, refProxRes, ventVencerRes, refPendRes, ventMesRes] = await Promise.all([
      supabase.from('referidos').select('*')
        .eq('fecha_llamada', t)
        .eq('estado', 'pendiente')
        .then(q => isAdmin ? q : { ...q, data: q.data }),
      supabase.from('referidos').select('*')
        .gt('fecha_llamada', t)
        .lte('fecha_llamada', in3)
        .eq('estado', 'pendiente'),
      supabase.from('ventas').select('*')
        .gte('fecha_renovacion', t)
        .lte('fecha_renovacion', in30),
      supabase.from('referidos').select('id', { count: 'exact' })
        .eq('estado', 'pendiente')
        .gte('created_at', mesInicio),
      supabase.from('ventas').select('id', { count: 'exact' })
        .gte('created_at', mesInicio)
        .lt('created_at', mesFin),
    ])

    // Apply vendedor filter manually for non-admins
    function filterByVendedor<T extends { vendedor_id: string }>(items: T[] | null) {
      if (isAdmin || !profile) return items ?? []
      return (items ?? []).filter(i => i.vendedor_id === profile.id)
    }

    setReferidosHoy(filterByVendedor(refHoyRes.data))
    setReferidosProximos(filterByVendedor(refProxRes.data))
    setVentasPorVencer(filterByVendedor(ventVencerRes.data))
    setStats({
      pendientesMes: refPendRes.count ?? 0,
      ventasMes: ventMesRes.count ?? 0,
    })
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700" />
    </div>
  )

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
      <div>
        <h2 className="text-lg font-bold text-slate-800">Hola, {profile?.full_name?.split(' ')[0]} 👋</h2>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-blue-700">{stats.pendientesMes}</p>
          <p className="text-xs text-slate-500 mt-1">Referidos pendientes este mes</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-green-600">{stats.ventasMes}</p>
          <p className="text-xs text-slate-500 mt-1">Ventas registradas este mes</p>
        </div>
      </div>

      {/* Llamadas de HOY */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <h3 className="font-bold text-slate-800">Llamar HOY</h3>
          {referidosHoy.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{referidosHoy.length}</span>
          )}
        </div>
        {referidosHoy.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center text-sm text-green-700">
            Sin llamadas pendientes para hoy
          </div>
        ) : (
          <div className="space-y-2">
            {referidosHoy.map(r => (
              <div
                key={r.id}
                onClick={() => navigate('/referidos')}
                className="bg-red-50 border border-red-200 rounded-xl p-4 cursor-pointer hover:bg-red-100 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{r.nombre}</p>
                    <p className="text-sm text-slate-600">{r.telefono}</p>
                    {r.notas && <p className="text-xs text-slate-500 mt-1 italic">{r.notas}</p>}
                  </div>
                  <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-2">HOY</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Próximos 3 días */}
      {referidosProximos.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-slate-800">Próximos 3 días</h3>
            <span className="bg-orange-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">{referidosProximos.length}</span>
          </div>
          <div className="space-y-2">
            {referidosProximos.map(r => {
              const diff = diffDays(r.fecha_llamada)
              return (
                <div
                  key={r.id}
                  onClick={() => navigate('/referidos')}
                  className="bg-orange-50 border border-orange-200 rounded-xl p-4 cursor-pointer hover:bg-orange-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{r.nombre}</p>
                      <p className="text-sm text-slate-600">{r.telefono}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDate(r.fecha_llamada)}</p>
                    </div>
                    <span className="bg-orange-400 text-white text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-2">
                      {diff === 1 ? 'Mañana' : `En ${diff} días`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Contratos por vencer */}
      {ventasPorVencer.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold text-slate-800">Contratos por vencer</h3>
            <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{ventasPorVencer.length}</span>
          </div>
          <div className="space-y-2">
            {ventasPorVencer.map(v => {
              const diff = diffDays(v.fecha_renovacion)
              return (
                <div
                  key={v.id}
                  onClick={() => navigate('/ventas')}
                  className="bg-amber-50 border border-amber-200 rounded-xl p-4 cursor-pointer hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{v.cliente_nombre}</p>
                      <p className="text-sm text-slate-600">{v.cliente_telefono}</p>
                      <p className="text-xs text-slate-500 mt-0.5">Vence: {formatDate(v.fecha_renovacion)}</p>
                    </div>
                    <span className={`text-white text-xs px-2 py-1 rounded-full font-medium shrink-0 ml-2 ${diff <= 7 ? 'bg-red-500' : 'bg-amber-500'}`}>
                      {diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${diff} días`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
