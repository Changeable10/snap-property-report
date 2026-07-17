
ALTER TABLE public.comparison_results
  ADD COLUMN IF NOT EXISTS current_photo_id uuid REFERENCES public.inspection_photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_photo_id uuid REFERENCES public.inspection_photos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_inspection_id uuid REFERENCES public.inspections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS changes_detected jsonb;

CREATE INDEX IF NOT EXISTS idx_comparison_results_inspection_room
  ON public.comparison_results(inspection_id, room_id);
