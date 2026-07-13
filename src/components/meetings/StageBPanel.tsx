import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ListChecks,
  BarChart3,
  Handshake,
  Plus,
  Check,
  X,
  ThumbsUp,
  AlertTriangle,
  Play,
  Trash2,
  Lock,
} from "lucide-react";
import { GoldButton } from "@/components/brand/GoldButton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Props {
  meetingId: string;
  attendeeId: string;
  guestName: string;
  isOwner: boolean;
}

interface AgendaItem {
  id: string;
  meeting_id: string;
  position: number;
  title: string;
  notes: string | null;
  status: "pending" | "active" | "done";
}

interface Poll {
  id: string;
  meeting_id: string;
  creator_name: string;
  created_by: string | null;
  question: string;
  options: string[];
  anonymous: boolean;
  closed_at: string | null;
}

interface Vote {
  id: string;
  poll_id: string;
  attendee_id: string;
  voter_name: string;
  option_index: number;
}

interface Commitment {
  id: string;
  meeting_id: string;
  speaker_name: string;
  speaker_attendee_id: string | null;
  text: string;
  status: "proposed" | "accepted" | "declined" | "retracted";
  source: string;
}

interface Reaction {
  id: string;
  commitment_id: string;
  attendee_id: string;
  reactor_name: string;
  kind: "endorse" | "challenge";
}

export function StageBPanel({ meetingId, attendeeId, guestName, isOwner }: Props) {
  return (
    <Tabs defaultValue="agenda" className="flex-1 flex flex-col overflow-hidden">
      <TabsList className="mx-3 mt-3 grid grid-cols-3 bg-white/5">
        <TabsTrigger value="agenda" className="text-xs gap-1">
          <ListChecks className="size-3.5" /> Agenda
        </TabsTrigger>
        <TabsTrigger value="polls" className="text-xs gap-1">
          <BarChart3 className="size-3.5" /> Polls
        </TabsTrigger>
        <TabsTrigger value="commitments" className="text-xs gap-1">
          <Handshake className="size-3.5" /> Commit
        </TabsTrigger>
      </TabsList>
      <TabsContent value="agenda" className="flex-1 overflow-auto p-3 mt-0">
        <AgendaTab meetingId={meetingId} isOwner={isOwner} />
      </TabsContent>
      <TabsContent value="polls" className="flex-1 overflow-auto p-3 mt-0">
        <PollsTab
          meetingId={meetingId}
          attendeeId={attendeeId}
          guestName={guestName}
          isOwner={isOwner}
        />
      </TabsContent>
      <TabsContent value="commitments" className="flex-1 overflow-auto p-3 mt-0">
        <CommitmentsTab
          meetingId={meetingId}
          attendeeId={attendeeId}
          guestName={guestName}
          isOwner={isOwner}
        />
      </TabsContent>
    </Tabs>
  );
}

/* ================= AGENDA ================= */

function AgendaTab({ meetingId, isOwner }: { meetingId: string; isOwner: boolean }) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meeting_agenda_items")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("position", { ascending: true });
      setItems((data ?? []) as AgendaItem[]);
    })();
    const ch = supabase
      .channel(`agenda:${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_agenda_items",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (p) => {
          setItems((prev) => {
            if (p.eventType === "INSERT")
              return [...prev, p.new as AgendaItem].sort((a, b) => a.position - b.position);
            if (p.eventType === "UPDATE")
              return prev.map((r) => (r.id === (p.new as AgendaItem).id ? (p.new as AgendaItem) : r));
            if (p.eventType === "DELETE")
              return prev.filter((r) => r.id !== (p.old as AgendaItem).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [meetingId]);

  const addItem = async () => {
    if (!title.trim()) return;
    const pos = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const { error } = await supabase.from("meeting_agenda_items").insert({
      meeting_id: meetingId,
      title: title.trim(),
      position: pos,
    });
    if (error) toast.error("Could not add agenda item");
    else setTitle("");
  };

  const setStatus = async (id: string, status: AgendaItem["status"]) => {
    // Set only one active at a time
    if (status === "active") {
      await supabase
        .from("meeting_agenda_items")
        .update({ status: "pending" })
        .eq("meeting_id", meetingId)
        .eq("status", "active");
    }
    await supabase
      .from("meeting_agenda_items")
      .update({
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      })
      .eq("id", id);
  };

  const remove = async (id: string) => {
    await supabase.from("meeting_agenda_items").delete().eq("id", id);
  };

  const active = items.find((i) => i.status === "active");
  const done = items.filter((i) => i.status === "done").length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-3">
      {items.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <div className="flex justify-between mb-1">
            <span>Progress</span>
            <span className="tabular-nums">
              {done}/{items.length} · {progress}%
            </span>
          </div>
          <div className="h-1.5 rounded bg-white/5 overflow-hidden">
            <div
              className="h-full bg-[image:var(--gradient-gold)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          {active && (
            <p className="mt-2 text-gold">
              Now: <span className="text-foreground font-medium">{active.title}</span>
            </p>
          )}
        </div>
      )}

      {isOwner && (
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Add agenda item…"
            className="bg-white/5 border-border text-sm"
          />
          <GoldButton size="sm" onClick={addItem}>
            <Plus className="size-4" />
          </GoldButton>
        </div>
      )}

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          {isOwner ? "Add items to guide the meeting." : "No agenda yet."}
        </p>
      )}

      <ul className="space-y-2">
        {items.map((it, idx) => (
          <li
            key={it.id}
            className={`rounded-lg p-2.5 border text-sm flex items-start gap-2 ${
              it.status === "active"
                ? "border-gold bg-[oklch(0.82_0.16_88/0.08)]"
                : it.status === "done"
                  ? "border-border bg-white/[0.02] opacity-60"
                  : "border-border bg-white/[0.02]"
            }`}
          >
            <span className="text-xs text-muted-foreground tabular-nums mt-0.5">{idx + 1}.</span>
            <div className="flex-1 min-w-0">
              <p
                className={`text-foreground truncate ${it.status === "done" ? "line-through" : ""}`}
              >
                {it.title}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {it.status}
              </p>
            </div>
            {isOwner && (
              <div className="flex gap-1 shrink-0">
                {it.status !== "active" && it.status !== "done" && (
                  <button
                    onClick={() => setStatus(it.id, "active")}
                    className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10 text-gold"
                    title="Start"
                  >
                    <Play className="size-3.5" />
                  </button>
                )}
                {it.status !== "done" && (
                  <button
                    onClick={() => setStatus(it.id, "done")}
                    className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10 text-emerald-400"
                    title="Complete"
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => remove(it.id)}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10 text-rose-400"
                  title="Remove"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================= POLLS ================= */

function PollsTab({
  meetingId,
  attendeeId,
  guestName,
  isOwner,
}: {
  meetingId: string;
  attendeeId: string;
  guestName: string;
  isOwner: boolean;
}) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    (async () => {
      const [pRes, vRes] = await Promise.all([
        supabase
          .from("meeting_polls")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: false }),
        supabase
          .from("meeting_poll_votes")
          .select("*, meeting_polls!inner(meeting_id)")
          .eq("meeting_polls.meeting_id", meetingId),
      ]);
      setPolls(
        ((pRes.data ?? []) as unknown as Poll[]).map((p) => ({
          ...p,
          options: Array.isArray(p.options) ? p.options : [],
        })),
      );
      setVotes((vRes.data ?? []) as unknown as Vote[]);
    })();

    const ch = supabase
      .channel(`polls:${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_polls",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (p) => {
          setPolls((prev) => {
            if (p.eventType === "INSERT") return [p.new as Poll, ...prev];
            if (p.eventType === "UPDATE")
              return prev.map((r) => (r.id === (p.new as Poll).id ? (p.new as Poll) : r));
            if (p.eventType === "DELETE") return prev.filter((r) => r.id !== (p.old as Poll).id);
            return prev;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_poll_votes" },
        (p) => {
          setVotes((prev) => {
            if (p.eventType === "INSERT") return [...prev, p.new as Vote];
            if (p.eventType === "UPDATE")
              return prev.map((v) => (v.id === (p.new as Vote).id ? (p.new as Vote) : v));
            if (p.eventType === "DELETE") return prev.filter((v) => v.id !== (p.old as Vote).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [meetingId]);

  const castVote = async (pollId: string, optionIndex: number) => {
    const existing = votes.find((v) => v.poll_id === pollId && v.attendee_id === attendeeId);
    if (existing) {
      await supabase
        .from("meeting_poll_votes")
        .update({ option_index: optionIndex })
        .eq("id", existing.id);
    } else {
      const { error } = await supabase.from("meeting_poll_votes").insert({
        poll_id: pollId,
        attendee_id: attendeeId,
        voter_name: guestName,
        option_index: optionIndex,
      });
      if (error) toast.error("Could not vote");
    }
  };

  const closePoll = async (id: string) => {
    await supabase
      .from("meeting_polls")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", id);
  };

  const removePoll = async (id: string) => {
    await supabase.from("meeting_polls").delete().eq("id", id);
  };

  return (
    <div className="space-y-3">
      {!showNew ? (
        <GoldButton size="sm" onClick={() => setShowNew(true)} className="w-full">
          <Plus className="size-4 mr-1" /> New poll
        </GoldButton>
      ) : (
        <NewPollForm
          meetingId={meetingId}
          creatorName={guestName}
          onDone={() => setShowNew(false)}
        />
      )}

      {polls.length === 0 && !showNew && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No polls yet. Launch one to get instant feedback.
        </p>
      )}

      <ul className="space-y-3">
        {polls.map((poll) => {
          const pollVotes = votes.filter((v) => v.poll_id === poll.id);
          const myVote = pollVotes.find((v) => v.attendee_id === attendeeId);
          const total = pollVotes.length;
          const canManage = isOwner;
          return (
            <li
              key={poll.id}
              className="rounded-lg border border-border bg-white/[0.02] p-3 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{poll.question}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    by {poll.creator_name} · {total} vote{total === 1 ? "" : "s"}
                    {poll.closed_at && " · closed"}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-1 shrink-0">
                    {!poll.closed_at && (
                      <button
                        onClick={() => closePoll(poll.id)}
                        className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10 text-gold"
                        title="Close poll"
                      >
                        <Lock className="size-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removePoll(poll.id)}
                      className="text-xs px-1.5 py-0.5 rounded hover:bg-white/10 text-rose-400"
                      title="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <ul className="space-y-1.5">
                {poll.options.map((opt, i) => {
                  const count = pollVotes.filter((v) => v.option_index === i).length;
                  const pct = total ? Math.round((count / total) * 100) : 0;
                  const mine = myVote?.option_index === i;
                  const disabled = !!poll.closed_at;
                  return (
                    <li key={i}>
                      <button
                        disabled={disabled}
                        onClick={() => castVote(poll.id, i)}
                        className={`relative w-full text-left px-3 py-2 rounded-md text-sm border overflow-hidden transition-colors ${
                          mine
                            ? "border-gold bg-[oklch(0.82_0.16_88/0.1)]"
                            : "border-border hover:bg-white/5"
                        } ${disabled ? "cursor-not-allowed opacity-70" : ""}`}
                      >
                        <span
                          className="absolute inset-y-0 left-0 bg-[image:var(--gradient-gold)] opacity-20 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="relative flex justify-between gap-2">
                          <span className="truncate">
                            {mine && "✓ "}
                            {opt}
                          </span>
                          <span className="tabular-nums text-xs text-muted-foreground">
                            {count} · {pct}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {!poll.anonymous && total > 0 && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {pollVotes
                    .map((v) => v.voter_name)
                    .slice(0, 8)
                    .join(", ")}
                  {pollVotes.length > 8 && ` +${pollVotes.length - 8}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewPollForm({
  meetingId,
  creatorName,
  onDone,
}: {
  meetingId: string;
  creatorName: string;
  onDone: () => void;
}) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<string[]>(["", ""]);
  const [anon, setAnon] = useState(false);

  const submit = async () => {
    const clean = opts.map((o) => o.trim()).filter(Boolean);
    if (!q.trim() || clean.length < 2) {
      toast.error("Add a question and at least 2 options");
      return;
    }
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.from("meeting_polls").insert({
      meeting_id: meetingId,
      creator_name: creatorName,
      created_by: userRes.user?.id ?? null,
      question: q.trim(),
      options: clean,
      anonymous: anon,
    });
    if (error) toast.error("Could not create poll");
    else onDone();
  };

  return (
    <div className="rounded-lg border border-gold bg-[oklch(0.82_0.16_88/0.05)] p-3 space-y-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Poll question"
        className="bg-white/5 border-border text-sm"
      />
      {opts.map((o, i) => (
        <div key={i} className="flex gap-1.5">
          <Input
            value={o}
            onChange={(e) => setOpts((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
            placeholder={`Option ${i + 1}`}
            className="bg-white/5 border-border text-sm"
          />
          {opts.length > 2 && (
            <button
              onClick={() => setOpts((prev) => prev.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-rose-400 px-1"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setOpts((p) => [...p, ""])}
          className="text-xs text-gold hover:underline"
        >
          + Option
        </button>
        <label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          Anonymous
        </label>
      </div>
      <div className="flex gap-2 pt-1">
        <GoldButton size="sm" onClick={submit} className="flex-1">
          Launch
        </GoldButton>
        <GoldButton size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </GoldButton>
      </div>
    </div>
  );
}

/* ================= COMMITMENTS ================= */

const COMMIT_REGEX =
  /\b(?:i(?:'| wi)ll|i am going to|i'm going to|we(?:'| wi)ll|we are going to|i commit to|we commit to|by (?:tomorrow|monday|tuesday|wednesday|thursday|friday|next week|end of (?:week|day|month)))\b[^.?!]*[.?!]?/i;

function CommitmentsTab({
  meetingId,
  attendeeId,
  guestName,
  isOwner,
}: {
  meetingId: string;
  attendeeId: string;
  guestName: string;
  isOwner: boolean;
}) {
  const [items, setItems] = useState<Commitment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [manual, setManual] = useState("");
  const seenTranscriptRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [cRes, rRes] = await Promise.all([
        supabase
          .from("meeting_commitments")
          .select("*")
          .eq("meeting_id", meetingId)
          .order("created_at", { ascending: false }),
        supabase
          .from("meeting_commitment_reactions")
          .select("*, meeting_commitments!inner(meeting_id)")
          .eq("meeting_commitments.meeting_id", meetingId),
      ]);
      setItems((cRes.data ?? []) as Commitment[]);
      setReactions((rRes.data ?? []) as unknown as Reaction[]);
    })();

    const ch = supabase
      .channel(`commits:${meetingId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_commitments",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (p) => {
          setItems((prev) => {
            if (p.eventType === "INSERT") return [p.new as Commitment, ...prev];
            if (p.eventType === "UPDATE")
              return prev.map((c) =>
                c.id === (p.new as Commitment).id ? (p.new as Commitment) : c,
              );
            if (p.eventType === "DELETE")
              return prev.filter((c) => c.id !== (p.old as Commitment).id);
            return prev;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_commitment_reactions" },
        (p) => {
          setReactions((prev) => {
            if (p.eventType === "INSERT") return [...prev, p.new as Reaction];
            if (p.eventType === "DELETE")
              return prev.filter((r) => r.id !== (p.old as Reaction).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [meetingId]);

  // Client-side AI-style detector: watch our own final transcripts and
  // propose commitments when a first-person promise phrase appears.
  useEffect(() => {
    const ch = supabase
      .channel(`commit-detect:${meetingId}:${attendeeId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_transcripts",
          filter: `meeting_id=eq.${meetingId}`,
        },
        async (p) => {
          const row = p.new as {
            id: string;
            attendee_id: string;
            speaker_name: string;
            text: string;
            is_interim: boolean;
          };
          if (row.is_interim) return;
          if (row.attendee_id !== attendeeId) return; // each client only proposes for its own speech
          if (seenTranscriptRef.current.has(row.id)) return;
          seenTranscriptRef.current.add(row.id);
          const match = row.text.match(COMMIT_REGEX);
          if (!match) return;
          const excerpt = match[0].trim().slice(0, 240);
          if (excerpt.length < 8) return;
          await supabase.from("meeting_commitments").insert({
            meeting_id: meetingId,
            speaker_attendee_id: attendeeId,
            speaker_name: row.speaker_name,
            text: excerpt,
            source: "ai",
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [meetingId, attendeeId]);

  const addManual = async () => {
    if (!manual.trim()) return;
    await supabase.from("meeting_commitments").insert({
      meeting_id: meetingId,
      speaker_attendee_id: attendeeId,
      speaker_name: guestName,
      text: manual.trim(),
      source: "manual",
    });
    setManual("");
  };

  const decide = async (c: Commitment, status: "accepted" | "declined" | "retracted") => {
    await supabase
      .from("meeting_commitments")
      .update({ status, decided_at: new Date().toISOString() })
      .eq("id", c.id);
  };

  const react = async (c: Commitment, kind: "endorse" | "challenge") => {
    const mine = reactions.find((r) => r.commitment_id === c.id && r.attendee_id === attendeeId);
    if (mine && mine.kind === kind) {
      // toggle off
      await supabase.from("meeting_commitment_reactions").delete().eq("id", mine.id);
      return;
    }
    if (mine) {
      await supabase.from("meeting_commitment_reactions").delete().eq("id", mine.id);
    }
    await supabase.from("meeting_commitment_reactions").insert({
      commitment_id: c.id,
      attendee_id: attendeeId,
      reactor_name: guestName,
      kind,
    });
  };

  const remove = async (id: string) => {
    await supabase.from("meeting_commitments").delete().eq("id", id);
  };

  const byStatus = useMemo(() => {
    const g: Record<string, Commitment[]> = { proposed: [], accepted: [], declined: [] };
    for (const c of items) {
      if (c.status === "retracted") continue;
      (g[c.status] ||= []).push(c);
    }
    return g;
  }, [items]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Textarea
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder='Log a commitment (e.g., "I\'ll send the deck by Friday")'
          className="bg-white/5 border-border text-sm min-h-[64px]"
        />
        <GoldButton size="sm" onClick={addManual} className="self-start">
          <Plus className="size-4" />
        </GoldButton>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Auto-detected from your speech via live captions. Accept or decline each.
      </p>

      {items.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No commitments captured yet.
        </p>
      )}

      {(["proposed", "accepted", "declined"] as const).map((group) => {
        const list = byStatus[group] ?? [];
        if (list.length === 0) return null;
        return (
          <section key={group} className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              {group === "proposed"
                ? `Proposed (${list.length})`
                : group === "accepted"
                  ? `Accepted (${list.length})`
                  : `Declined (${list.length})`}
            </p>
            <ul className="space-y-2">
              {list.map((c) => {
                const rx = reactions.filter((r) => r.commitment_id === c.id);
                const endorse = rx.filter((r) => r.kind === "endorse").length;
                const challenge = rx.filter((r) => r.kind === "challenge").length;
                const mine = rx.find((r) => r.attendee_id === attendeeId);
                const isMineToAccept = c.speaker_attendee_id === attendeeId;
                return (
                  <li
                    key={c.id}
                    className="rounded-lg border border-border bg-white/[0.02] p-2.5 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">{c.text}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {c.speaker_name} ·{" "}
                          {c.source === "ai" ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-gold text-gold">
                              AI
                            </Badge>
                          ) : (
                            "Manual"
                          )}
                        </p>
                      </div>
                      {(isOwner || isMineToAccept) && (
                        <button
                          onClick={() => remove(c.id)}
                          className="text-xs text-muted-foreground hover:text-rose-400 shrink-0"
                          title="Remove"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {c.status === "proposed" && isMineToAccept && (
                        <>
                          <GoldButton size="sm" onClick={() => decide(c, "accepted")}>
                            <Check className="size-3.5 mr-1" /> Accept
                          </GoldButton>
                          <GoldButton
                            size="sm"
                            variant="ghost"
                            onClick={() => decide(c, "declined")}
                          >
                            <X className="size-3.5 mr-1" /> Decline
                          </GoldButton>
                        </>
                      )}
                      {c.status === "accepted" && isMineToAccept && (
                        <button
                          onClick={() => decide(c, "retracted")}
                          className="text-[10px] text-muted-foreground hover:text-rose-400"
                        >
                          Retract
                        </button>
                      )}

                      <button
                        onClick={() => react(c, "endorse")}
                        className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 border transition-colors ${
                          mine?.kind === "endorse"
                            ? "border-emerald-400 text-emerald-400 bg-emerald-400/10"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <ThumbsUp className="size-3" /> {endorse}
                      </button>
                      <button
                        onClick={() => react(c, "challenge")}
                        className={`text-xs px-2 py-1 rounded-md flex items-center gap-1 border transition-colors ${
                          mine?.kind === "challenge"
                            ? "border-amber-400 text-amber-400 bg-amber-400/10"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <AlertTriangle className="size-3" /> {challenge}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
