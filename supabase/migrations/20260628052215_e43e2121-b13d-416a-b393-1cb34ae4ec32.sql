
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
CREATE POLICY "Users can read their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

DROP POLICY IF EXISTS "Super admins can read all roles" ON public.user_roles;
CREATE POLICY "Super admins can read all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.grant_platform_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email = 'divintelteam@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_grant_platform_admin ON auth.users;
CREATE TRIGGER on_auth_user_grant_platform_admin
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.grant_platform_admin();

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role FROM auth.users WHERE email = 'divintelteam@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;


CREATE TABLE IF NOT EXISTS public.meeting_transcripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  attendee_id UUID REFERENCES public.meeting_attendees(id) ON DELETE SET NULL,
  speaker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  is_interim BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  typo_flags JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meeting_transcripts_meeting_idx ON public.meeting_transcripts (meeting_id, started_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_transcripts TO authenticated;
GRANT SELECT, INSERT ON public.meeting_transcripts TO anon;
GRANT ALL ON public.meeting_transcripts TO service_role;
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read meeting transcripts" ON public.meeting_transcripts;
CREATE POLICY "Anyone can read meeting transcripts" ON public.meeting_transcripts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert transcripts" ON public.meeting_transcripts;
CREATE POLICY "Anyone can insert transcripts" ON public.meeting_transcripts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Host can update transcripts" ON public.meeting_transcripts;
CREATE POLICY "Host can update transcripts" ON public.meeting_transcripts
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Host can delete transcripts" ON public.meeting_transcripts;
CREATE POLICY "Host can delete transcripts" ON public.meeting_transcripts
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_transcripts;


DO $$ BEGIN
  CREATE TYPE public.summary_status AS ENUM ('pending_review', 'approved', 'sent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.meeting_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE UNIQUE,
  status public.summary_status NOT NULL DEFAULT 'pending_review',
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  host_notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_summaries TO authenticated;
GRANT SELECT ON public.meeting_summaries TO anon;
GRANT ALL ON public.meeting_summaries TO service_role;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Host manages summaries" ON public.meeting_summaries;
CREATE POLICY "Host manages summaries" ON public.meeting_summaries
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Participants read approved summary" ON public.meeting_summaries;
CREATE POLICY "Participants read approved summary" ON public.meeting_summaries
  FOR SELECT USING (status IN ('approved', 'sent'));

DROP TRIGGER IF EXISTS update_meeting_summaries_updated_at ON public.meeting_summaries;
CREATE TRIGGER update_meeting_summaries_updated_at
  BEFORE UPDATE ON public.meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE IF NOT EXISTS public.meeting_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  summary_id UUID REFERENCES public.meeting_summaries(id) ON DELETE CASCADE,
  transcript_id UUID REFERENCES public.meeting_transcripts(id) ON DELETE CASCADE,
  section TEXT,
  range_start INT,
  range_end INT,
  note TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_highlights TO authenticated;
GRANT ALL ON public.meeting_highlights TO service_role;
ALTER TABLE public.meeting_highlights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read meeting highlights" ON public.meeting_highlights;
CREATE POLICY "Read meeting highlights" ON public.meeting_highlights
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Host manages highlights" ON public.meeting_highlights;
CREATE POLICY "Host manages highlights" ON public.meeting_highlights
  FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );
