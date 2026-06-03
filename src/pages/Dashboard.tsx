import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Referido, Venta } from '../types'

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  return `${d}/${m}/${y}`
}

function today() { return new Date().toISOString().split('T')[0] }

function addDays(days: number) {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function diffDays(dateStr: string) {
  const d = new Date(dateStr), t = new Date(today())
  return Math.round((d.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
}

function SectionHeader({ icon, label, count, color }: { icon: string; label: string; count?: number; color: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-lg">{icon}</span>
      <h3 className="font-bold text-[#1A1A2E]">{label}</h3>
      {count !== undefined && count > 0 && (
        <span className="text-xs font-bold text-white px-2 py-0.5 rounded-full" style={{ background: color }}>
          {count}
        </span>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [referidosHoy,     setReferidosHoy]     = useState<Referido[]>([])
  const [referidosProximos,setReferidosProximos] = useState<Referido[]>([])
  const [ventasPorVencer,  setVentasPorVencer]   = useState<Venta[]>([])
  const [stats, setStats] = useState({ pendientesMes: 0, ventasMes: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile) loadData() }, [profile])

  async function loadData() {
    setLoading(true)
    const isAdmin = profile?.role === 'admin'
    const t = today(), in3 = addDays(3), in30 = addDays(30)
    const mesInicio = t.substring(0, 7) + '-01'
    const mesFin    = addDays(31).substring(0, 7) + '-01'

    const [refHoyRes, refProxRes, ventVencerRes, refPendRes, ventMesRes] = await Promise.all([
      supabase.from('referidos').select('*').eq('fecha_llamada', t).eq('estado', 'pendiente'),
      supabase.from('referidos').select('*').gt('fecha_llamada', t).lte('fecha_llamada', in3).eq('estado', 'pendiente'),
      supabase.from('ventas').select('*').gte('fecha_renovacion', t).lte('fecha_renovacion', in30),
      supabase.from('referidos').select('id', { count: 'exact' }).eq('estado', 'pendiente').gte('created_at', mesInicio),
      supabase.from('ventas').select('id', { count: 'exact' }).gte('created_at', mesInicio).lt('created_at', mesFin),
    ])

    function filterV<T extends { vendedor_id: string }>(items: T[] | null) {
      if (isAdmin || !profile) return items ?? []
      return (items ?? []).filter(i => i.vendedor_id === profile.id)
    }

    setReferidosHoy(filterV(refHoyRes.data))
    setReferidosProximos(filterV(refProxRes.data))
    setVentasPorVencer(filterV(ventVencerRes.data))
    setStats({ pendientesMes: refPendRes.count ?? 0, ventasMes: ventMesRes.count ?? 0 })
    setLoading(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#FF6B00]" />
    </div>
  )

  const fechaHoy = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">

      {/* Saludo */}
      <div>
        <h2 className="text-2xl font-extrabold text-[#1A1A2E]">
          Hola, {profile?.full_name?.split(' ')[0]} 👋
        </h2>
        <p className="text-sm text-slate-500 mt-0.5 capitalize">{fechaHoy}</p>
      </div>

      {/* 3 tarjetas resumen */}
      <div className="space-y-3">

        {/* Naranja — llamadas hoy */}
        <div
          onClick={() => navigate('/referidos')}
          className="rounded-xl p-4 cursor-pointer flex items-center gap-4 transition-all duration-200 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #FF6B00, #FF8C38)', boxShadow: '0 4px 16px rgba(255,107,0,0.3)' }}
        >
          <div className="w-12 h-12 bg-white/25 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-2xl">📞</span>
          </div>
          <div className="flex-1">
            <p className="text-3xl font-extrabold text-white leading-none">{referidosHoy.length}</p>
            <p className="text-sm text-white/90 font-medium mt-0.5">Llamadas pendientes hoy</p>
          </div>
          <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>

        {/* Morado — contratos por vencer */}
        <div
          onClick={() => navigate('/ventas')}
          className="rounded-xl p-4 cursor-pointer flex items-center gap-4 transition-all duration-200 active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #7C3AED, #9B59F5)', boxShadow: '0 4px 16px rgba(124,58,237,0.25)' }}
        >
          <div className="w-12 h-12 bg-white/25 rounded-xl flex items-center justify-center shrink-0">
            <span className="text-2xl">⚠️</span>
          </div>
          <div className="flex-1">
            <p className="text-3xl font-extrabold text-white leading-none">{ventasPorVencer.length}</p>
            <p className="text-sm text-white/90 font-medium mt-0.5">Contratos por vencer (30d)</p>
          </div>
          <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>

        {/* Blanco — ventas del mes */}
        <div
          className="rounded-xl p-4 bg-white flex items-center gap-4 transition-all duration-200"
          style={{ borderLeft: '4px solid #FF6B00', boxShadow: '0 2px 10px rgba(0,0,0,0.06)' }}
        >
          <div className="w-12 h-12 bg-[#FFF3EA] rounded-xl flex items-center justify-center shrink-0">
            <span className="text-2xl">📋</span>
          </div>
          <div className="flex-1">
            <p className="text-3xl font-extrabold text-[#1A1A2E] leading-none">{stats.ventasMes}</p>
            <p className="text-sm text-slate-500 mt-0.5">Ventas registradas este mes</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold text-[#FF6B00]">{stats.pendientesMes}</p>
            <p className="text-[10px] text-slate-400">referidos</p>
          </div>
        </div>
      </div>

      {/* Llamadas HOY — detalle */}
      {referidosHoy.length > 0 && (
        <section>
          <SectionHeader icon="📞" label="Llamar HOY" count={referidosHoy.length} color="#FF6B00" />
          <div className="space-y-2">
            {referidosHoy.map(r => (
              <div key={r.id} onClick={() => navigate('/referidos')}
                className="bg-white rounded-xl p-4 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                style={{ borderLeft: '4px solid #FF6B00', boxShadow: '0 2px 8px rgba(255,107,0,0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#1A1A2E]">{r.nombre}</p>
                    <p className="text-sm text-slate-500">{r.telefono}</p>
                  </div>
                  <span className="text-xs font-bold text-white px-2 py-1 rounded-full" style={{ background: '#FF6B00' }}>HOY</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Próximos 3 días */}
      {referidosProximos.length > 0 && (
        <section>
          <SectionHeader icon="🗓️" label="Próximos 3 días" count={referidosProximos.length} color="#7C3AED" />
          <div className="space-y-2">
            {referidosProximos.map(r => {
              const diff = diffDays(r.fecha_llamada)
              return (
                <div key={r.id} onClick={() => navigate('/referidos')}
                  className="bg-white rounded-xl p-4 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  style={{ borderLeft: '4px solid #7C3AED', boxShadow: '0 2px 8px rgba(124,58,237,0.08)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1A1A2E]">{r.nombre}</p>
                      <p className="text-sm text-slate-500">{r.telefono} · {formatDate(r.fecha_llamada)}</p>
                    </div>
                    <span className="text-xs font-bold text-white px-2 py-1 rounded-full" style={{ background: '#7C3AED' }}>
                      {diff === 1 ? 'Mañana' : `${diff}d`}
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
          <SectionHeader icon="⚠️" label="Contratos por vencer" count={ventasPorVencer.length} color="#E05A00" />
          <div className="space-y-2">
            {ventasPorVencer.map(v => {
              const diff = diffDays(v.fecha_renovacion)
              return (
                <div key={v.id} onClick={() => navigate('/ventas')}
                  className="bg-white rounded-xl p-4 cursor-pointer transition-all duration-200 active:scale-[0.98]"
                  style={{ borderLeft: `4px solid ${diff <= 7 ? '#EF4444' : '#FF6B00'}`, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-[#1A1A2E]">{v.cliente_nombre}</p>
                      <p className="text-sm text-slate-500">Vence: {formatDate(v.fecha_renovacion)}</p>
                    </div>
                    <span className={`text-xs font-bold text-white px-2 py-1 rounded-full`}
                      style={{ background: diff <= 7 ? '#EF4444' : '#FF6B00' }}>
                      {diff === 0 ? 'Hoy' : diff === 1 ? 'Mañana' : `${diff}d`}
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
