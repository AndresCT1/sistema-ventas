export interface Factura {
  numero: 1 | 2 | 3
  desde: string  // "YYYY-MM-DD"
  hasta: string  // "YYYY-MM-DD"
}

function addMonths(y: number, m: number, n: number): [number, number] {
  let nm = m + n, ny = y
  while (nm > 12) { nm -= 12; ny++ }
  return [ny, nm]
}

function ds(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Calcula las 3 facturas de un contrato según su fecha_inicio.
// El ciclo comienza en el mes de corte (día 22) correspondiente:
//   dia ≤ 22 → base = mismo mes   |  dia ≥ 23 → base = mes siguiente
export function getFacturas(fechaInicio: string): [Factura, Factura, Factura] {
  const [y, m, d] = fechaInicio.split('-').map(Number)
  let [by, bm] = [y, m]
  if (d >= 23) [by, bm] = addMonths(y, m, 1)

  const [y2, m2] = addMonths(by, bm, 1)
  const [y3, m3] = addMonths(by, bm, 2)

  return [
    { numero: 1, desde: fechaInicio,       hasta: ds(by, bm, 22) },
    { numero: 2, desde: ds(by, bm, 23),    hasta: ds(y2, m2, 22) },
    { numero: 3, desde: ds(y2, m2, 23),    hasta: ds(y3, m3, 22) },
  ]
}

// Devuelve 1, 2, 3 o null si hoy no cae en ninguna factura activa
export function getFacturaActiva(fechaInicio: string, hoy: string): 1 | 2 | 3 | null {
  for (const f of getFacturas(fechaInicio)) {
    if (hoy >= f.desde && hoy <= f.hasta) return f.numero
  }
  return null
}

// "2026-04-23" → "23 abr"
function fmtCorto(s: string): string {
  const [, mo, d] = s.split('-').map(Number)
  const label = new Date(2000, mo - 1, d).toLocaleDateString('es', { month: 'short' }).replace('.', '')
  return `${d} ${label}`
}

export function facturaPeriodoLabel(f: Factura): string {
  return `${fmtCorto(f.desde)} – ${fmtCorto(f.hasta)}`
}

export type EstadoFactura = 'sin_verificar' | 'pagado' | 'no_pago'

export function estadoFactura(venta: Record<string, unknown>, num: 1 | 2 | 3): EstadoFactura {
  return (venta[`estado_f${num}`] as EstadoFactura) ?? 'sin_verificar'
}
