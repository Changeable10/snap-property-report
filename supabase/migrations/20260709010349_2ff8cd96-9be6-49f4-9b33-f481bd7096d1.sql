ALTER TABLE public.inspection_items
  ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS confidence numeric;