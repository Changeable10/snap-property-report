
ALTER TYPE public.inspection_status ADD VALUE IF NOT EXISTS 'signed';

CREATE TABLE public.inspection_signatures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  signer_role text NOT NULL CHECK (signer_role IN ('landlord','tenant')),
  signer_name text NOT NULL,
  signature_data text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_signatures TO authenticated;
GRANT ALL ON public.inspection_signatures TO service_role;

ALTER TABLE public.inspection_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own inspection_signatures" ON public.inspection_signatures
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER inspection_signatures_touch_updated_at
  BEFORE UPDATE ON public.inspection_signatures
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX inspection_signatures_inspection_idx ON public.inspection_signatures(inspection_id);
