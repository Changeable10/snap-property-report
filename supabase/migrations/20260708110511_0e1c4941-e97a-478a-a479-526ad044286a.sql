
CREATE TYPE public.condition_type AS ENUM ('good','fair','poor','damaged');

CREATE TABLE public.inspection_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  condition public.condition_type NOT NULL DEFAULT 'good',
  description TEXT,
  maintenance_required BOOLEAN NOT NULL DEFAULT false,
  maintenance_notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_items TO authenticated;
GRANT ALL ON public.inspection_items TO service_role;
ALTER TABLE public.inspection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inspection_items" ON public.inspection_items
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER touch_inspection_items BEFORE UPDATE ON public.inspection_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX ON public.inspection_items(inspection_id);
CREATE INDEX ON public.inspection_items(room_id);

CREATE TABLE public.inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  inspection_item_id UUID REFERENCES public.inspection_items(id) ON DELETE SET NULL,
  photo_url TEXT NOT NULL,
  ai_classification JSONB,
  voice_transcript TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_photos TO authenticated;
GRANT ALL ON public.inspection_photos TO service_role;
ALTER TABLE public.inspection_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own inspection_photos" ON public.inspection_photos
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.inspection_photos(inspection_id);
CREATE INDEX ON public.inspection_photos(room_id);
