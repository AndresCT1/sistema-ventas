# Sistema de Ventas WOW - Contexto del Proyecto

## Descripción
App PWA para equipo de 10 vendedores de WOW TEL S.A.C. (empresa 
de telecomunicaciones en Perú). Gestiona referidos, ventas y 
cálculo de comisiones.

## Stack
- React + Vite (PWA)
- Tailwind CSS
- Supabase (PostgreSQL + Auth)
- Deploy en Vercel

## Estructura de base de datos
- profiles: id, email, full_name, role (vendedor/admin), 
  fecha_ingreso_wow, created_at
- referidos: id, vendedor_id, nombre, telefono, fecha_llamada, 
  notas, estado (pendiente/llamado/convertido), created_at
- ventas: id, vendedor_id, cliente_nombre, cliente_telefono, 
  cliente_direccion, codigo_pago, fecha_inicio (fecha de 
  instalación efectiva), plan_precio, fecha_renovacion, created_at
- cosechas: id, vendedor_id, periodo, fecha_inicio, fecha_fin,
  total_ventas, nominal_1, nominal_2, nominal_total, 
  pct_boleta_1, pct_boleta_2, pct_boleta_3

## Planes disponibles
- S/ 64.90 — Internet 300 Mbps → incentivo S/ 0
- S/ 69.90 — Internet 300 Mbps + DGO → incentivo S/ 0
- S/ 74.90 — Internet 500 Mbps + DGO → incentivo S/ 0
- S/ 79.90 — Internet 1000 Mbps + DGO → incentivo S/ 30
- S/ 94.90 — Internet 1000 Mbps + DGO Familia → incentivo S/ 45
- S/ 133.90 — Internet 1000 Mbps + DGO Full → incentivo S/ 48

## Reglas de comisiones
Período de medición: del 23 de cada mes al 22 del siguiente.
Pago: último día del mes siguiente al cierre del período.
Ejemplo: cosecha febrero (23 ene - 22 feb) → cobro 31 marzo.

### Tablas de comisión base
FEBRERO y MARZO 2026 — Esquema normal:
- Ventas 1-5: S/ 0
- Ventas 6-7: S/ 55
- Ventas 8-9: S/ 100
- Ventas 10-30: S/ 135
- Ventas 31+: S/ 100

FEBRERO y MARZO 2026 — Promotor nuevo (Mes 0 y Mes 1):
- Ventas 1-3: S/ 45
- Ventas 4-7: S/ 55
- Ventas 8-9: S/ 100
- Ventas 10-30: S/ 135
- Ventas 31+: S/ 100

ABRIL 2026 en adelante — Esquema normal:
- Ventas 1-5: S/ 0
- Ventas 6-7: S/ 58
- Ventas 8-9: S/ 105
- Ventas 10-30: S/ 142
- Ventas 31+: S/ 105

ABRIL 2026 en adelante — Promotor nuevo (Mes 0 y Mes 1):
- Ventas 1-3: S/ 48
- Ventas 4-7: S/ 58
- Ventas 8-9: S/ 105
- Ventas 10-30: S/ 142
- Ventas 31+: S/ 105

Niveles INCREMENTALES: si llegas al nivel 3 cobras 
todos los anteriores también.

Promotor nuevo: Mes 0 = mes de ingreso a WOW, 
Mes 1 = mes siguiente. Detectar automáticamente 
según fecha_ingreso_wow en profiles.

### Anticipos
- Anticipo mes 1: Nominal × 40% × % pago boleta 1
- Anticipo mes 2: Nominal × 30% × % pago boleta 2
- Anticipo mes 3: Nominal × 30% × % pago boleta 3
% boletas por defecto 100%, se ingresan manualmente.

### Penalización boleta 3
% no pago = clientes sin pagar / total ventas cosecha
- 0%-16%: 100%
- 16.01%-23.10%: 125%
- 23.11%-26%: 150%
- 26.01%-31%: 200%
- 31.01%+: 250%
Penalización aplica a Nominal 1 y Nominal 2.
Ventas penalizadas = siempre las últimas del período.
Penalización real nunca supera lo anticipado.

### Descuento ONP: 13% sobre cada anticipo bruto.

## Campo fecha_instalacion
En la tabla ventas se llama "fecha_inicio". Es la fecha 
de instalación efectiva, no la fecha de venta.
El campo "plan_precio" ya existe en la tabla ventas.
NO duplicar campos.

## Vista comisiones
Para el mes actual mostrar las 3 cosechas activas:
- Cosecha hace 3 meses → anticipo mes 3 (cobro este mes)
- Cosecha hace 2 meses → anticipo mes 2 (cobro este mes)
- Cosecha del mes pasado → anticipo mes 1 (cobro este mes)

Mostrar proyección: "Cobrarás aproximadamente S/ XX 
el DD/MM/YYYY" con % boletas al 100% por defecto.

Sueldo bruto = suma de 3 anticipos
Sueldo neto = sueldo bruto - 13% ONP

## Decisiones tomadas
- Sin penalización por flipping (exonerado hace años)
- Sin incentivo por autogestión (eliminado)
- Sin georreferenciación
- % boletas se ingresa manualmente por cosecha
- Montos de comisión NO son configurables desde la app
  (están hardcodeados según período)