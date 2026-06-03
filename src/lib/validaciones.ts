export function validateTelefono(val: string): string {
  if (!/^\d{9}$/.test(val) || !val.startsWith('9'))
    return 'El teléfono debe tener 9 dígitos y empezar con 9'
  return ''
}

export function validateNombreCliente(val: string): string {
  const trimmed = val.trim()
  if (trimmed.length < 3 || !/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s]+$/.test(trimmed))
    return 'Ingresa el nombre completo del cliente'
  return ''
}

export function validateDireccion(val: string): string {
  return val.trim().length < 10 ? 'Ingresa la dirección completa' : ''
}

export function validateCodigo(val: string): string {
  if (!/^\d{11}$/.test(val) || !val.startsWith('2026'))
    return 'El código de pago debe tener 11 dígitos y empezar con 2026'
  return ''
}

export function validatePlan(val: string): string {
  return !val ? 'Selecciona el plan vendido' : ''
}

export function validateFechaInstalacion(val: string): string {
  if (!val) return 'La fecha de instalación no es válida'
  const date  = new Date(val + 'T00:00:00')
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')
  const min   = new Date('2026-01-01T00:00:00')
  if (date > today || date < min) return 'La fecha de instalación no es válida'
  return ''
}

export function validateFechaLlamada(val: string): string {
  if (!val) return 'La fecha de llamada es requerida'
  const date  = new Date(val + 'T00:00:00')
  const today = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00')
  if (date < today) return 'La fecha de llamada no puede ser anterior a hoy'
  return ''
}
