-- =========================================
-- SISTEMA DE VENTAS - Schema Supabase
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- =========================================

-- 1. Tabla de perfiles (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('vendedor', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabla de referidos
CREATE TABLE IF NOT EXISTS public.referidos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  fecha_llamada DATE NOT NULL,
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'llamado', 'convertido')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tabla de ventas
CREATE TABLE IF NOT EXISTS public.ventas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendedor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  cliente_nombre TEXT NOT NULL,
  cliente_telefono TEXT NOT NULL,
  cliente_direccion TEXT NOT NULL,
  codigo_pago TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_renovacion DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================
-- ROW LEVEL SECURITY (RLS)
-- =========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ventas ENABLE ROW LEVEL SECURITY;

-- PROFILES: cada usuario ve su propio perfil; admins ven todos
CREATE POLICY "Usuarios ven su propio perfil" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins ven todos los perfiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Usuarios actualizan su perfil" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- REFERIDOS: vendedor ve/gestiona los suyos; admin ve todos
CREATE POLICY "Vendedores ven sus referidos" ON public.referidos
  FOR SELECT USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Vendedores insertan sus referidos" ON public.referidos
  FOR INSERT WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedores actualizan sus referidos" ON public.referidos
  FOR UPDATE USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Vendedores eliminan sus referidos" ON public.referidos
  FOR DELETE USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- VENTAS: vendedor ve/gestiona las suyas; admin ve todas
CREATE POLICY "Vendedores ven sus ventas" ON public.ventas
  FOR SELECT USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Vendedores insertan sus ventas" ON public.ventas
  FOR INSERT WITH CHECK (auth.uid() = vendedor_id);

CREATE POLICY "Vendedores actualizan sus ventas" ON public.ventas
  FOR UPDATE USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Vendedores eliminan sus ventas" ON public.ventas
  FOR DELETE USING (
    auth.uid() = vendedor_id OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- =========================================
-- TRIGGER: crear perfil automático al registrar usuario
-- =========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- ÍNDICES para mejor performance
-- =========================================

CREATE INDEX IF NOT EXISTS idx_referidos_vendedor ON public.referidos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_referidos_fecha ON public.referidos(fecha_llamada);
CREATE INDEX IF NOT EXISTS idx_referidos_estado ON public.referidos(estado);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor ON public.ventas(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_ventas_renovacion ON public.ventas(fecha_renovacion);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha_inicio ON public.ventas(fecha_inicio);
