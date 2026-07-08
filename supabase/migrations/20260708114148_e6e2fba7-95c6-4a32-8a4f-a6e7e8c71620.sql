CREATE TYPE public.comparison_change_type AS ENUM ('new','removed','deterioration','improvement','new_damage','repair');
CREATE TYPE public.comparison_severity AS ENUM ('minor','moderate','significant');
CREATE TYPE public.comparison_status AS ENUM ('pending','confirmed','dismissed');

CREATE TABLE public.comparison_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  item_name text NOT NULL,
  change_type public.comparison_change_type NOT NULL,
  description text,
  severity public.comparison_severity NOT NULL DEFAULT 'minor',
  previous_condition public.condition_type,
  current_condition public.condition_type,
  status public.comparison_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comparison_results_inspection_idx ON public.comparison_results(inspection_id);
CREATE INDEX comparison_results_room_idx ON public.comparison_results(room_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comparison_results TO authenticated;
GRANT ALL ON public.comparison_results TO service_role;

ALTER TABLE public.comparison_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own comparison_results" ON public.comparison_results
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_comparison_results_updated_at
  BEFORE UPDATE ON public.comparison_results
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();