
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- updated_at trigger fn
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Meetings
CREATE TABLE public.meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  room_name TEXT NOT NULL UNIQUE,
  room_url TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | live | ended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Host can manage their meetings
CREATE POLICY "Host views own meetings" ON public.meetings FOR SELECT USING (auth.uid() = host_id);
CREATE POLICY "Host creates meetings" ON public.meetings FOR INSERT WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Host updates meetings" ON public.meetings FOR UPDATE USING (auth.uid() = host_id);
CREATE POLICY "Host deletes meetings" ON public.meetings FOR DELETE USING (auth.uid() = host_id);

-- Public can read meeting basics by room_name (for join page)
CREATE POLICY "Public reads meeting by room" ON public.meetings FOR SELECT USING (true);

CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON public.meetings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Attendees
CREATE TABLE public.meeting_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ
);
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can join" ON public.meeting_attendees FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read attendees" ON public.meeting_attendees FOR SELECT USING (true);
CREATE POLICY "Anyone can update own attendance" ON public.meeting_attendees FOR UPDATE USING (true);
CREATE INDEX idx_attendees_meeting ON public.meeting_attendees(meeting_id);

-- Messages
CREATE TABLE public.meeting_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read messages" ON public.meeting_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can send messages" ON public.meeting_messages FOR INSERT WITH CHECK (true);
CREATE INDEX idx_messages_meeting ON public.meeting_messages(meeting_id, created_at);

-- Realtime
ALTER TABLE public.meeting_attendees REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_messages REPLICA IDENTITY FULL;
ALTER TABLE public.meetings REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_attendees;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
