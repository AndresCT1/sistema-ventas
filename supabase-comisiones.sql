-- =========================================================
-- MÓDULO COMISIONES — SQL
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =========================================================

-- 1. Nuevas columnas en tabla VENTAS
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS plan_precio DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS fecha_instalacion DATE;

-- 2. Nueva columna en tabla PROFILES
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fecha_ingreso_wow DATE;

-- 3. Nueva tabla COSECHAS
CREATE TABLE IF NOT EXISTS public.cosechas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  periodo       TEXT NOT NULL,           -- ej: "2026-05"
  fecha_inicio  DATE NOT NULL,           -- día 23 del mes anterior
  fecha_fin     DATE NOT NULL,           -- día 22 del mes del periodo
  total_ventas  INTEGER NOT NULL DEFAULT 0,
  nominal_1     DECIMAL(10,2) NOT NULL DEFAULT 0,
  nominal_2     DECIMAL(10,2) NOT NULL DEFAULT 0,
  nominal_total DECIMAL(10,2) NOT NULL DEFAULT 0,
  pct_boleta_1  DECIMAL(5,2) NOT NULL DEFAULT 100,
  pct_boleta_2  DECIMAL(5,2) NOT NULL DEFAULT 100,
  pct_boleta_3  DECIMAL(5,2) NOT NULL DEFAULT 100,
  no_pago_count INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(vendedor_id, periodo)
);

-- 4. RLS para cosechas
ALTER TABLE public.cosechas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Vendedores ven sus cosechas" ON public.cosechas
  FOR SELECT USING (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores insertan sus cosechas" ON public.cosechas
  FOR INSERT WITH CHECK (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores actualizan sus cosechas" ON public.cosechas
  FOR UPDATE USING (auth.uid() = vendedor_id OR public.is_admin());

-- 5. Índices
CREATE INDEX IF NOT EXISTS idx_cosechas_vendedor  ON public.cosechas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_cosechas_periodo   ON public.cosechas(periodo);
CREATE INDEX IF NOT EXISTS idx_ventas_instalacion ON public.ventas(fecha_instalacion);
CREATE INDEX IF NOT EXISTS idx_ventas_plan        ON public.ventas(plan_precio);
