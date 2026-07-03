
-- Stage B tables: agenda, polls, commitments

-- 1) meeting_agenda_items
CREATE TABLE public.meeting_agenda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_agenda_items TO authenticated;
GRANT SELECT ON public.meeting_agenda_items TO anon;
GRANT ALL ON public.meeting_agenda_items TO service_role;
ALTER TABLE public.meeting_agenda_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read agenda" ON public.meeting_agenda_items FOR SELECT USING (true);
CREATE POLICY "Host manages agenda" ON public.meeting_agenda_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER agenda_updated_at BEFORE UPDATE ON public.meeting_agenda_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) meeting_polls
CREATE TABLE public.meeting_polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  creator_name TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB NOT NULL,
  anonymous BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_polls TO authenticated;
GRANT SELECT, INSERT ON public.meeting_polls TO anon;
GRANT ALL ON public.meeting_polls TO service_role;
ALTER TABLE public.meeting_polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads polls" ON public.meeting_polls FOR SELECT USING (true);
CREATE POLICY "Anyone creates poll in meeting" ON public.meeting_polls FOR INSERT WITH CHECK (true);
CREATE POLICY "Creator or host closes poll" ON public.meeting_polls FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()) OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (true);
CREATE POLICY "Host deletes poll" ON public.meeting_polls FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER polls_updated_at BEFORE UPDATE ON public.meeting_polls FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) meeting_poll_votes
CREATE TABLE public.meeting_poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.meeting_polls(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES public.meeting_attendees(id) ON DELETE CASCADE,
  voter_name TEXT NOT NULL,
  option_index INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (poll_id, attendee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_poll_votes TO authenticated;
GRANT SELECT, INSERT ON public.meeting_poll_votes TO anon;
GRANT ALL ON public.meeting_poll_votes TO service_role;
ALTER TABLE public.meeting_poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads votes" ON public.meeting_poll_votes FOR SELECT USING (true);
CREATE POLICY "Anyone votes" ON public.meeting_poll_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Change own vote" ON public.meeting_poll_votes FOR UPDATE USING (true) WITH CHECK (true);

-- 4) meeting_commitments
CREATE TABLE public.meeting_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  speaker_attendee_id UUID REFERENCES public.meeting_attendees(id) ON DELETE SET NULL,
  speaker_name TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','retracted')),
  decided_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_commitments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.meeting_commitments TO anon;
GRANT ALL ON public.meeting_commitments TO service_role;
ALTER TABLE public.meeting_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads commitments" ON public.meeting_commitments FOR SELECT USING (true);
CREATE POLICY "Anyone inserts commitment" ON public.meeting_commitments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone updates commitment status" ON public.meeting_commitments FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Host deletes commitment" ON public.meeting_commitments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()) OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER commitments_updated_at BEFORE UPDATE ON public.meeting_commitments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) meeting_commitment_reactions
CREATE TABLE public.meeting_commitment_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id UUID NOT NULL REFERENCES public.meeting_commitments(id) ON DELETE CASCADE,
  attendee_id UUID NOT NULL REFERENCES public.meeting_attendees(id) ON DELETE CASCADE,
  reactor_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('endorse','challenge')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (commitment_id, attendee_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_commitment_reactions TO authenticated;
GRANT SELECT, INSERT ON public.meeting_commitment_reactions TO anon;
GRANT ALL ON public.meeting_commitment_reactions TO service_role;
ALTER TABLE public.meeting_commitment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads reactions" ON public.meeting_commitment_reactions FOR SELECT USING (true);
CREATE POLICY "Anyone reacts" ON public.meeting_commitment_reactions FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_agenda_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_polls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_commitments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_commitment_reactions;
