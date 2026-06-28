import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Download, Sparkles, RefreshCw } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  generateMeetingSummary,
  approveMeetingSummary,
} from "@/lib/summary.functions";
import { generateSummaryPdf, type SummaryContent } from "@/lib/summary-pdf";
import { Logo } from "@/components/brand/Logo";
import { GoldButton } from "@/components/brand/GoldButton";
import { VelvetCard } from "@/components/brand/VelvetCard";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/summary/$meetingId")({
  component: SummaryReviewPage,
});

interface MeetingRow {
  id: string;
  title: string;
  host_id: string;
  started_at: string | null;
  ended_at: string | null;
}

interface SummaryRow {
  meeting_id: string;
  status: "pending_review" | "approved" | "sent";
  content: SummaryContent;
  approved_at: string | null;
}

function SummaryReviewPage() {
  const { meetingId } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingRow | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [transcript, setTranscript] = useState<
    Array<{ speaker_name: string; text: string; started_at: string }>
  >([]);
  const [attendance, setAttendance] = useState<
    Array<{ full_name: string; email: string | null; joined_at: string; left_at: string | null }>
  >([]);
  const [hostNote, setHostNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    const [{ data: m, error: mErr }, { data: s }, { data: t }, { data: a }] = await Promise.all([
      supabase.from("meetings").select("id, title, host_id, started_at, ended_at").eq("id", meetingId).maybeSingle(),
      supabase.from("meeting_summaries").select("meeting_id, status, content, approved_at").eq("meeting_id", meetingId).maybeSingle(),
      supabase.from("meeting_transcripts").select("speaker_name, text, started_at").eq("meeting_id", meetingId).eq("is_interim", false).order("started_at", { ascending: true }),
      supabase.from("meeting_attendees").select("full_name, email, joined_at, left_at").eq("meeting_id", meetingId),
    ]);
    if (mErr) setLoadErr(mErr.message);
    setMeeting(m as MeetingRow | null);
    setSummary(s as SummaryRow | null);
    setTranscript((t ?? []) as typeof transcript);
    setAttendance((a ?? []) as typeof attendance);
  }, [meetingId]);

  useEffect(() => {
    if (!loading) void load();
  }, [load, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Logo size="md" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <VelvetCard className="max-w-md text-center">
          <p>Please sign in to review the meeting summary.</p>
          <GoldButton className="mt-4" onClick={() => navigate({ to: "/" })}>Home</GoldButton>
        </VelvetCard>
      </div>
    );
  }

  const isHost = meeting && meeting.host_id === user.id;

  const generate = async () => {
    setBusy(true);
    try {
      await generateMeetingSummary({ data: { meetingId } });
      await load();
      toast.success("Summary regenerated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!summary) return;
    setBusy(true);
    try {
      const notes = hostNote.trim()
        ? [{ text: hostNote.trim(), created_at: new Date().toISOString() }]
        : undefined;
      await approveMeetingSummary({ data: { meetingId, content: summary.content as never, hostNotes: notes } });
      toast.success("Approved — participants can now view the summary");
      setHostNote("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = () => {
    if (!meeting || !summary) return;
    generateSummaryPdf({
      meetingTitle: meeting.title,
      startedAt: meeting.started_at,
      endedAt: meeting.ended_at,
      summary: summary.content,
      transcript,
      attendance,
      hostNotes: hostNote.trim() ? [{ text: hostNote.trim() }] : undefined,
    });
  };

  const updateContent = (patch: Partial<SummaryContent>) => {
    if (!summary) return;
    setSummary({ ...summary, content: { ...summary.content, ...patch } });
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="px-4 md:px-6 py-3 flex items-center justify-between border-b border-[var(--border-soft)] bg-card-velvet">
        <Link to="/" className="flex items-center gap-3"><Logo size="sm" /></Link>
        <ThemeToggle />
      </header>

      <section className="flex-1 px-4 md:px-6 py-8 max-w-4xl mx-auto w-full">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="size-3.5" /> Back to dashboard</Link>

        {loadErr && <p className="mt-4 text-rose-300">{loadErr}</p>}

        {meeting && (
          <>
            <h1 className="font-display text-3xl text-gold mt-3">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground">
              {meeting.started_at ? new Date(meeting.started_at).toLocaleString() : ""}
              {meeting.ended_at ? ` → ${new Date(meeting.ended_at).toLocaleString()}` : ""}
            </p>

            {!summary ? (
              <VelvetCard className="mt-6 text-center" glow="soft">
                <p className="text-foreground">No AI summary has been generated yet for this meeting.</p>
                {isHost && (
                  <GoldButton className="mt-4" onClick={generate} disabled={busy}>
                    <Sparkles className="size-4" /> {busy ? "Generating…" : "Generate AI summary"}
                  </GoldButton>
                )}
              </VelvetCard>
            ) : (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className={`px-2 py-1 rounded-full uppercase tracking-wider ${
                    summary.status === "approved" || summary.status === "sent"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
                      : "bg-[oklch(0.82_0.16_88/0.15)] text-[oklch(0.92_0.10_88)] border border-[oklch(0.82_0.16_88/0.4)]"
                  }`}>
                    {summary.status.replace("_", " ")}
                  </span>
                  {summary.approved_at && (
                    <span className="text-muted-foreground">Approved {new Date(summary.approved_at).toLocaleString()}</span>
                  )}
                </div>

                <VelvetCard className="mt-6" glow="soft">
                  <h2 className="font-display text-xl text-gold mb-3">Overview</h2>
                  {isHost && summary.status === "pending_review" ? (
                    <Textarea
                      rows={4}
                      value={summary.content.overview ?? ""}
                      onChange={(e) => updateContent({ overview: e.target.value })}
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-foreground/90">{summary.content.overview}</p>
                  )}
                </VelvetCard>

                <VelvetCard className="mt-4" glow="soft">
                  <h2 className="font-display text-xl text-gold mb-3">Action Items</h2>
                  {(summary.content.action_items ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No action items detected.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(summary.content.action_items ?? []).map((a, i) => (
                        <li key={i} className="flex flex-wrap gap-2 items-center text-sm">
                          <span className="px-2 py-0.5 rounded-full bg-[image:var(--gradient-gold)] text-[#0a1a3a] font-semibold text-xs">{a.owner}</span>
                          {isHost && summary.status === "pending_review" ? (
                            <Input
                              className="flex-1 min-w-[200px]"
                              value={a.text}
                              onChange={(e) => {
                                const items = [...(summary.content.action_items ?? [])];
                                items[i] = { ...items[i], text: e.target.value };
                                updateContent({ action_items: items });
                              }}
                            />
                          ) : (
                            <span className="flex-1">{a.text}</span>
                          )}
                          {a.due && <span className="text-xs text-muted-foreground">due {a.due}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </VelvetCard>

                {(summary.content.key_points ?? []).length > 0 && (
                  <VelvetCard className="mt-4" glow="soft">
                    <h2 className="font-display text-xl text-gold mb-3">Key Points</h2>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-foreground/90">
                      {(summary.content.key_points ?? []).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </VelvetCard>
                )}

                {(summary.content.decisions ?? []).length > 0 && (
                  <VelvetCard className="mt-4" glow="soft">
                    <h2 className="font-display text-xl text-gold mb-3">Decisions</h2>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-foreground/90">
                      {(summary.content.decisions ?? []).map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </VelvetCard>
                )}

                {(summary.content.typo_flags ?? []).length > 0 && (
                  <VelvetCard className="mt-4" glow="soft">
                    <h2 className="font-display text-xl text-gold mb-3">AI Transcription Flags</h2>
                    <ul className="space-y-1 text-sm">
                      {(summary.content.typo_flags ?? []).map((f, i) => (
                        <li key={i}>
                          <span className="line-through text-rose-300">{f.original}</span> →{" "}
                          <span className="text-emerald-300">{f.suggestion}</span>
                          <span className="text-xs text-muted-foreground"> · {f.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </VelvetCard>
                )}

                <VelvetCard className="mt-4" glow="soft">
                  <h2 className="font-display text-xl text-gold mb-3">Transcript</h2>
                  <p className="text-xs text-muted-foreground mb-2">Raw transcript — not editable. Highlight by adding host notes below.</p>
                  <div className="max-h-96 overflow-auto border border-border rounded-xl p-3 text-sm space-y-1 bg-black/20">
                    {transcript.length === 0 ? (
                      <p className="text-muted-foreground">No transcript captured.</p>
                    ) : (
                      transcript.map((t, i) => (
                        <p key={i}>
                          <span className="text-muted-foreground tabular-nums text-xs">[{new Date(t.started_at).toISOString().substring(11, 19)}]</span>{" "}
                          <span className="text-[oklch(0.92_0.10_88)] font-medium">{t.speaker_name}:</span>{" "}
                          <span className="text-foreground/90">{t.text}</span>
                        </p>
                      ))
                    )}
                  </div>
                </VelvetCard>

                {isHost && (
                  <VelvetCard className="mt-4" glow="soft">
                    <h2 className="font-display text-xl text-gold mb-3">Host Note</h2>
                    <Textarea rows={3} value={hostNote} onChange={(e) => setHostNote(e.target.value)} placeholder="Add context, clarifications, or highlights for participants…" />
                  </VelvetCard>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  {isHost && summary.status === "pending_review" && (
                    <GoldButton onClick={approve} disabled={busy}>
                      <CheckCircle2 className="size-4" /> Approve & share with participants
                    </GoldButton>
                  )}
                  <GoldButton variant="outline" onClick={downloadPdf}>
                    <Download className="size-4" /> Download PDF
                  </GoldButton>
                  {isHost && (
                    <GoldButton variant="ghost" onClick={generate} disabled={busy}>
                      <RefreshCw className="size-4" /> Regenerate
                    </GoldButton>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
