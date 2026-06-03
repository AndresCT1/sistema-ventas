import type { Venta } from '../types'

// ── Planes disponibles ──────────────────────────────────────────────────────
export const PLANES = [
  { precio: 64.90,  descripcion: 'S/ 64.90 - Internet 300 Mbps',              incentivo: 0  },
  { precio: 69.90,  descripcion: 'S/ 69.90 - Internet 300 Mbps + DGO',        incentivo: 0  },
  { precio: 74.90,  descripcion: 'S/ 74.90 - Internet 500 Mbps + DGO',        incentivo: 0  },
  { precio: 79.90,  descripcion: 'S/ 79.90 - Internet 1000 Mbps + DGO',       incentivo: 30 },
  { precio: 94.90,  descripcion: 'S/ 94.90 - Internet 1000 Mbps + DGO Familia', incentivo: 45 },
  { precio: 133.90, descripcion: 'S/ 133.90 - Internet 1000 Mbps + DGO Full', incentivo: 48 },
]

export function getPlanByPrecio(precio: number | null | undefined) {
  if (!precio) return null
  return PLANES.find(p => Math.abs(p.precio - precio) < 0.01) ?? null
}

// ── Períodos ────────────────────────────────────────────────────────────────

// Período actual: si hoy es >= 23, el período empezó este mes; si no, el mes pasado
export function getCurrentPeriodo(): string {
  const today = new Date()
  if (today.getDate() >= 23) return today.toISOString().substring(0, 7)
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// "2026-05" → { start: "2026-05-23", end: "2026-06-22" }
export function getPeriodoDates(periodo: string): { start: string; end: string } {
  const [y, m] = periodo.split('-').map(Number)
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return {
    start: `${periodo}-23`,
    end:   `${ny}-${String(nm).padStart(2, '0')}-22`,
  }
}

// Desplaza un período N meses hacia atrás (n>0) o adelante (n<0)
export function shiftPeriodo(periodo: string, months: number): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1 - months, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// "2026-05" → "Mayo 2026"
export function periodoLabel(periodo: string): string {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 1, 1)
  const s = d.toLocaleDateString('es', { month: 'long', year: 'numeric' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Esquema de comisión ─────────────────────────────────────────────────────

// Mes 0 = mes calendar de ingreso, Mes 1 = siguiente → esquema promotor
export function getScheme(fechaIngreso: string | null | undefined, periodo: string): 'normal' | 'promotor' {
  if (!fechaIngreso) return 'normal'
  const [iy, im] = fechaIngreso.substring(0, 7).split('-').map(Number)
  const [py, pm] = periodo.split('-').map(Number)
  const diff = (py - iy) * 12 + (pm - im)
  return diff === 0 || diff === 1 ? 'promotor' : 'normal'
}

// ── Tablas de tramos ────────────────────────────────────────────────────────

interface Tier { from: number; to: number; rate: number }

function getTiers(periodo: string, scheme: 'normal' | 'promotor'): Tier[] {
  const nuevo = periodo >= '2026-04'
  if (scheme === 'normal') {
    return nuevo
      ? [{ from: 1, to: 5,    rate: 0   },
         { from: 6, to: 7,    rate: 58  },
         { from: 8, to: 9,    rate: 105 },
         { from: 10, to: 30,  rate: 142 },
         { from: 31, to: 9999,rate: 105 }]
      : [{ from: 1, to: 5,    rate: 0   },
         { from: 6, to: 7,    rate: 55  },
         { from: 8, to: 9,    rate: 100 },
         { from: 10, to: 30,  rate: 135 },
         { from: 31, to: 9999,rate: 100 }]
  } else {
    return nuevo
      ? [{ from: 1, to: 3,    rate: 48  },
         { from: 4, to: 7,    rate: 58  },
         { from: 8, to: 9,    rate: 105 },
         { from: 10, to: 30,  rate: 142 },
         { from: 31, to: 9999,rate: 105 }]
      : [{ from: 1, to: 3,    rate: 45  },
         { from: 4, to: 7,    rate: 55  },
         { from: 8, to: 9,    rate: 100 },
         { from: 10, to: 30,  rate: 135 },
         { from: 31, to: 9999,rate: 100 }]
  }
}

function rateAt(position: number, tiers: Tier[]): number {
  for (const t of tiers) if (position >= t.from && position <= t.to) return t.rate
  return 0
}

// ── Cálculos principales ────────────────────────────────────────────────────

// Nominal 1: comisión base por tramos (incremental por cada venta)
export function calcNominal1(totalVentas: number, periodo: string, scheme: 'normal' | 'promotor'): number {
  const tiers = getTiers(periodo, scheme)
  let total = 0
  for (const t of tiers) {
    if (totalVentas < t.from) break
    const inTier = Math.min(totalVentas, t.to) - t.from + 1
    total += inTier * t.rate
  }
  return total
}

// Nominal 2: suma de incentivos de plan
export function calcNominal2(ventas: Venta[]): number {
  return ventas.reduce((sum, v) => sum + (getPlanByPrecio(v.plan_precio)?.incentivo ?? 0), 0)
}

// Factor de penalización según % de no pago
export function getPenaltyInfo(pctNoPago: number): { rango: string; factor: number } {
  if (pctNoPago <= 0.1600) return { rango: '0–16%',         factor: 1.00 }
  if (pctNoPago <= 0.2310) return { rango: '16.01–23.10%',  factor: 1.25 }
  if (pctNoPago <= 0.2600) return { rango: '23.11–26%',     factor: 1.50 }
  if (pctNoPago <= 0.3100) return { rango: '26.01–31%',     factor: 2.00 }
  return                          { rango: '31.01%+',        factor: 2.50 }
}

// Monto de penalización, aplicado a las últimas noPagoCount ventas, cap = anticipo3Bruto
export function calcPenalizacion(
  ventasOrdenadas: Venta[],   // ordenadas por fecha_instalacion ASC
  noPagoCount: number,
  periodo: string,
  scheme: 'normal' | 'promotor',
  anticipo3Bruto: number,
): number {
  if (noPagoCount <= 0 || ventasOrdenadas.length === 0) return 0
  const total = ventasOrdenadas.length
  const pctNoPago = noPagoCount / total
  const { factor } = getPenaltyInfo(pctNoPago)
  const tiers = getTiers(periodo, scheme)

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
