import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getFacturas, getFacturaActiva, facturaPeriodoLabel } from '../lib/facturas'
import type { Venta } from '../types'

const WOW_URL = 'https://wowperu.pe/pagar-boleta/'

async function copyToClipboard(text: string) {
  try { await navigator.clipboard.writeText(text) } catch {
    const el = document.createElement('textarea')
    el.value = text; document.body.appendChild(el); el.select()
    document.execCommand('copy'); document.body.removeChild(el)
  }
}

interface BoletaModalProps {
  venta: Venta
  onClose: () => void
  onSaved: () => void
}

export default function BoletaModal({ venta, onClose, onSaved }: BoletaModalProps) {
  const today       = new Date().toISOString().split('T')[0]
  const facturas    = getFacturas(venta.fecha_inicio)
  const activaNum   = getFacturaActiva(venta.fecha_inicio, today)
  const facturaActiva = activaNum ? facturas[activaNum - 1] : null

  const [iframeState, setIframeState]   = useState<'loading'|'loaded'|'blocked'>('loading')
  const [saving, setSaving]             = useState(false)
  const [showManual, setShowManual]     = useState(false)
  const [manualF, setManualF]           = useState<1|2|3>(activaNum ?? 1)

  // Timeout para detectar iframe bloqueado
  useEffect(() => {
    const t = setTimeout(() => setIframeState(s => s === 'loading' ? 'blocked' : s), 5000)
    return () => clearTimeout(t)
  }, [])

  // Copiar código al montar
  useEffect(() => { copyToClipboard(venta.codigo_pago) }, [venta.codigo_pago])

  async function guardar(factura: 1|2|3, estado: 'pagado'|'no_pago') {
    setSaving(true)
    await supabase.from('ventas').update({
      [`estado_f${factura}`]:              estado,
      [`fecha_verificacion_f${factura}`]:  new Date().toISOString(),
    }).eq('id', venta.id)
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">

      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-800 truncate text-sm">{venta.cliente_nombre}</p>
          <p className="text-xs text-slate-500">Verificar boleta</p>
        </div>
      </div>

      {/* Código copiado */}
      <div className="shrink-0 bg-violet-50 border-b border-violet-200 px-4 py-3 flex items-start gap-2.5">
        <svg className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 3l2 2 4-4" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-violet-800">Código copiado: {venta.codigo_pago}</p>
          <p className="text-xs text-violet-600 mt-0.5">Pégalo en el campo de la página</p>
        </div>
      </div>

      {/* Iframe */}
      <div className="flex-1 relative overflow-hidden">
        {iframeState === 'loading' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-50 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-700" />
            <p className="text-xs text-slate-500">Cargando página...</p>
          </div>
        )}
        {iframeState !== 'blocked' && (
          <iframe src={WOW_URL} title="Pagar boleta WOW"
            className={`w-full h-full border-0 ${iframeState === 'loading' ? 'invisible' : 'visible'}`}
            onLoad={() => setIframeState('loaded')} />
        )}
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
            <a href={WOW_URL} target="_blank" rel="noreferrer"
              className="bg-violet-700 hover:bg-violet-800 text-white font-bold px-8 py-4 rounded-2xl text-sm flex items-center gap-2.5 shadow-lg shadow-violet-200 active:scale-95 transition-all">
              Abrir página de WOW
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}
      </div>

      {/* Botones de pago */}
      <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 space-y-3">

        {/* Factura activa */}
        {facturaActiva ? (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Factura activa: Factura {facturaActiva.numero} · {facturaPeriodoLabel(facturaActiva)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => guardar(facturaActiva.numero, 'pagado')} disabled={saving}
                className="bg-green-600 hover:bg-green-700 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Pagó
              </button>
              <button onClick={() => guardar(facturaActiva.numero, 'no_pago')} disabled={saving}
                className="bg-red-500 hover:bg-red-600 active:scale-95 text-white font-bold py-3.5 rounded-xl text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                No pagó
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center">No hay factura activa para este contrato hoy</p>
        )}

        {/* Selector manual */}
        <div>
          <button onClick={() => setShowManual(s => !s)}
            className="text-xs text-violet-600 font-medium flex items-center gap-1">
            <svg className={`w-3.5 h-3.5 transition-transform ${showManual ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Actualizar otra factura
          </button>
          {showManual && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                {([1,2,3] as const).map(n => (
                  <button key={n} onClick={() => setManualF(n)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                      manualF === n ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-slate-600 border-slate-300'
                    }`}>
                    F{n}
                    <span className="block text-[10px] font-normal opacity-70">
                      {facturaPeriodoLabel(facturas[n - 1])}
                    </span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => guardar(manualF, 'pagado')} disabled={saving}
                  className="bg-green-600 text-white font-semibold py-2.5 rounded-lg text-xs disabled:opacity-60">
                  ✓ Pagó F{manualF}
                </button>
                <button onClick={() => guardar(manualF, 'no_pago')} disabled={saving}
                  className="bg-red-500 text-white font-semibold py-2.5 rounded-lg text-xs disabled:opacity-60">
                  ✗ No pagó F{manualF}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
