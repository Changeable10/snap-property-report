CREATE TABLE IF NOT EXISTS public.tester_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  feedback_type text CHECK (feedback_type IN ('bug', 'feature', 'confusion', 'general')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  raw_transcript text,
  structured_summary text,
  page_url text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.tester_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback"
  ON public.tester_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback"
  ON public.tester_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all feedback"
  ON public.tester_feedback FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.admin_users));
