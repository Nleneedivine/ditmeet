import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Calendar, Copy, LogOut, Plus, Sparkles, Video } from "lucide-react";

import { useAuth, signOut } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { createDailyRoom } from "@/lib/daily.functions";
import { lovable } from "@/integrations/lovable/index";

import { Logo } from "@/components/brand/Logo";
import { GoldButton } from "@/components/brand/GoldButton";
import { VelvetCard } from "@/components/brand/VelvetCard";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { ScheduleDialog } from "@/components/meetings/ScheduleDialog";

export const Route = createFileRoute("/")({ component: Home });

interface Meeting {
  id: string;
  title: string;
  description: string | null;
  room_name: string;
  room_url: string;
  scheduled_at: string | null;
  status: string;
  created_at: string;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Logo size="lg" />
      </div>
    );
  }
  return user ? <Dashboard user={user} /> : <Landing />;
}

function Landing() {
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogle = async () => {
    setSigningIn(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message || "Sign-in failed");
      setSigningIn(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col">
      <Header showLogo={false} />
      <section className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-3xl text-center animate-fade-up">
          <div className="float-soft inline-block">
            <Logo size="xl" />
          </div>
          <h1 className="mt-8 font-display text-4xl md:text-6xl font-bold leading-tight">
            <span className="text-gold">Meetings,</span>{" "}
            <span className="text-rainbow">in concert.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            DIT Meet is the velvet-curtain conferencing room for the DIT 10th anniversary. Sign in with Google to host, or join any room with a single link.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <GoldButton size="lg" onClick={handleGoogle} disabled={signingIn} className="glow-pulse">
              <Sparkles className="size-4" />
              <span>{signingIn ? "Opening Google…" : "Sign in with Google"}</span>
            </GoldButton>
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
              Have a meeting link? Open it in your browser →
            </Link>
          </div>
          <div className="mt-20 grid gap-4 md:grid-cols-3">
            {[
              { t: "Instant rooms", d: "One click. Crisp blue trim. No waiting." },
              { t: "Scheduled sessions", d: "Plan ahead. Share an elegant link." },
              { t: "Guest-friendly", d: "No account required to join — just name & email." },
            ].map((f) => (
              <VelvetCard key={f.t} className="text-left" glow="soft">
                <h3 className="text-gold text-lg font-semibold">{f.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.d}</p>
              </VelvetCard>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function Dashboard({ user }: { user: import("@supabase/supabase-js").User }) {
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingInstant, setStartingInstant] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) return;
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "super_admin" })
      .then(({ data }) => { if (!cancelled) setIsSuperAdmin(Boolean(data)); });
    return () => { cancelled = true; };
  }, [user?.id]);


  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("meetings")
      .select("*")
      .eq("host_id", user!.id)
      .order("created_at", { ascending: false });
    setMeetings((data ?? []) as Meeting[]);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user?.id]);

  const startInstant = async () => {
    setStartingInstant(true);
    try {
      const room = await createDailyRoom({ data: { prefix: "ditm", expiresInMinutes: 180 } });
      const { data, error } = await supabase
        .from("meetings")
        .insert({
          host_id: user!.id,
          title: "Instant meeting",
          room_name: room.name,
          room_url: room.url,
          status: "live",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/m/${data.room_name}`;
      try { await navigator.clipboard.writeText(link); toast.success("Link copied to clipboard"); } catch { /* noop */ }
      navigate({ to: "/m/$roomName", params: { roomName: data.room_name } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start meeting");
      setStartingInstant(false);
    }
  };

  const copyLink = (roomName: string) => {
    const url = `${window.location.origin}/m/${roomName}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied", { description: url });
  };

  const upcoming = meetings.filter((m) => m.scheduled_at && m.status !== "ended" && new Date(m.scheduled_at) > new Date(Date.now() - 60 * 60 * 1000));
  const history = meetings.filter((m) => !upcoming.includes(m));

  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <section className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-rainbow font-semibold">Backstage</p>
            <h1 className="font-display text-4xl text-gold mt-1">Welcome, {user?.user_metadata?.full_name?.split(" ")[0] ?? "Host"}</h1>
          </div>
          <button onClick={signOut} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 mb-12">
          <VelvetCard glow="strong" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-[image:var(--gradient-gold)] flex items-center justify-center glow-gold-sm">
                <Video className="size-6 text-[#0a1a3a]" />
              </div>
              <div>
                <h2 className="font-display text-2xl text-gold">Start Instant Meeting</h2>
                <p className="text-sm text-muted-foreground">Open the room now and share the link.</p>
              </div>
            </div>
            <GoldButton size="lg" onClick={startInstant} disabled={startingInstant}>
              <Sparkles className="size-4" /> {startingInstant ? "Raising the curtain…" : "Go Live"}
            </GoldButton>
          </VelvetCard>

          <VelvetCard glow="holo" className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-holo flex items-center justify-center">
                <Calendar className="size-6 text-[#0a1a3a]" />
              </div>
              <div>
                <h2 className="font-display text-2xl">Schedule a Meeting</h2>
                <p className="text-sm text-muted-foreground">Pick a date, title, and invite guests.</p>
              </div>
            </div>
            <GoldButton variant="outline" size="lg" onClick={() => setScheduleOpen(true)}>
              <Plus className="size-4" /> New scheduled meeting
            </GoldButton>
          </VelvetCard>
        </div>

        <Section title="Upcoming">
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : upcoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No upcoming meetings. Schedule one above.</p>
          ) : (
            <div className="grid gap-3">
              {upcoming.map((m) => (
                <MeetingRow key={m.id} m={m} onCopy={copyLink} onOpen={() => navigate({ to: "/m/$roomName", params: { roomName: m.room_name } })} />
              ))}
            </div>
          )}
        </Section>

        <Section title="History">
          {history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No past meetings yet.</p>
          ) : (
            <div className="grid gap-3">
              {history.map((m) => (
                <MeetingRow key={m.id} m={m} onCopy={copyLink} onOpen={() => navigate({ to: "/m/$roomName", params: { roomName: m.room_name } })} />
              ))}
            </div>
          )}
        </Section>
      </section>
      <Footer />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        hostId={user!.id}
        onCreated={load}
      />
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h3 className="font-display text-xl text-gold mb-3 flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent via-[oklch(0.82_0.16_88/0.4)] to-transparent" />
        {title}
        <span className="h-px flex-1 bg-gradient-to-r from-[oklch(0.82_0.16_88/0.4)] via-transparent to-transparent" />
      </h3>
      {children}
    </div>
  );
}

function MeetingRow({ m, onCopy, onOpen }: { m: Meeting; onCopy: (n: string) => void; onOpen: () => void }) {
  return (
    <VelvetCard glow="soft" className="flex items-center justify-between gap-4 flex-wrap py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-foreground font-medium truncate">{m.title}</h4>
          <StatusPill status={m.status} />
        </div>
        {m.description && <p className="text-sm text-muted-foreground truncate mt-0.5">{m.description}</p>}
        <p className="text-xs text-muted-foreground mt-1">
          {m.scheduled_at ? format(new Date(m.scheduled_at), "EEE, MMM d · h:mm a") : format(new Date(m.created_at), "MMM d, yyyy")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <GoldButton variant="ghost" size="sm" onClick={() => onCopy(m.room_name)}>
          <Copy className="size-3.5" /> Copy link
        </GoldButton>
        <GoldButton size="sm" onClick={onOpen}>Open</GoldButton>
      </div>
    </VelvetCard>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-rose-500/20 text-rose-300 border-rose-400/40",
    scheduled: "bg-[oklch(0.82_0.16_88/0.15)] text-[oklch(0.92_0.10_88)] border-[oklch(0.82_0.16_88/0.4)]",
    ended: "bg-white/5 text-muted-foreground border-white/10",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${map[status] ?? map.ended}`}>
      {status}
    </span>
  );
}

function Header({ showLogo = true }: { showLogo?: boolean }) {
  const { user } = useAuth();
  return (
    <header className="px-4 md:px-6 py-3 flex items-center justify-between border-b border-[var(--border-soft)] backdrop-blur-sm bg-card-velvet">
      <Link to="/" className="flex items-center gap-3 min-w-0">
        {showLogo && <Logo size="sm" />}
      </Link>
      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden md:inline text-sm text-muted-foreground truncate max-w-[200px]">{user.email}</span>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="px-6 py-6 text-center text-xs text-muted-foreground/70">
      © DIT Meet · Divine Intelligence Team · Powered by Daily
    </footer>
  );
}
