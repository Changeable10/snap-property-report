
-- 1) Maintenance priority + resolved state on inspection items
DO $$ BEGIN
  CREATE TYPE public.maintenance_priority AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.inspection_items
  ADD COLUMN IF NOT EXISTS maintenance_priority public.maintenance_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS maintenance_resolved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_resolved_at timestamptz;

-- 2) Property contacts
CREATE TABLE IF NOT EXISTS public.property_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  contact_role text NOT NULL,
  phone text,
  email text,
  company text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_contacts TO authenticated;
GRANT ALL ON public.property_contacts TO service_role;

ALTER TABLE public.property_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own property contacts"
  ON public.property_contacts
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS property_contacts_property_id_idx ON public.property_contacts(property_id);

CREATE TRIGGER property_contacts_touch_updated
  BEFORE UPDATE ON public.property_contacts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
