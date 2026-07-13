import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import {
  DailyAudio,
  DailyProvider,
  useDaily,
  useDailyEvent,
  useLocalSessionId,
  useParticipantIds,
  useParticipantProperty,
  useScreenShare,
  useVideoTrack,
  useAudioTrack,
} from "@daily-co/daily-react";
import { toast } from "sonner";
import {
  Circle,
  Copy,
  Crown,
  Download,
  Hand,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreVertical,
  PartyPopper,
  Pencil,
  Pin,
  PinOff,
  Send,
  Sparkles,
  Square,
  Timer,
  Trash2,
  Users,
  Video as VideoIcon,
  VideoOff,
  Wand2,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createDailyMeetingToken } from "@/lib/daily.functions";
import { useLiveTranscription } from "@/hooks/use-live-transcription";
import { CaptionStrip } from "@/components/meetings/CaptionStrip";
import { StageBPanel } from "@/components/meetings/StageBPanel";
import { generateMeetingSummary } from "@/lib/summary.functions";
import { computeSummary, downloadAttendanceCSV, durationLabel, type AttendanceRow } from "@/lib/attendance";
import { Logo } from "@/components/brand/Logo";
import { GoldButton } from "@/components/brand/GoldButton";
import { VelvetCard } from "@/components/brand/VelvetCard";
import { ThemeToggle } from "@/components/brand/ThemeToggle";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const Route = createFileRoute("/m/$roomName")({ component: MeetingPage });

interface MeetingMeta {
  id: string;
  title: string;
  room_url: string;
  room_name: string;
  host_id: string;
  waiting_room_enabled: boolean;
  recording_started_at: string | null;
  ended_at: string | null;
}

interface ChatMessage {
  id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

interface AttendeeRow extends AttendanceRow {
  id: string;
  meeting_id: string;
  hand_raised_at: string | null;
}

interface SpeakerTimer {
  id: string;
  meeting_id: string;
  attendee_id: string;
  seconds: number;
  started_at: string;
}

const REACTION_EMOJIS = ["👏", "🎉", "❤️", "😂", "🔥", "👍"];

function MeetingPage() {
  const { roomName } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<MeetingMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [attendeeId, setAttendeeId] = useState<string | null>(null);
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [summary, setSummary] = useState<null | { rows: AttendeeRow[] }>(null);

  // Load meeting
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, room_url, room_name, host_id, waiting_room_enabled, recording_started_at, ended_at")
        .eq("room_name", roomName)
        .maybeSingle();
      if (error || !data) {
        setLoadError("This meeting link is invalid or has expired.");
        return;
      }
      setMeeting(data as MeetingMeta);
    })();
  }, [roomName]);

  // Prefill identity for signed-in users
  useEffect(() => {
    if (user && !name) setName((user.user_metadata?.full_name as string) ?? user.email?.split("@")[0] ?? "");
    if (user?.email && !email) setEmail(user.email);
  }, [user, name, email]);

  // Listen for waiting-room admission
  useEffect(() => {
    if (!waiting || !attendeeId) return;
    const ch = supabase
      .channel(`att:${attendeeId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meeting_attendees", filter: `id=eq.${attendeeId}` },
        async (payload) => {
          const row = payload.new as { status: string };
          if (row.status === "admitted") {
            await actuallyJoinCall();
          } else if (row.status === "denied" || row.status === "removed") {
            toast.error("The host did not admit you to this meeting.");
            setWaiting(false);
            await supabase.removeChannel(ch);
            navigate({ to: "/" });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting, attendeeId]);

  const actuallyJoinCall = useCallback(async () => {
    if (!meeting) return;
    try {
      const { token, isOwner: owner } = await createDailyMeetingToken({
        data: { roomName: meeting.room_name, userName: name.trim(), hostUserId: user?.id },
      });
      setIsOwner(owner);
      const co = DailyIframe.createCallObject();
      await co.join({ url: meeting.room_url, userName: name.trim(), token });
      setCallObject(co);
      setWaiting(false);
      setJoined(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to join");
      setJoining(false);
    }
  }, [meeting, name, user?.id]);

  const handleJoin = async () => {
    if (!name.trim() || !email.trim() || !meeting) return;
    setJoining(true);
    try {
      const amHost = !!user && user.id === meeting.host_id;
      const needWaiting = meeting.waiting_room_enabled && !amHost;
      const { data: att, error: attErr } = await supabase
        .from("meeting_attendees")
        .insert({
          meeting_id: meeting.id,
          full_name: name.trim(),
          email: email.trim(),
          user_id: user?.id ?? null,
          is_admin: amHost,
          status: needWaiting ? "waiting" : "admitted",
        })
        .select("id")
        .single();
      if (attErr) throw attErr;
      setAttendeeId(att.id);

      if (needWaiting) {
        setWaiting(true);
        toast.message("Waiting for the host to admit you…");
      } else {
        await actuallyJoinCall();
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to join");
      setJoining(false);
    }
  };

  const handleLeave = useCallback(async () => {
    try {
      if (callObject) {
        await callObject.leave();
        await callObject.destroy();
      }
      if (attendeeId) {
        await supabase
          .from("meeting_attendees")
          .update({ left_at: new Date().toISOString() })
          .eq("id", attendeeId);
      }
      // Fetch final attendance for summary card
      if (meeting) {
        const { data } = await supabase
          .from("meeting_attendees")
          .select("id, meeting_id, full_name, email, joined_at, left_at, status, is_admin")
          .eq("meeting_id", meeting.id);
        setSummary({ rows: (data ?? []) as AttendeeRow[] });
      }
      setJoined(false);
      setCallObject(null);
    } catch (e: unknown) {
      console.error(e);
    }
  }, [callObject, attendeeId, meeting]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <VelvetCard className="max-w-md text-center" glow="soft">
          <Logo size="md" />
          <p className="mt-4 text-foreground">{loadError}</p>
          <GoldButton className="mt-6" onClick={() => navigate({ to: "/" })}>Back home</GoldButton>
        </VelvetCard>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Logo size="md" />
      </div>
    );
  }

  if (summary) {
    return <SummaryCard meeting={meeting} rows={summary.rows} onClose={() => navigate({ to: "/" })} />;
  }

  if (waiting) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <VelvetCard className="max-w-md w-full text-center" glow="holo">
          <Logo size="md" />
          <h1 className="font-display text-2xl text-gold mt-3">Behind the curtain…</h1>
          <p className="text-sm text-muted-foreground mt-2">
            The host has been notified. We'll let you in any moment.
          </p>
          <div className="mt-6 inline-block size-3 rounded-full bg-[image:var(--gradient-gold)] animate-pulse" />
        </VelvetCard>
      </div>
    );
  }

  if (!joined || !callObject) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <VelvetCard className="max-w-md w-full" glow="strong">
          <div className="text-center mb-6">
            <Logo size="md" />
            <h1 className="font-display text-2xl text-gold mt-3">{meeting.title}</h1>
            <p className="text-sm text-muted-foreground mt-1">Enter your details to join the room.</p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Ada Lovelace" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} placeholder="ada@example.com" />
            </div>
            <GoldButton size="lg" className="w-full" onClick={handleJoin} disabled={!name.trim() || !email.trim() || joining}>
              {joining ? "Stepping on stage…" : "Step on stage"}
            </GoldButton>
          </div>
        </VelvetCard>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callObject}>
      <Room
        meeting={meeting}
        guestName={name}
        isOwner={isOwner}
        attendeeId={attendeeId!}
        onLeave={handleLeave}
      />
      {/* Renders an <audio> sink for every remote participant so audio is actually heard */}
      <DailyAudio />
    </DailyProvider>
  );
}

function formatDuration(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/* ───────────────── Room ───────────────── */

interface FloatingReaction {
  id: string;
  emoji: string;
  x: number;
}

function Room({
  meeting,
  guestName,
  isOwner,
  attendeeId,
  onLeave,
}: {
  meeting: MeetingMeta;
  guestName: string;
  isOwner: boolean;
  attendeeId: string;
  onLeave: () => void;
}) {
  const daily = useDaily();
  const participantIds = useParticipantIds();
  const localId = useLocalSessionId();
  const { isSharingScreen, startScreenShare, stopScreenShare, screens } = useScreenShare();
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [showStageB, setShowStageB] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [timers, setTimers] = useState<SpeakerTimer[]>([]);
  const [spotlightId, setSpotlightId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [annotating, setAnnotating] = useState(false);
  const [blurOn, setBlurOn] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const reactionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Live transcription (Web Speech API) — local participant only.
  const {
    supported: sttSupported,
    listening: sttListening,
    interim: sttInterim,
    lastFinal: sttLastFinal,
    error: sttError,
  } = useLiveTranscription({
    meetingId: meeting.id,
    attendeeId,
    speakerName: guestName,
    enabled: true,
  });
  const liveInterim = sttInterim || sttLastFinal;
  useEffect(() => {
    if (!sttSupported) {
      toast.message("Live captions unavailable in this browser", {
        description: "Try Chrome or Edge for live AI captions.",
      });
    }
  }, [sttSupported]);
  useEffect(() => {
    if (sttError === "not-allowed" || sttError === "service-not-allowed") {
      toast.error("Microphone blocked for captions", {
        description: "Allow mic access to enable live AI captions.",
      });
    }
  }, [sttError]);

  // Timer
  useEffect(() => {
    const i = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(i);
  }, [startTime]);

  // Chat + attendees + timers realtime
  useEffect(() => {
    (async () => {
      const [msgsRes, attRes, tmrRes] = await Promise.all([
        supabase.from("meeting_messages").select("*").eq("meeting_id", meeting.id).order("created_at", { ascending: true }).limit(200),
        supabase.from("meeting_attendees").select("id, meeting_id, full_name, email, joined_at, left_at, status, is_admin").eq("meeting_id", meeting.id),
        supabase.from("meeting_speaker_timers").select("*").eq("meeting_id", meeting.id),
      ]);
      setMessages((msgsRes.data ?? []) as ChatMessage[]);
      setAttendees((attRes.data ?? []) as AttendeeRow[]);
      setTimers((tmrRes.data ?? []) as SpeakerTimer[]);
    })();

    const ch = supabase
      .channel(`meet:${meeting.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_messages", filter: `meeting_id=eq.${meeting.id}` },
        (p) => setMessages((m) => [...m, p.new as ChatMessage]))
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_attendees", filter: `meeting_id=eq.${meeting.id}` },
        (p) => {
          setAttendees((prev) => {
            if (p.eventType === "INSERT") return [...prev, p.new as AttendeeRow];
            if (p.eventType === "UPDATE") return prev.map((r) => (r.id === (p.new as AttendeeRow).id ? (p.new as AttendeeRow) : r));
            if (p.eventType === "DELETE") return prev.filter((r) => r.id !== (p.old as AttendeeRow).id);
            return prev;
          });
          // Self was kicked
          if (p.eventType === "UPDATE" && (p.new as AttendeeRow).id === attendeeId && (p.new as AttendeeRow).status === "removed") {
            toast.error("You were removed from the meeting by the host.");
            onLeave();
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_speaker_timers", filter: `meeting_id=eq.${meeting.id}` },
        (p) => {
          setTimers((prev) => {
            if (p.eventType === "INSERT") return [...prev, p.new as SpeakerTimer];
            if (p.eventType === "DELETE") return prev.filter((t) => t.id !== (p.old as SpeakerTimer).id);
            if (p.eventType === "UPDATE") return prev.map((t) => (t.id === (p.new as SpeakerTimer).id ? (p.new as SpeakerTimer) : t));
            return prev;
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meeting.id}` },
        (p) => {
          const m = p.new as { recording_started_at: string | null; ended_at: string | null };
          setRecording(!!m.recording_started_at);
          if (m.ended_at && !isOwner) {
            toast.message("The host ended the meeting.");
            onLeave();
          }
        })
      .subscribe();

    // Broadcast channel for reactions, spotlight, screenshare requests
    const bc = supabase
      .channel(`bc:${meeting.id}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "reaction" }, ({ payload }) => {
        const r: FloatingReaction = { id: crypto.randomUUID(), emoji: payload.emoji, x: Math.random() * 80 + 10 };
        setReactions((arr) => [...arr, r]);
        setTimeout(() => setReactions((arr) => arr.filter((x) => x.id !== r.id)), 2400);
      })
      .on("broadcast", { event: "spotlight" }, ({ payload }) => setSpotlightId(payload.id || null))
      .on("broadcast", { event: "request-share" }, ({ payload }) => {
        if (payload.targetSessionId === localId) {
          toast.message("The host is asking you to share your screen.", {
            action: { label: "Share", onClick: () => startScreenShare() },
          });
        }
      })
      .subscribe();
    reactionChannelRef.current = bc;

    return () => {
      supabase.removeChannel(ch);
      supabase.removeChannel(bc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting.id]);

  useDailyEvent("error", (e) => toast.error(e?.errorMsg || "Call error"));

  const sendMessage = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await supabase.from("meeting_messages").insert({
      meeting_id: meeting.id,
      sender_name: guestName,
      body: body.slice(0, 1000),
    });
  };

  const toggleMic = () => daily?.setLocalAudio(!daily.localAudio());
  const toggleCam = () => daily?.setLocalVideo(!daily.localVideo());
  const localAudio = useAudioTrack(localId ?? "");
  const localVideo = useVideoTrack(localId ?? "");
  const micOn = !localAudio.isOff;
  const camOn = !localVideo.isOff;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Meeting link copied");
  };

  const sendReaction = (emoji: string) => {
    reactionChannelRef.current?.send({ type: "broadcast", event: "reaction", payload: { emoji } });
  };

  const raiseHand = async () => {
    const me = attendees.find((a) => a.id === attendeeId);
    const newVal = me?.hand_raised_at ? null : new Date().toISOString();
    await supabase.from("meeting_attendees").update({ hand_raised_at: newVal }).eq("id", attendeeId);
    toast.message(newVal ? "Hand raised ✋" : "Hand lowered");
  };
  const myHandRaised = !!(attendees.find((a) => a.id === attendeeId) as AttendeeRow & { hand_raised_at?: string | null })?.hand_raised_at;

  const toggleBlur = async () => {
    if (!daily) return;
    try {
      await daily.updateInputSettings({
        video: { processor: blurOn ? { type: "none" } : { type: "background-blur", config: { strength: 0.5 } } },
      });
      setBlurOn((v) => !v);
    } catch {
      toast.error("Background blur is not supported on this device.");
    }
  };

  // Recording (owner only)
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
      });
      const mr = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${meeting.title.replace(/[^a-z0-9-]+/gi, "_")}_recording.webm`;
        a.click();
        URL.revokeObjectURL(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start(1000);
      mediaRecorderRef.current = mr;
      await supabase.from("meetings").update({ recording_started_at: new Date().toISOString() }).eq("id", meeting.id);
      toast.success("Recording started — saved to your device.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Recording was not permitted.");
    }
  };
  const stopRecording = async () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    await supabase.from("meetings").update({ recording_started_at: null }).eq("id", meeting.id);
    toast.message("Recording saved.");
  };

  // End meeting for all
  const endForAll = async () => {
    if (!confirm("End the meeting for everyone?")) return;
    await supabase.from("meetings").update({ ended_at: new Date().toISOString(), status: "ended" }).eq("id", meeting.id);
    // Eject all (only works as owner)
    if (daily) {
      const updates: Record<string, { eject: true }> = {};
      for (const id of participantIds) if (id !== localId) updates[id] = { eject: true };
      try { await daily.updateParticipants(updates); } catch { /* noop */ }
    }
    // Kick off AI summary in background (host only)
    if (isOwner) {
      toast.message("Generating AI summary…", { description: "It will appear in your dashboard under Pending Review." });
      generateMeetingSummary({ data: { meetingId: meeting.id } })
        .then(() => toast.success("Summary ready for review"))
        .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Summary failed"));
    }
    onLeave();
  };

  // Speaker-timer enforcement on the targeted client
  const myAttendee = attendees.find((a) => a.id === attendeeId);
  const myTimer = useMemo(() => timers.find((t) => t.attendee_id === attendeeId), [timers, attendeeId]);
  useEffect(() => {
    if (!myTimer) return;
    const ends = new Date(myTimer.started_at).getTime() + myTimer.seconds * 1000;
    const ms = ends - Date.now();
    if (ms <= 0) {
      daily?.setLocalAudio(false);
      return;
    }
    const t = setTimeout(() => {
      daily?.setLocalAudio(false);
      toast.message("Your speaker time has ended.");
    }, ms);
    return () => clearTimeout(t);
  }, [myTimer, daily]);

  const waitingList = attendees.filter((a) => a.status === "waiting");
  const handsUp = attendees
    .filter((a) => (a as AttendeeRow & { hand_raised_at?: string | null }).hand_raised_at && a.status === "admitted")
    .sort((a, b) => new Date((a as AttendeeRow & { hand_raised_at?: string | null }).hand_raised_at!).getTime() - new Date((b as AttendeeRow & { hand_raised_at?: string | null }).hand_raised_at!).getTime());

  // Auto-spotlight any active screen share
  const screenOwnerId = screens[0]?.session_id;
  const effectiveSpotlight = screenOwnerId ?? spotlightId;

  return (
    <div className="h-screen flex flex-col bg-velvet relative overflow-hidden">
      {/* Top bar */}
      <header className="px-3 md:px-5 py-2.5 flex items-center gap-3 border-b border-[var(--border-soft)] bg-card-velvet shrink-0">
        <Logo size="sm" />
        <div className="flex-1 min-w-0 text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-rainbow font-semibold truncate">
            {meeting.title}{isOwner && " · Host"}
          </div>
          <div className="font-display text-lg md:text-xl text-gold tabular-nums pulse-gold leading-tight">
            {formatDuration(elapsed)}
          </div>
        </div>
        <GoldButton variant="ghost" size="sm" onClick={copyLink}>
          <Copy className="size-4" /> <span className="hidden md:inline">Copy link</span>
        </GoldButton>
        <ThemeToggle />
      </header>

      {/* Recording banner (slim, never pushes content off) */}
      {(recording || meeting.recording_started_at) && (
        <div className="shrink-0 bg-rose-500/20 border-b border-rose-400/40 text-rose-100 text-xs text-center py-1 backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5">
            <Circle className="size-2 fill-rose-400 text-rose-400 animate-rec-blink" />
            Recording in progress
          </span>
        </div>
      )}

      {/* Captions status banner (slim) */}
      {sttSupported && (
        <div className="shrink-0 bg-black/30 border-b border-[var(--border-soft)] text-[10px] uppercase tracking-widest text-muted-foreground text-center py-0.5 backdrop-blur-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block size-1.5 rounded-full ${sttListening ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            {sttError ? `Captions: ${sttError}` : sttListening ? "Live AI captions on" : "Captions starting…"}
          </span>
        </div>
      )}

      {/* Body — flex-1 with min-h-0 so children don't blow out the height */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        <main className="flex-1 p-2 md:p-4 overflow-hidden relative min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <ParticipantGrid
              ids={participantIds}
              attendees={attendees}
              timers={timers}
              spotlightId={effectiveSpotlight}
              isOwner={isOwner}
              meetingId={meeting.id}
              liveInterim={liveInterim}
              onSpotlight={(id) => reactionChannelRef.current?.send({ type: "broadcast", event: "spotlight", payload: { id } })}
              onMute={(sid) => daily?.updateParticipant(sid, { setAudio: false })}
              onEject={async (sid, attId) => {
                try { await daily?.updateParticipant(sid, { eject: true }); } catch { /* noop */ }
                if (attId) await supabase.from("meeting_attendees").update({ status: "removed", left_at: new Date().toISOString() }).eq("id", attId);
              }}
              onTimer={async (attId, seconds) => {
                await supabase.from("meeting_speaker_timers").delete().eq("meeting_id", meeting.id).eq("attendee_id", attId);
                await supabase.from("meeting_speaker_timers").insert({ meeting_id: meeting.id, attendee_id: attId, seconds, created_by: meeting.host_id });
                toast.success(`Timer set: ${seconds}s`);
              }}
              onRequestShare={(sid) => {
                reactionChannelRef.current?.send({ type: "broadcast", event: "request-share", payload: { targetSessionId: sid } });
                toast.message("Screen-share request sent.");
              }}
              annotating={annotating}
            />
          </div>

          {/* Floating reactions */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {reactions.map((r) => (
              <span
                key={r.id}
                className="absolute bottom-4 text-4xl animate-float-up"
                style={{ left: `${r.x}%` }}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </main>

        {showPeople && (
          <Sidebar title={`Participants (${attendees.filter((a) => a.status === "admitted").length})`} icon={<Users className="size-4" />} onClose={() => setShowPeople(false)}>
            <PeoplePanel
              attendees={attendees}
              waitingList={waitingList}
              handsUp={handsUp}
              isOwner={isOwner}
              onAdmit={async (id) => {
                await supabase.from("meeting_attendees").update({ status: "admitted" }).eq("id", id);
              }}
              onDeny={async (id) => {
                await supabase.from("meeting_attendees").update({ status: "denied" }).eq("id", id);
              }}
            />
          </Sidebar>
        )}

        {showChat && (
          <Sidebar title="Chat" icon={<MessageSquare className="size-4" />} onClose={() => setShowChat(false)}>
            <ChatPanel messages={messages} draft={draft} setDraft={setDraft} onSend={sendMessage} me={guestName} />
          </Sidebar>
        )}

        {showStageB && (
          <Sidebar title="Agenda & AI" icon={<Sparkles className="size-4" />} onClose={() => setShowStageB(false)}>
            <StageBPanel meetingId={meeting.id} attendeeId={attendeeId} guestName={guestName} isOwner={isOwner} />
          </Sidebar>
        )}
      </div>

      {/* Controls — pinned bottom, scrollable horizontally on tiny screens */}
      <footer className="shrink-0 px-2 md:px-4 py-2 flex items-center justify-center gap-2 border-t border-[var(--border-soft)] bg-card-velvet overflow-x-auto">
        <ControlButton active={micOn} offAlert onClick={toggleMic} label={micOn ? "Mute" : "Unmute"} icon={micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />} />
        <ControlButton active={camOn} offAlert onClick={toggleCam} label={camOn ? "Camera off" : "Camera on"} icon={camOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />} />
        <ControlButton
          active={isSharingScreen}
          onClick={() => (isSharingScreen ? stopScreenShare() : startScreenShare())}
          label={isSharingScreen ? "Stop sharing" : "Share screen"}
          icon={isSharingScreen ? <MonitorOff className="size-5" /> : <Monitor className="size-5" />}
        />
        {(isSharingScreen || screenOwnerId) && (
          <ControlButton active={annotating} onClick={() => setAnnotating((v) => !v)} label="Annotate" icon={<Pencil className="size-5" />} />
        )}
        <ControlButton active={blurOn} onClick={toggleBlur} label="Blur background" icon={<Wand2 className="size-5" />} />
        <ControlButton active={myHandRaised} onClick={raiseHand} label="Raise hand" icon={<Hand className={`size-5 ${myHandRaised ? "animate-hand-wave" : ""}`} />} />

        <Popover>
          <PopoverTrigger asChild>
            <button title="React" aria-label="React" className="relative inline-flex flex-col items-center justify-center size-11 md:size-12 rounded-xl border border-[var(--border-soft)] bg-[color:var(--accent)]/5 text-foreground/85 hover:text-foreground hover:bg-[color:var(--accent)]/15 transition-all shrink-0">
              <PartyPopper className="size-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2 bg-card-velvet border-gold">
            <div className="flex gap-1">
              {REACTION_EMOJIS.map((e) => (
                <button key={e} onClick={() => sendReaction(e)} className="text-2xl hover:scale-125 transition-transform p-1">{e}</button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-7 bg-border mx-1 hidden md:block" />
        <ControlButton active={showPeople} onClick={() => { setShowPeople((v) => !v); if (!showPeople) setShowChat(false); }} label="People" icon={<Users className="size-5" />} badge={waitingList.length || handsUp.length} />
        <ControlButton active={showChat} onClick={() => { setShowChat((v) => !v); if (!showChat) setShowPeople(false); }} label="Chat" icon={<MessageSquare className="size-5" />} />

        {isOwner && (
          <>
            <div className="w-px h-7 bg-border mx-1 hidden md:block" />
            <ControlButton
              active={recording}
              onClick={recording ? stopRecording : startRecording}
              label={recording ? "Stop recording" : "Record"}
              icon={recording ? <Square className="size-5 fill-rose-400 text-rose-400" /> : <Circle className="size-5" />}
            />
            <GoldButton variant="outline" size="sm" onClick={endForAll}>
              <Trash2 className="size-4" /> <span className="hidden md:inline">End for all</span>
            </GoldButton>
          </>
        )}

        <div className="w-px h-7 bg-border mx-1 hidden md:block" />
        <GoldButton variant="danger" size="sm" onClick={onLeave}>
          <LogOut className="size-4" /> Leave
        </GoldButton>
      </footer>
    </div>
  );
}

/* ───────────────── Sub-components ───────────────── */

function ControlButton({ active, onClick, label, icon, badge, offAlert }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number; offAlert?: boolean }) {
  const stateClass = active
    ? "border-[var(--border-strong)] bg-[color:var(--accent)]/15 text-foreground glow-accent-sm"
    : offAlert
      ? "border-rose-500/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
      : "border-[var(--border-soft)] bg-[color:var(--accent)]/5 text-foreground/85 hover:text-foreground hover:bg-[color:var(--accent)]/15";
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`relative inline-flex flex-col items-center justify-center size-11 md:size-12 rounded-xl border transition-all shrink-0 ${stateClass}`}
    >
      {icon}
      {badge ? (
        <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[image:var(--gradient-gold)] text-[10px] font-bold text-[#0a1a3a] flex items-center justify-center">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ParticipantGrid({
  ids,
  attendees,
  timers,
  spotlightId,
  isOwner,
  meetingId,
  liveInterim,
  onSpotlight,
  onMute,
  onEject,
  onTimer,
  onRequestShare,
  annotating,
}: {
  ids: string[];
  attendees: AttendeeRow[];
  timers: SpeakerTimer[];
  spotlightId: string | null;
  isOwner: boolean;
  meetingId: string;
  liveInterim: string;
  onSpotlight: (id: string | null) => void;
  onMute: (sessionId: string) => void;
  onEject: (sessionId: string, attendeeId?: string) => void;
  onTimer: (attendeeId: string, seconds: number) => void;
  onRequestShare: (sessionId: string) => void;
  annotating: boolean;
}) {
  const common = { attendees, timers, isOwner, meetingId, liveInterim, onSpotlight, onMute, onEject, onTimer, onRequestShare };
  // Spotlight layout: hero + thumbnails strip
  if (spotlightId && ids.includes(spotlightId)) {
    const others = ids.filter((id) => id !== spotlightId);
    return (
      <div className="flex flex-col h-full gap-3">
        <div className="flex-1 min-h-0 relative">
          <ParticipantTile id={spotlightId} isSpotlight {...common} />
          {annotating && <AnnotationOverlay />}
        </div>
        {others.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {others.map((id) => (
              <div key={id} className="w-44 h-32 shrink-0">
                <ParticipantTile id={id} {...common} />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const cols = ids.length <= 1 ? "grid-cols-1" : ids.length <= 4 ? "grid-cols-1 md:grid-cols-2" : ids.length <= 9 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-4";
  return (
    <div className={`grid ${cols} gap-2 md:gap-3 auto-rows-fr h-full`}>
      {ids.map((id) => (
        <ParticipantTile key={id} id={id} {...common} />
      ))}
    </div>
  );
}

function ParticipantTile({
  id,
  attendees,
  timers,
  isOwner,
  isSpotlight,
  meetingId,
  liveInterim,
  onSpotlight,
  onMute,
  onEject,
  onTimer,
  onRequestShare,
}: {
  id: string;
  attendees: AttendeeRow[];
  timers: SpeakerTimer[];
  isOwner: boolean;
  isSpotlight?: boolean;
  meetingId: string;
  liveInterim: string;
  onSpotlight: (id: string | null) => void;
  onMute: (sessionId: string) => void;
  onEject: (sessionId: string, attendeeId?: string) => void;
  onTimer: (attendeeId: string, seconds: number) => void;
  onRequestShare: (sessionId: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const video = useVideoTrack(id);
  const audio = useAudioTrack(id);
  const userName = useParticipantProperty(id, "user_name") as string | undefined;
  const isLocal = useParticipantProperty(id, "local") as boolean | undefined;
  const isOwnerTile = useParticipantProperty(id, "owner") as boolean | undefined;

  // Try to associate this Daily participant with a Supabase attendee by name
  const attendee = useMemo(() => {
    if (!userName) return undefined;
    return attendees.find((a) => a.full_name === userName && a.status === "admitted");
  }, [userName, attendees]);
  const handRaised = !!(attendee as (AttendeeRow & { hand_raised_at?: string | null }) | undefined)?.hand_raised_at;
  const timer = attendee ? timers.find((t) => t.attendee_id === attendee.id) : undefined;
  const [tRemaining, setTRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!timer) { setTRemaining(null); return; }
    const ends = new Date(timer.started_at).getTime() + timer.seconds * 1000;
    const tick = () => setTRemaining(Math.max(0, Math.ceil((ends - Date.now()) / 1000)));
    tick();
    const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [timer]);

  useEffect(() => {
    if (!ref.current) return;
    if (video.persistentTrack) {
      ref.current.srcObject = new MediaStream([video.persistentTrack]);
    } else {
      ref.current.srcObject = null;
    }
  }, [video.persistentTrack]);

  const initials = useMemo(() => {
    const n = (userName ?? "Guest").trim();
    return n.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "G";
  }, [userName]);

  return (
    <div className={`relative rounded-2xl overflow-hidden ${isSpotlight ? "border-gold-strong h-full" : "border-gold"} bg-[oklch(0.10_0.05_270)] animate-fade-up group`}>
      {video.persistentTrack ? (
        <video ref={ref} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,oklch(0.22_0.10_290/0.7),oklch(0.10_0.05_270/0.95))]">
          <div className={`${isSpotlight ? "size-32 text-5xl" : "size-20 text-3xl"} rounded-full bg-[image:var(--gradient-gold)] flex items-center justify-center font-display font-bold text-[#0a0a2e] glow-gold-sm`}>
            {initials}
          </div>
        </div>
      )}

      {/* Top badges */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-1.5">
        {isOwnerTile && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[image:var(--gradient-gold)] text-[#0a0a2e] font-bold inline-flex items-center gap-1">
            <Crown className="size-3" /> Host
          </span>
        )}
        {handRaised && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded-full bg-[oklch(0.82_0.16_88/0.85)] text-[#0a0a2e] font-bold inline-flex items-center gap-1">
            <Hand className="size-3 animate-hand-wave" /> Raised
          </span>
        )}
        {tRemaining !== null && (
          <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${tRemaining > 5 ? "bg-[oklch(0.82_0.16_88/0.85)] text-[#0a0a2e]" : "bg-rose-500 text-white animate-pulse"} font-bold inline-flex items-center gap-1`}>
            <Timer className="size-3" /> {tRemaining}s
          </span>
        )}
      </div>

      {/* Admin menu */}
      {isOwner && !isLocal && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <AdminMenu
            sessionId={id}
            attendeeId={attendee?.id}
            isSpotlight={!!isSpotlight}
            onSpotlight={onSpotlight}
            onMute={onMute}
            onEject={onEject}
            onTimer={onTimer}
            onRequestShare={onRequestShare}
          />
        </div>
      )}

      {/* Bottom name */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-xs px-2.5 py-1 rounded-full bg-[oklch(0.10_0.05_270/0.85)] border border-[oklch(0.82_0.16_88/0.5)] text-[oklch(0.92_0.10_88)] glow-gold-sm backdrop-blur-sm">
          {userName ?? "Guest"} {isLocal && "· you"}
        </span>
        {audio.isOff && (
          <span className="text-xs p-1.5 rounded-full bg-rose-500/80 text-white">
            <MicOff className="size-3" />
          </span>
        )}
      </div>

      {/* Live caption strip */}
      {userName && (
        <CaptionStrip
          meetingId={meetingId}
          speakerName={userName}
          liveInterim={isLocal ? liveInterim : undefined}
        />
      )}
    </div>
  );
}

function AdminMenu({
  sessionId,
  attendeeId,
  isSpotlight,
  onSpotlight,
  onMute,
  onEject,
  onTimer,
  onRequestShare,
}: {
  sessionId: string;
  attendeeId?: string;
  isSpotlight: boolean;
  onSpotlight: (id: string | null) => void;
  onMute: (sessionId: string) => void;
  onEject: (sessionId: string, attendeeId?: string) => void;
  onTimer: (attendeeId: string, seconds: number) => void;
  onRequestShare: (sessionId: string) => void;
}) {
  const [timerInput, setTimerInput] = useState("60");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="size-8 rounded-full bg-[oklch(0.10_0.05_270/0.85)] border border-[oklch(0.82_0.16_88/0.6)] flex items-center justify-center text-[oklch(0.92_0.10_88)] hover:bg-[oklch(0.82_0.16_88/0.2)]">
          <MoreVertical className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2 bg-card-velvet border-gold space-y-1">
        <p className="text-xs uppercase tracking-wider text-rainbow font-semibold px-2 py-1">Admin actions</p>
        <button onClick={() => onMute(sessionId)} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-white/5 flex items-center gap-2"><MicOff className="size-4" /> Mute participant</button>
        <button onClick={() => onSpotlight(isSpotlight ? null : sessionId)} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-white/5 flex items-center gap-2">
          {isSpotlight ? <><PinOff className="size-4" /> Remove spotlight</> : <><Pin className="size-4" /> Spotlight</>}
        </button>
        <button onClick={() => onRequestShare(sessionId)} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-white/5 flex items-center gap-2"><Monitor className="size-4" /> Request screen share</button>
        {attendeeId && (
          <div className="px-2 py-2 border-t border-border mt-1">
            <Label className="text-[10px] uppercase tracking-wider">Speaker timer (sec)</Label>
            <div className="flex gap-1 mt-1">
              <Input value={timerInput} onChange={(e) => setTimerInput(e.target.value)} type="number" min={5} max={3600} className="h-8" />
              <GoldButton size="sm" onClick={() => onTimer(attendeeId, Math.max(5, Math.min(3600, parseInt(timerInput, 10) || 60)))}>
                <Timer className="size-3.5" />
              </GoldButton>
            </div>
          </div>
        )}
        <button onClick={() => onEject(sessionId, attendeeId)} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-rose-500/20 text-rose-300 flex items-center gap-2"><Trash2 className="size-4" /> Remove from meeting</button>
      </PopoverContent>
    </Popover>
  );
}

function AnnotationOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [color, setColor] = useState("#ffd93d");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const r = c.parentElement!.getBoundingClientRect();
      c.width = r.width;
      c.height = r.height;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const up = () => { drawingRef.current = false; };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); };

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
        className="absolute inset-0 cursor-crosshair"
      />
      <div className="absolute top-2 right-2 flex items-center gap-1 bg-[oklch(0.10_0.05_270/0.9)] border border-[oklch(0.82_0.16_88/0.5)] rounded-full px-2 py-1.5 backdrop-blur-sm">
        {["#ffd93d", "#ff6b9d", "#4d96ff", "#6bcb77"].map((c) => (
          <button key={c} onClick={() => setColor(c)} className={`size-5 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
        ))}
        <button onClick={clear} className="text-xs px-2 py-0.5 text-foreground/80 hover:text-foreground">Clear</button>
      </div>
    </>
  );
}

function Sidebar({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="w-full md:w-96 border-l border-[oklch(0.82_0.16_88/0.2)] bg-[oklch(0.12_0.06_275/0.85)] backdrop-blur-md flex flex-col animate-fade-up">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[oklch(0.82_0.16_88/0.2)]">
        <div className="flex items-center gap-2 text-gold font-display text-lg">{icon}{title}</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
    </aside>
  );
}

function PeoplePanel({
  attendees,
  waitingList,
  handsUp,
  isOwner,
  onAdmit,
  onDeny,
}: {
  attendees: AttendeeRow[];
  waitingList: AttendeeRow[];
  handsUp: AttendeeRow[];
  isOwner: boolean;
  onAdmit: (id: string) => void;
  onDeny: (id: string) => void;
}) {
  const admitted = attendees.filter((a) => a.status === "admitted");
  return (
    <div className="overflow-auto p-3 space-y-4">
      {isOwner && waitingList.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-rainbow font-semibold mb-1.5">Waiting room ({waitingList.length})</p>
          <ul className="space-y-1">
            {waitingList.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[oklch(0.82_0.16_88/0.3)] bg-[oklch(0.82_0.16_88/0.05)]">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{a.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                </div>
                <div className="flex gap-1.5">
                  <GoldButton size="sm" onClick={() => onAdmit(a.id)}>Admit</GoldButton>
                  <GoldButton size="sm" variant="ghost" onClick={() => onDeny(a.id)}>Deny</GoldButton>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {handsUp.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gold font-semibold mb-1.5">Raised hands ({handsUp.length})</p>
          <ol className="space-y-1 text-sm">
            {handsUp.map((a, i) => (
              <li key={a.id} className="px-3 py-1.5 rounded-lg bg-[oklch(0.82_0.16_88/0.1)] flex items-center gap-2">
                <span className="text-xs font-bold text-gold">{i + 1}.</span>
                <Hand className="size-3.5 text-[oklch(0.82_0.16_88)]" /> {a.full_name}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">In meeting ({admitted.length})</p>
        <ul className="space-y-1">
          {admitted.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5">
              <div className="min-w-0">
                <p className="text-sm text-foreground truncate flex items-center gap-1.5">
                  {a.is_admin && <Crown className="size-3 text-[oklch(0.82_0.16_88)]" />} {a.full_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">{a.email}</p>
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{durationLabel(a.joined_at, a.left_at)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ChatPanel({ messages, draft, setDraft, onSend, me }: { messages: ChatMessage[]; draft: string; setDraft: (v: string) => void; onSend: () => void; me: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  return (
    <>
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {messages.length === 0 && <p className="text-sm text-muted-foreground text-center mt-6">No messages yet. Be the first to speak.</p>}
        {messages.map((m) => {
          const mine = m.sender_name === me;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{m.sender_name}</span>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${mine ? "bg-[image:var(--gradient-gold)] text-[#0a0a2e] rounded-br-sm" : "bg-white/5 border border-border text-foreground rounded-bl-sm"}`}>
                {m.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); onSend(); }}
        className="p-3 border-t border-[oklch(0.82_0.16_88/0.2)] flex items-center gap-2"
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say something elegant…" maxLength={1000} />
        <GoldButton type="submit" size="sm" disabled={!draft.trim()}><Send className="size-4" /></GoldButton>
      </form>
    </>
  );
}

/* ───────────────── Summary Card ───────────────── */

function SummaryCard({ meeting, rows, onClose }: { meeting: MeetingMeta; rows: AttendeeRow[]; onClose: () => void }) {
  const { unique, peak, totalDurationSec } = useMemo(() => computeSummary(rows), [rows]);
  const totalH = Math.floor(totalDurationSec / 3600);
  const totalM = Math.floor((totalDurationSec % 3600) / 60);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-velvet">
      <VelvetCard className="max-w-2xl w-full" glow="holo">
        <div className="text-center">
          <Logo size="md" />
          <p className="text-xs uppercase tracking-[0.3em] text-rainbow font-semibold mt-4">Curtain call</p>
          <h1 className="font-display text-3xl text-gold mt-1">{meeting.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Here's how the session played out.</p>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-6">
          <Stat label="Unique attendees" value={String(unique)} />
          <Stat label="Peak concurrent" value={String(peak)} />
          <Stat label="Total attendance" value={`${totalH > 0 ? `${totalH}h ` : ""}${totalM}m`} />
        </div>

        <div className="mt-6 max-h-72 overflow-auto border border-border rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">Email</th>
                <th className="text-left px-3 py-2">Joined</th>
                <th className="text-left px-3 py-2">Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 flex items-center gap-1.5">{r.is_admin && <Crown className="size-3 text-[oklch(0.82_0.16_88)]" />} {r.full_name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.email}</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(r.joined_at).toLocaleTimeString()}</td>
                  <td className="px-3 py-2 tabular-nums">{durationLabel(r.joined_at, r.left_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <GoldButton onClick={() => downloadAttendanceCSV(meeting.title, rows)}>
            <Download className="size-4" /> Download attendance CSV
          </GoldButton>
          <GoldButton variant="outline" onClick={onClose}>
            <Sparkles className="size-4" /> Back to dashboard
          </GoldButton>
        </div>
      </VelvetCard>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border-gold p-4 text-center bg-[oklch(0.10_0.05_270/0.4)]">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-display text-3xl text-gold mt-1">{value}</p>
    </div>
  );
}
