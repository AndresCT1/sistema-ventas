export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'vendedor' | 'admin'
  fecha_ingreso_wow?: string | null
  anticipacion_notif?: number | null
  created_at: string
}

export interface Referido {
  id: string
  vendedor_id: string
  nombre: string
  telefono: string
  fecha_llamada: string
  hora_llamada?: string | null
  notas?: string
  estado: 'pendiente' | 'llamado' | 'convertido'
  created_at: string
  vendedor?: Profile
}

export interface Venta {
  id: string
  vendedor_id: string
  cliente_nombre: string
  cliente_telefono: string
  cliente_direccion: string
  codigo_pago: string
  fecha_inicio: string
  fecha_renovacion: string
  plan_precio?: number | null
  fecha_instalacion?: string | null
  estado_pago?: 'sin_verificar' | 'pagado' | 'deuda' | null
  fecha_verificacion?: string | null
  estado_f1?: 'sin_verificar' | 'pagado' | 'no_pago' | null
  estado_f2?: 'sin_verificar' | 'pagado' | 'no_pago' | null
  estado_f3?: 'sin_verificar' | 'pagado' | 'no_pago' | null
  fecha_verificacion_f1?: string | null
  fecha_verificacion_f2?: string | null
  fecha_verificacion_f3?: string | null
  vendedor?: Profile
  created_at: string
}

export interface Cosecha {
  id?: string
  vendedor_id: string
  periodo: string
  fecha_inicio: string
  fecha_fin: string
  total_ventas: number
  nominal_1: number
  nominal_2: number
  nominal_total: number
  pct_boleta_1: number
  pct_boleta_2: number
  pct_boleta_3: number
  no_pago_count: number
  created_at?: string
  updated_at?: string
}
