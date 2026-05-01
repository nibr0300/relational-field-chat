-- CORONA: färska observationer (full upplösning)
CREATE TABLE public.memory_corona (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  significance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  source_conversation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_corona_created ON public.memory_corona(created_at DESC);
CREATE INDEX idx_corona_category ON public.memory_corona(category);

ALTER TABLE public.memory_corona ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on memory_corona" ON public.memory_corona FOR ALL USING (true) WITH CHECK (true);

-- LIMBUS: komprimerade mellanlager
CREATE TABLE public.memory_limbus (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  summary TEXT NOT NULL,
  observation_count INTEGER NOT NULL DEFAULT 0,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  mean_significance DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  key_terms TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_limbus_category ON public.memory_limbus(category);
CREATE INDEX idx_limbus_last_seen ON public.memory_limbus(last_seen DESC);

ALTER TABLE public.memory_limbus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on memory_limbus" ON public.memory_limbus FOR ALL USING (true) WITH CHECK (true);

-- VORTEX: eviga mönster
CREATE TABLE public.memory_vortex (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_name TEXT NOT NULL,
  description TEXT NOT NULL,
  stability DOUBLE PRECISION NOT NULL DEFAULT 0.7,
  related_categories TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_vortex_stability ON public.memory_vortex(stability DESC);

ALTER TABLE public.memory_vortex ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on memory_vortex" ON public.memory_vortex FOR ALL USING (true) WITH CHECK (true);

-- FRICTION: punkter som gör motstånd (Metatron-stenarna)
CREATE TABLE public.memory_friction (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT NOT NULL,
  resistance_strength DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_friction_resistance ON public.memory_friction(resistance_strength DESC);
CREATE INDEX idx_friction_category ON public.memory_friction(category);

ALTER TABLE public.memory_friction ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on memory_friction" ON public.memory_friction FOR ALL USING (true) WITH CHECK (true);

-- Trigger-funktion för updated_at
CREATE OR REPLACE FUNCTION public.update_memory_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_limbus_timestamp
  BEFORE UPDATE ON public.memory_limbus
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();

CREATE TRIGGER update_vortex_timestamp
  BEFORE UPDATE ON public.memory_vortex
  FOR EACH ROW EXECUTE FUNCTION public.update_memory_timestamp();