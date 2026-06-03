import type { Venta } from '../types'

// ── Planes ──────────────────────────────────────────────────────────────────
export const PLANES = [
  { precio: 64.90,  descripcion: 'S/ 64.90 - Internet 300 Mbps',               incentivo: 0  },
  { precio: 69.90,  descripcion: 'S/ 69.90 - Internet 300 Mbps + DGO',         incentivo: 0  },
  { precio: 74.90,  descripcion: 'S/ 74.90 - Internet 500 Mbps + DGO',         incentivo: 0  },
  { precio: 79.90,  descripcion: 'S/ 79.90 - Internet 1000 Mbps + DGO',        incentivo: 30 },
  { precio: 94.90,  descripcion: 'S/ 94.90 - Internet 1000 Mbps + DGO Familia',incentivo: 45 },
  { precio: 133.90, descripcion: 'S/ 133.90 - Internet 1000 Mbps + DGO Full',  incentivo: 48 },
]

export function getPlanByPrecio(precio: number | null | undefined) {
  if (!precio) return null
  return PLANES.find(p => Math.abs(p.precio - precio) < 0.01) ?? null
}

// ── Períodos ─────────────────────────────────────────────────────────────────
// El período se nombra por el mes de FIN.
// "2026-05" = cosecha Mayo = del 23 abr al 22 may.

export function getPeriodoDates(periodo: string): { start: string; end: string } {
  const [y, m] = periodo.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return {
    start: `${py}-${String(pm).padStart(2, '0')}-23`,
    end:   `${periodo}-22`,
  }
}

export function shiftPeriodo(periodo: string, months: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1 - months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function periodoShort(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const s = d.toLocaleDateString('es', { month: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Esquema ──────────────────────────────────────────────────────────────────
export function getScheme(fechaIngreso: string | null | undefined, periodo: string): 'normal' | 'promotor' {
  if (!fechaIngreso) return 'normal'
  const [iy, im] = fechaIngreso.substring(0, 7).split('-').map(Number)
  const [py, pm] = periodo.split('-').map(Number)
  const diff = (py - iy) * 12 + (pm - im)
  return diff === 0 || diff === 1 ? 'promotor' : 'normal'
}

// ── Tramos — siempre esquema abril 2026 en adelante ──────────────────────────
interface Tier { from: number; to: number; rate: number }

function getTiers(scheme: 'normal' | 'promotor'): Tier[] {
  if (scheme === 'normal') {
    return [
      { from: 1,  to: 5,    rate: 0   },
      { from: 6,  to: 7,    rate: 58  },
      { from: 8,  to: 9,    rate: 105 },
      { from: 10, to: 30,   rate: 142 },
      { from: 31, to: 9999, rate: 105 },
    ]
  }
  return [
    { from: 1,  to: 3,    rate: 48  },
    { from: 4,  to: 7,    rate: 58  },
    { from: 8,  to: 9,    rate: 105 },
    { from: 10, to: 30,   rate: 142 },
    { from: 31, to: 9999, rate: 105 },
  ]
}

function rateAt(position: number, tiers: Tier[]): number {
  for (const t of tiers) if (position >= t.from && position <= t.to) return t.rate
  return 0
}

// ── Cálculos ─────────────────────────────────────────────────────────────────
export function calcNominal1(totalVentas: number, _periodo: string, scheme: 'normal' | 'promotor'): number {
  const tiers = getTiers(scheme)
  let total = 0
  for (const t of tiers) {
    if (totalVentas < t.from) break
    const inTier = Math.min(totalVentas, t.to) - t.from + 1
    total += inTier * t.rate
  }
  return total
}

export function calcNominal2(ventas: Venta[]): number {
  return ventas.reduce((sum, v) => sum + (getPlanByPrecio(v.plan_precio)?.incentivo ?? 0), 0)
}

export function getPenaltyInfo(pctNoPago: number): { rango: string; factor: number } {
  if (pctNoPago <= 0.1600) return { rango: '0–16%',        factor: 1.00 }
  if (pctNoPago <= 0.2310) return { rango: '16–23.10%',    factor: 1.25 }
  if (pctNoPago <= 0.2600) return { rango: '23.11–26%',    factor: 1.50 }
  if (pctNoPago <= 0.3100) return { rango: '26.01–31%',    factor: 2.00 }
  return                         { rango: '31%+',           factor: 2.50 }
}

export function calcPenalizacion(
  ventasOrdenadas: Venta[],
  noPagoCount: number,
  _periodo: string,
  scheme: 'normal' | 'promotor',
  anticipo3Bruto: number,
): number {
  if (noPagoCount <= 0 || ventasOrdenadas.length === 0) return 0
  const total = ventasOrdenadas.length
  const { factor } = getPenaltyInfo(noPagoCount / total)
  const tiers = getTiers(scheme)
  const penalizedSales = ventasOrdenadas.slice(-noPagoCount)
  let base = 0
  penalizedSales.forEach((v, i) => {
    const pos = total - noPagoCount + i + 1
    base += rateAt(pos, tiers) + (getPlanByPrecio(v.plan_precio)?.incentivo ?? 0)
  })
  return Math.min(base * factor, anticipo3Bruto)
}

export const ONP = 0.13
export const neto = (bruto: number) => bruto * (1 - ONP)
export const fmt  = (n: number) => `S/ ${n.toFixed(2)}`
