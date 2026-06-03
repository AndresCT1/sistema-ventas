-- =========================================================
-- PATCH: Corregir políticas RLS recursivas
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- PROBLEMA: Las policies que hacen SELECT sobre profiles
--   dentro de una policy de profiles causan recursión
--   infinita → error 500 en todas las queries.
-- =========================================================

-- 1. Función SECURITY DEFINER: corre como superuser,
--    sin RLS, evita la recursión.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
$$;

-- =========================================================
-- 2. Reparar policies de PROFILES
-- =========================================================
DROP POLICY IF EXISTS "Admins ven todos los perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios ven su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Usuarios actualizan su perfil" ON public.profiles;

-- Una sola policy SELECT: propio perfil O es admin
CREATE POLICY "Perfil propio o admin" ON public.profiles
  FOR SELECT USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Usuarios actualizan su perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Permitir insert para el trigger y auto-creación
CREATE POLICY "Insert perfil propio" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- =========================================================
-- 3. Reparar policies de REFERIDOS
-- =========================================================
DROP POLICY IF EXISTS "Vendedores ven sus referidos" ON public.referidos;
DROP POLICY IF EXISTS "Vendedores insertan sus referidos" ON public.referidos;
DROP POLICY IF EXISTS "Vendedores actualizan sus referidos" ON public.referidos;
DROP POLICY IF EXISTS "Vendedores eliminan sus referidos" ON public.referidos;

CREATE POLICY "Vendedores ven sus referidos" ON public.referidos
  FOR SELECT USING (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores insertan sus referidos" ON public.referidos
  FOR INSERT WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedores actualizan sus referidos" ON public.referidos
  FOR UPDATE USING (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores eliminan sus referidos" ON public.referidos
  FOR DELETE USING (auth.uid() = vendedor_id OR public.is_admin());

-- =========================================================
-- 4. Reparar policies de VENTAS
-- =========================================================
DROP POLICY IF EXISTS "Vendedores ven sus ventas" ON public.ventas;
DROP POLICY IF EXISTS "Vendedores insertan sus ventas" ON public.ventas;
DROP POLICY IF EXISTS "Vendedores actualizan sus ventas" ON public.ventas;
DROP POLICY IF EXISTS "Vendedores eliminan sus ventas" ON public.ventas;

CREATE POLICY "Vendedores ven sus ventas" ON public.ventas
  FOR SELECT USING (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores insertan sus ventas" ON public.ventas
  FOR INSERT WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedores actualizan sus ventas" ON public.ventas
  FOR UPDATE USING (auth.uid() = vendedor_id OR public.is_admin());

CREATE POLICY "Vendedores eliminan sus ventas" ON public.ventas
  FOR DELETE USING (auth.uid() = vendedor_id OR public.is_admin());
