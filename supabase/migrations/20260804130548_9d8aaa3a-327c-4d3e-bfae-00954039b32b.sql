CREATE TABLE public.meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  content_html text NOT NULL DEFAULT '',
  content_text text NOT NULL DEFAULT '',
  edit_mode text NOT NULL DEFAULT 'everyone',
  allowed_editors jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.meeting_notes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_notes TO authenticated;
GRANT ALL ON public.meeting_notes TO service_role;
ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read notes" ON public.meeting_notes FOR SELECT USING (true);
CREATE POLICY "Anyone can create notes doc" ON public.meeting_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Open editing or host edits notes" ON public.meeting_notes FOR UPDATE USING (
  edit_mode = 'everyone'
  OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_notes.meeting_id AND m.host_id = auth.uid())
  OR (auth.uid() IS NOT NULL AND allowed_editors ? auth.uid()::text)
  OR public.has_role(auth.uid(), 'super_admin')
) WITH CHECK (true);
CREATE TRIGGER meeting_notes_updated_at BEFORE UPDATE ON public.meeting_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.meeting_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES public.meeting_notes(id) ON DELETE CASCADE,
  content_html text NOT NULL DEFAULT '',
  label text,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_note_versions_note_idx ON public.meeting_note_versions(note_id, created_at DESC);
GRANT SELECT, INSERT ON public.meeting_note_versions TO anon;
GRANT SELECT, INSERT, DELETE ON public.meeting_note_versions TO authenticated;
GRANT ALL ON public.meeting_note_versions TO service_role;
ALTER TABLE public.meeting_note_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads note versions" ON public.meeting_note_versions FOR SELECT USING (true);
CREATE POLICY "Anyone creates note versions" ON public.meeting_note_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Host deletes note versions" ON public.meeting_note_versions FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_note_versions.meeting_id AND m.host_id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE TABLE public.meeting_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text NOT NULL,
  added_by_name text NOT NULL DEFAULT 'Guest',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meeting_links_meeting_idx ON public.meeting_links(meeting_id, created_at DESC);
GRANT SELECT, INSERT ON public.meeting_links TO anon;
GRANT SELECT, INSERT, DELETE ON public.meeting_links TO authenticated;
GRANT ALL ON public.meeting_links TO service_role;
ALTER TABLE public.meeting_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads links" ON public.meeting_links FOR SELECT USING (true);
CREATE POLICY "Anyone adds links" ON public.meeting_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Host deletes links" ON public.meeting_links FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_links.meeting_id AND m.host_id = auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);

ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_note_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_links;