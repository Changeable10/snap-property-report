
CREATE TABLE IF NOT EXISTS public.usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('listing','staging','enhancement')),
  month TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, usage_type, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_tracking TO authenticated;
GRANT ALL ON public.usage_tracking TO service_role;

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_tracking_select_own ON public.usage_tracking
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY usage_tracking_insert_own ON public.usage_tracking
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY usage_tracking_update_own ON public.usage_tracking
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS usage_tracking_user_month_idx
  ON public.usage_tracking (user_id, month);

-- Atomic monthly increment. Uses auth.uid() so the caller can only bump their own counter.
CREATE OR REPLACE FUNCTION public.increment_usage(_usage_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _month TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
  _new_count INTEGER;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _usage_type NOT IN ('listing','staging','enhancement') THEN
    RAISE EXCEPTION 'invalid usage_type: %', _usage_type;
  END IF;
  INSERT INTO public.usage_tracking (user_id, usage_type, month, count)
    VALUES (_uid, _usage_type, _month, 1)
  ON CONFLICT (user_id, usage_type, month)
    DO UPDATE SET count = public.usage_tracking.count + 1, updated_at = now()
  RETURNING count INTO _new_count;
  RETURN _new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_usage(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_usage(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_usage_tracking_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS usage_tracking_touch ON public.usage_tracking;
CREATE TRIGGER usage_tracking_touch BEFORE UPDATE ON public.usage_tracking
  FOR EACH ROW EXECUTE FUNCTION public.touch_usage_tracking_updated_at();
