import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import DailyIframe, { type DailyCall } from "@daily-co/daily-js";
import {
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
  Copy,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Send,
  Users,
  Video as VideoIcon,
  VideoOff,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/brand/Logo";
import { GoldButton } from "@/components/brand/GoldButton";
import { VelvetCard } from "@/components/brand/VelvetCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/m/$roomName")({ component: MeetingPage });

interface MeetingMeta {
  id: string;
  title: string;
  room_url: string;
}

interface ChatMessage {
  id: string;
  sender_name: string;
  body: string;
  created_at: string;
}

function MeetingPage() {
  const { roomName } = Route.useParams();
  const navigate = useNavigate();
  const [meeting, setMeeting] = useState<MeetingMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);
  const [attendeeId, setAttendeeId] = useState<string | null>(null);
  const [callObject, setCallObject] = useState<DailyCall | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("id, title, room_url")
        .eq("room_name", roomName)
        .maybeSingle();
      if (error || !data) {
        setLoadError("This meeting link is invalid or has expired.");
        return;
      }
      setMeeting(data);
    })();
  }, [roomName]);

  const handleJoin = async () => {
    if (!name.trim() || !email.trim() || !meeting) return;
    try {
      const { data: att } = await supabase
        .from("meeting_attendees")
        .insert({ meeting_id: meeting.id, full_name: name.trim(), email: email.trim() })
        .select("id")
        .single();
      setAttendeeId(att?.id ?? null);

      const co = DailyIframe.createCallObject();
      await co.join({ url: meeting.room_url, userName: name.trim() });
      setCallObject(co);
      setJoined(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to join");
    }
  };

  const handleLeave = async () => {
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
    } finally {
      navigate({ to: "/" });
    }
  };

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
            <GoldButton size="lg" className="w-full" onClick={handleJoin} disabled={!name.trim() || !email.trim()}>
              Step on stage
            </GoldButton>
          </div>
        </VelvetCard>
      </div>
    );
  }

  return (
    <DailyProvider callObject={callObject}>
      <Room meeting={meeting} guestName={name} onLeave={handleLeave} />
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

function Room({
  meeting,
  guestName,
  onLeave,
}: { meeting: MeetingMeta; guestName: string; onLeave: () => void }) {
  const daily = useDaily();
  const participantIds = useParticipantIds();
  const localId = useLocalSessionId();
  const { isSharingScreen, startScreenShare, stopScreenShare } = useScreenShare();
  const [startTime] = useState(() => Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  // Timer
  useEffect(() => {
    const i = setInterval(() => setElapsed(Date.now() - startTime), 1000);
    return () => clearInterval(i);
  }, [startTime]);

  // Chat: load + realtime
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meeting_messages")
        .select("*")
        .eq("meeting_id", meeting.id)
        .order("created_at", { ascending: true })
        .limit(200);
      setMessages((data ?? []) as ChatMessage[]);
    })();
    const ch = supabase
      .channel(`msgs:${meeting.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_messages", filter: `meeting_id=eq.${meeting.id}` },
        (payload) => setMessages((m) => [...m, payload.new as ChatMessage]),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  return (
    <div className="min-h-screen flex flex-col bg-velvet">
      {/* Top bar with timer */}
      <header className="px-4 md:px-6 py-3 flex items-center gap-4 border-b border-[oklch(0.82_0.16_88/0.2)]">
        <Logo size="sm" />
        <div className="flex-1 text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-rainbow font-semibold">{meeting.title}</div>
          <div className="font-display text-2xl md:text-3xl text-gold tabular-nums pulse-gold">
            {formatDuration(elapsed)}
          </div>
        </div>
        <GoldButton variant="ghost" size="sm" onClick={copyLink}>
          <Copy className="size-4" /> <span className="hidden md:inline">Copy link</span>
        </GoldButton>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <main className="flex-1 p-3 md:p-6 overflow-auto">
          <ParticipantGrid ids={participantIds} />
        </main>

        {showPeople && (
          <Sidebar title={`Participants (${participantIds.length})`} icon={<Users className="size-4" />} onClose={() => setShowPeople(false)}>
            <ParticipantList ids={participantIds} localId={localId} />
          </Sidebar>
        )}

        {showChat && (
          <Sidebar title="Chat" icon={<MessageSquare className="size-4" />} onClose={() => setShowChat(false)}>
            <ChatPanel messages={messages} draft={draft} setDraft={setDraft} onSend={sendMessage} me={guestName} />
          </Sidebar>
        )}
      </div>

      {/* Controls */}
      <footer className="px-4 py-4 flex items-center justify-center gap-2 md:gap-3 border-t border-[oklch(0.82_0.16_88/0.2)] bg-[oklch(0.10_0.05_270/0.6)] backdrop-blur-sm">
        <ControlButton active={micOn} onClick={toggleMic} label={micOn ? "Mute" : "Unmute"} icon={micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />} />
        <ControlButton active={camOn} onClick={toggleCam} label={camOn ? "Camera off" : "Camera on"} icon={camOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />} />
        <ControlButton
          active={isSharingScreen}
          onClick={() => (isSharingScreen ? stopScreenShare() : startScreenShare())}
          label={isSharingScreen ? "Stop sharing" : "Share screen"}
          icon={isSharingScreen ? <MonitorOff className="size-5" /> : <Monitor className="size-5" />}
        />
        <div className="w-px h-8 bg-border mx-1" />
        <ControlButton active={showPeople} onClick={() => { setShowPeople((v) => !v); if (!showPeople) setShowChat(false); }} label="People" icon={<Users className="size-5" />} />
        <ControlButton active={showChat} onClick={() => { setShowChat((v) => !v); if (!showChat) setShowPeople(false); }} label="Chat" icon={<MessageSquare className="size-5" />} />
        <div className="w-px h-8 bg-border mx-1" />
        <GoldButton variant="danger" onClick={onLeave}>
          <LogOut className="size-4" /> Leave
        </GoldButton>
      </footer>
    </div>
  );
}

function ControlButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`relative inline-flex flex-col items-center justify-center size-12 md:size-14 rounded-xl border transition-all ${
        active
          ? "border-[oklch(0.82_0.16_88/0.6)] bg-[oklch(0.82_0.16_88/0.12)] text-[oklch(0.92_0.10_88)] glow-gold-sm"
          : "border-border bg-white/5 text-foreground/80 hover:text-foreground hover:bg-white/10"
      }`}
    >
      {icon}
    </button>
  );
}

function ParticipantGrid({ ids }: { ids: string[] }) {
  const cols = ids.length <= 1 ? "grid-cols-1" : ids.length <= 4 ? "grid-cols-1 md:grid-cols-2" : ids.length <= 9 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-3 md:grid-cols-4";
  return (
    <div className={`grid ${cols} gap-3 md:gap-4 auto-rows-fr h-full min-h-[60vh]`}>
      {ids.map((id) => <ParticipantTile key={id} id={id} />)}
    </div>
  );
}

function ParticipantTile({ id }: { id: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const video = useVideoTrack(id);
  const audio = useAudioTrack(id);
  const userName = useParticipantProperty(id, "user_name") as string | undefined;
  const isLocal = useParticipantProperty(id, "local") as boolean | undefined;

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
    <div className="relative rounded-2xl overflow-hidden border-gold bg-[oklch(0.10_0.05_270)] animate-fade-up">
      {video.persistentTrack ? (
        <video ref={ref} autoPlay playsInline muted={isLocal} className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-[radial-gradient(ellipse_at_center,oklch(0.22_0.10_290/0.7),oklch(0.10_0.05_270/0.95))]">
          <div className="size-20 rounded-full bg-[var(--gradient-gold)] flex items-center justify-center text-3xl font-display font-bold text-[#0a0a2e] glow-gold-sm">
            {initials}
          </div>
        </div>
      )}
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
    </div>
  );
}

function Sidebar({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="w-full md:w-80 border-l border-[oklch(0.82_0.16_88/0.2)] bg-[oklch(0.12_0.06_275/0.85)] backdrop-blur-md flex flex-col animate-fade-up">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[oklch(0.82_0.16_88/0.2)]">
        <div className="flex items-center gap-2 text-gold font-display text-lg">{icon}{title}</div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
    </aside>
  );
}

function ParticipantList({ ids, localId }: { ids: string[]; localId: string | undefined }) {
  return (
    <ul className="overflow-auto p-2 space-y-1">
      {ids.map((id) => <ParticipantListItem key={id} id={id} isLocal={id === localId} />)}
    </ul>
  );
}

function ParticipantListItem({ id, isLocal }: { id: string; isLocal: boolean }) {
  const name = useParticipantProperty(id, "user_name") as string | undefined;
  const audio = useAudioTrack(id);
  const video = useVideoTrack(id);
  return (
    <li className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5">
      <span className="text-sm text-foreground">{name ?? "Guest"} {isLocal && <span className="text-xs text-muted-foreground">· you</span>}</span>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {audio.isOff ? <MicOff className="size-3.5 text-rose-400" /> : <Mic className="size-3.5 text-[oklch(0.82_0.16_88)]" />}
        {video.isOff ? <VideoOff className="size-3.5 text-rose-400" /> : <VideoIcon className="size-3.5 text-[oklch(0.82_0.16_88)]" />}
      </span>
    </li>
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
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${mine ? "bg-[var(--gradient-gold)] text-[#0a0a2e] rounded-br-sm" : "bg-white/5 border border-border text-foreground rounded-bl-sm"}`}>
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
