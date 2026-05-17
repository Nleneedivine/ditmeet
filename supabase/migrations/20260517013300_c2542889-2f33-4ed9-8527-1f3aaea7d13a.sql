
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS waiting_room_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz;

ALTER TABLE public.meeting_attendees
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'admitted',
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hand_raised_at timestamptz;

CREATE TABLE IF NOT EXISTS public.meeting_speaker_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL,
  attendee_id uuid NOT NULL,
  seconds integer NOT NULL CHECK (seconds > 0 AND seconds <= 3600),
  started_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);
ALTER TABLE public.meeting_speaker_timers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone reads timers" ON public.meeting_speaker_timers;
DROP POLICY IF EXISTS "Host inserts timers" ON public.meeting_speaker_timers;
DROP POLICY IF EXISTS "Host deletes timers" ON public.meeting_speaker_timers;
CREATE POLICY "Anyone reads timers" ON public.meeting_speaker_timers FOR SELECT USING (true);
CREATE POLICY "Host inserts timers" ON public.meeting_speaker_timers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
);
CREATE POLICY "Host deletes timers" ON public.meeting_speaker_timers FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
);

DROP POLICY IF EXISTS "Host updates attendees" ON public.meeting_attendees;
DROP POLICY IF EXISTS "Anyone updates attendees" ON public.meeting_attendees;
CREATE POLICY "Host updates attendees" ON public.meeting_attendees FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
);
CREATE POLICY "Anyone updates attendees" ON public.meeting_attendees FOR UPDATE USING (true);

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_speaker_timers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
