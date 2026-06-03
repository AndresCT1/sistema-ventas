export interface Profile {
  id: string
  email: string
  full_name: string
  role: 'vendedor' | 'admin'
  created_at: string
}

export interface Referido {
  id: string
  vendedor_id: string
  nombre: string
  telefono: string
  fecha_llamada: string
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
  vendedor?: Profile
  created_at: string
}
