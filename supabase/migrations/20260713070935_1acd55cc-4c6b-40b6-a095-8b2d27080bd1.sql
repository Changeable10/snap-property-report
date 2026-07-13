ALTER TYPE inspection_type ADD VALUE IF NOT EXISTS 'healthy_homes';

CREATE TABLE public.healthy_homes_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  heating_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  insulation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  ventilation_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  moisture_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  draught_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  overall_status TEXT NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(inspection_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.healthy_homes_assessments TO authenticated;
GRANT ALL ON public.healthy_homes_assessments TO service_role;

ALTER TABLE public.healthy_homes_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own healthy homes assessments"
  ON public.healthy_homes_assessments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER healthy_homes_assessments_touch_updated_at
  BEFORE UPDATE ON public.healthy_homes_assessments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
