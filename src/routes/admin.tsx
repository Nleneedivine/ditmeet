import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ShieldCheck,
  Users,
  Video,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Clock,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { VelvetCard } from "@/components/brand/VelvetCard";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { durationLabel, downloadAttendanceCSV, computeSummary, type AttendanceRow } from "@/lib/attendance";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Admin Console — DIT Meet" },
      { name: "description", content: "Super-admin console for DIT Meet: every meeting, attendee and AI summary in one place." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Admin Console — DIT Meet" },
      { property: "og:description", content: "Super-admin console for DIT Meet." },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface MeetingRow {
  id: string;
  title: string;
  room_name: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  host_id: string;
}

interface SummaryRow {
  meeting_id: string;
  status: string;
  approved_at: string | null;
  sent_at: string | null;
}

function AdminPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      if (!loading) setAllowed(false);
      return;
    }
    supabase
      .rpc("has_role", { _user_id: user.id, _role: "super_admin" })
      .then(({ data, error }) => setAllowed(error ? false : !!data));
  }, [user, loading]);

  if (loading || allowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Logo size="lg" />
      </div>
    );
  }

  if (!user || !allowed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
        <ShieldCheck className="size-12 text-muted-foreground" />
        <h1 className="font-display text-3xl text-gold">Restricted area</h1>
        <p className="text-muted-foreground max-w-md">
          This console is only available to the DIT platform administrator. Sign in with the
          administrator account to continue.
        </p>
        <Link to="/" className="text-sm text-rainbow hover:underline inline-flex items-center gap-1.5">
          <ArrowLeft className="size-4" /> Back to home
        </Link>
      </main>
    );
  }

  return <AdminConsole />;
}

function AdminConsole() {
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [attendees, setAttendees] = useState<Record<string, AttendanceRow[]>>({});
  const [summaries, setSummaries] = useState<Record<string, SummaryRow>>({});
  const [transcriptCounts, setTranscriptCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: ms }, { data: ss }] = await Promise.all([
        supabase.from("meetings").select("id, title, room_name, status, created_at, started_at, ended_at, host_id").order("created_at", { ascending: false }).limit(200),
        supabase.from("meeting_summaries").select("meeting_id, status, approved_at, sent_at"),
      ]);
      const meetingList = (ms ?? []) as MeetingRow[];
      setMeetings(meetingList);
      setSummaries(Object.fromEntries(((ss ?? []) as SummaryRow[]).map((s) => [s.meeting_id, s])));

      if (meetingList.length) {
        const ids = meetingList.map((m) => m.id);
        const [{ data: atts }, { data: trs }] = await Promise.all([
          supabase.from("meeting_attendees").select("meeting_id, full_name, email, joined_at, left_at, status, is_admin").in("meeting_id", ids).order("joined_at", { ascending: true }),
          supabase.from("meeting_transcripts").select("meeting_id").in("meeting_id", ids).eq("is_interim", false),
        ]);
        const byMeeting: Record<string, AttendanceRow[]> = {};
        for (const a of (atts ?? []) as (AttendanceRow & { meeting_id: string })[]) {
          (byMeeting[a.meeting_id] ??= []).push(a);
        }
        setAttendees(byMeeting);
        const counts: Record<string, number> = {};
        for (const t of (trs ?? []) as { meeting_id: string }[]) {
          counts[t.meeting_id] = (counts[t.meeting_id] ?? 0) + 1;
        }
        setTranscriptCounts(counts);
      }
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const totalAttendees = Object.values(attendees).reduce((n, rows) => n + rows.length, 0);
    return {
      meetings: meetings.length,
      live: meetings.filter((m) => m.status === "live").length,
      attendees: totalAttendees,
      summaries: Object.keys(summaries).length,
    };
  }, [meetings, attendees, summaries]);

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/60">
        <Link to="/" aria-label="DIT Meet home">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-[0.25em] text-rainbow font-semibold hidden sm:inline">Super Admin</span>
          <ThemeToggle />
        </div>
      </header>

      <section className="flex-1 px-6 py-10 max-w-6xl mx-auto w-full">
        <p className="text-sm uppercase tracking-[0.3em] text-rainbow font-semibold">Control room</p>
        <h1 className="font-display text-4xl text-gold mt-1 mb-8">Platform overview</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
          <StatCard icon={<Video className="size-5 text-[#0a1a3a]" />} label="Meetings" value={stats.meetings} sub={`${stats.live} live now`} />
          <StatCard icon={<Users className="size-5 text-[#0a1a3a]" />} label="Attendee records" value={stats.attendees} sub="across all meetings" />
          <StatCard icon={<FileText className="size-5 text-[#0a1a3a]" />} label="AI summaries" value={stats.summaries} sub="generated" />
          <StatCard icon={<Clock className="size-5 text-[#0a1a3a]" />} label="Transcript lines" value={Object.values(transcriptCounts).reduce((a, b) => a + b, 0)} sub="final phrases" />
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading meeting logs…</p>
        ) : meetings.length === 0 ? (
          <p className="text-muted-foreground">No meetings recorded yet.</p>
        ) : (
          <div className="space-y-4">
            {meetings.map((m) => {
              const rows = attendees[m.id] ?? [];
              const s = computeSummary(rows);
              const summary = summaries[m.id];
              const isOpen = expanded === m.id;
              return (
                <VelvetCard key={m.id} glow="soft" className="p-0 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : m.id)}
                    className="w-full flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <h2 className="font-display text-lg text-gold truncate">{m.title}</h2>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(m.created_at), "PP p")} · room {m.room_name}
                      </p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${m.status === "live" ? "border-emerald-400/40 text-emerald-300" : "border-border text-muted-foreground"}`}>
                      {m.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{s.unique} participants · peak {s.peak}</span>
                    <span className="text-xs text-muted-foreground">{transcriptCounts[m.id] ?? 0} lines</span>
                    <span className="text-xs text-muted-foreground">
                      {summary ? `Summary: ${summary.status.replace("_", " ")}` : "No summary"}
                    </span>
                    {isOpen ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border/60 px-5 py-4 space-y-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={`/m/${m.room_name}`}
                          className="text-xs text-rainbow hover:underline"
                        >
                          Open room →
                        </a>
                        <Link
                          to="/summary/$meetingId"
                          params={{ meetingId: m.id }}
                          className="text-xs text-rainbow hover:underline"
                        >
                          Review summary →
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            if (!rows.length) return toast.error("No attendance recorded");
                            downloadAttendanceCSV(m.title, rows);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
                        >
                          <Download className="size-3.5" /> Attendance CSV
                        </button>
                      </div>

                      {rows.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No attendees recorded for this meeting.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border/60">
                                <th className="py-2 pr-4">Name</th>
                                <th className="py-2 pr-4">Email</th>
                                <th className="py-2 pr-4">Role</th>
                                <th className="py-2 pr-4">Joined</th>
                                <th className="py-2 pr-4">Left</th>
                                <th className="py-2">Duration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((r, i) => (
                                <tr key={i} className="border-b border-border/40 last:border-0">
                                  <td className="py-2 pr-4">{r.full_name}</td>
                                  <td className="py-2 pr-4 text-muted-foreground">{r.email || "—"}</td>
                                  <td className="py-2 pr-4">{r.is_admin ? "Host" : "Guest"}</td>
                                  <td className="py-2 pr-4 text-muted-foreground">{format(new Date(r.joined_at), "PP p")}</td>
                                  <td className="py-2 pr-4 text-muted-foreground">{r.left_at ? format(new Date(r.left_at), "PP p") : "still present"}</td>
                                  <td className="py-2">{durationLabel(r.joined_at, r.left_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </VelvetCard>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub: string }) {
  return (
    <VelvetCard glow="soft" className="flex items-center gap-4">
      <div className="size-11 rounded-xl bg-[image:var(--gradient-gold)] flex items-center justify-center glow-gold-sm shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-display text-gold leading-none">{value}</p>
        <p className="text-sm mt-1">{label}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
    </VelvetCard>
  );
}
