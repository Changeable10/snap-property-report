
CREATE TYPE public.inspection_type AS ENUM ('entry', 'routine', 'exit');
CREATE TYPE public.inspection_status AS ENUM ('in_progress', 'completed');

CREATE TABLE public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  inspection_type public.inspection_type NOT NULL,
  inspection_date date NOT NULL DEFAULT CURRENT_DATE,
  inspector_name text NOT NULL,
  tenant_names text,
  status public.inspection_status NOT NULL DEFAULT 'in_progress',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own inspections" ON public.inspections
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER inspections_touch_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX inspections_property_id_idx ON public.inspections(property_id);
CREATE INDEX inspections_user_id_idx ON public.inspections(user_id);
