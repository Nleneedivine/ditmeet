import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  FileText,
  Files,
  Presentation,
  PenTool,
  Link2,
  BarChart3,
  Handshake,
  Sparkles,
  Gavel,
  Plus,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { NotesEditor, type NoteAttendee } from "./NotesEditor";
import { GoldButton } from "@/components/brand/GoldButton";

type TabKey =
  | "notes"
  | "files"
  | "presentation"
  | "whiteboard"
  | "links"
  | "polls"
  | "commitments"
  | "summary"
  | "decisions";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "notes", label: "Notes", icon: <FileText className="size-3.5" /> },
  { key: "files", label: "Files", icon: <Files className="size-3.5" /> },
  { key: "presentation", label: "Presentation", icon: <Presentation className="size-3.5" /> },
  { key: "whiteboard", label: "Whiteboard", icon: <PenTool className="size-3.5" /> },
  { key: "links", label: "Links", icon: <Link2 className="size-3.5" /> },
  { key: "polls", label: "Polls", icon: <BarChart3 className="size-3.5" /> },
  { key: "commitments", label: "Commitments", icon: <Handshake className="size-3.5" /> },
  { key: "summary", label: "AI Summary", icon: <Sparkles className="size-3.5" /> },
  { key: "decisions", label: "Decisions", icon: <Gavel className="size-3.5" /> },
];

interface LinkRow {
  id: string;
  title: string;
  url: string;
  added_by_name: string;
  created_at: string;
}

export function ResourcesPanel({
  meetingId,
  guestName,
  isOwner,
  attendees,
  onOpenAgendaPanel,
  onMention,
}: {
  meetingId: string;
  guestName: string;
  isOwner: boolean;
  attendees: NoteAttendee[];
  onOpenAgendaPanel?: () => void;
  onMention?: (attendeeId: string | null, name: string) => void;
}) {
  const [tab, setTab] = useState<TabKey>("notes");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 flex gap-1 overflow-x-auto px-2 py-2 border-b border-[var(--border-soft)]">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs transition-colors border ${
              tab === t.key
                ? "bg-[image:var(--gradient-gold)] text-[#0a1a3a] font-semibold border-transparent"
                : "border-[var(--border-soft)] text-foreground/75 hover:text-foreground hover:bg-[color:var(--accent)]/10"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "notes" && (
        <NotesEditor
          meetingId={meetingId}
          guestName={guestName}
          isOwner={isOwner}
          attendees={attendees}
          onMention={onMention}
        />
      )}

      {tab === "links" && <LinksTab meetingId={meetingId} guestName={guestName} isOwner={isOwner} />}

      {tab === "files" && (
        <Placeholder
          icon={<Files className="size-6" />}
          title="Shared files"
          body="Drag-and-drop document sharing for this meeting lands here. Attachments will be stored securely and listed with uploader and timestamp."
        />
      )}
      {tab === "presentation" && (
        <Placeholder
          icon={<Presentation className="size-6" />}
          title="Presentation mode"
          body="Upload a deck and drive slides for everyone in the room, synced to the spotlight tile."
        />
      )}
      {tab === "whiteboard" && (
        <Placeholder
          icon={<PenTool className="size-6" />}
          title="Collaborative whiteboard"
          body="An infinite shared canvas with sticky notes, shapes and freehand ink is coming to this tab."
        />
      )}
      {tab === "polls" && (
        <Placeholder
          icon={<BarChart3 className="size-6" />}
          title="Live polls"
          body="Polls currently run from the Agenda & AI panel."
          action={onOpenAgendaPanel ? { label: "Open polls", onClick: onOpenAgendaPanel } : undefined}
        />
      )}
      {tab === "commitments" && (
        <Placeholder
          icon={<Handshake className="size-6" />}
          title="Commitments"
          body="AI-detected promises live in the Agenda & AI panel today, and will be mirrored here."
          action={onOpenAgendaPanel ? { label: "Open commitments", onClick: onOpenAgendaPanel } : undefined}
        />
      )}
      {tab === "summary" && (
        <Placeholder
          icon={<Sparkles className="size-6" />}
          title="AI summary"
          body="After the host ends the meeting, the AI summary is generated and — once approved — appended to these notes."
          action={
            isOwner
              ? {
                  label: "Open summary review",
                  onClick: () => window.open(`/summary/${meetingId}`, "_blank"),
                }
              : undefined
          }
        />
      )}
      {tab === "decisions" && (
        <Placeholder
          icon={<Gavel className="size-6" />}
          title="Decisions log"
          body="Formally recorded decisions with owners and timestamps will be collected here."
        />
      )}
    </div>
  );
}

function LinksTab({
  meetingId,
  guestName,
  isOwner,
}: {
  meetingId: string;
  guestName: string;
  isOwner: boolean;
}) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("meeting_links")
      .select("id, title, url, added_by_name, created_at")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false });
    setLinks((data ?? []) as LinkRow[]);
  }, [meetingId]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`links:${meetingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_links", filter: `meeting_id=eq.${meetingId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meetingId, load]);

  const add = async () => {
    if (!url.trim()) return;
    const { error } = await supabase.from("meeting_links").insert({
      meeting_id: meetingId,
      title: title.trim() || url.trim(),
      url: url.trim(),
      added_by_name: guestName,
    });
    if (error) {
      toast.error("Could not add link");
      return;
    }
    setTitle("");
    setUrl("");
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="p-3 space-y-2 border-b border-[var(--border-soft)]">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Label (optional)"
          className="w-full rounded-lg bg-black/25 border border-[var(--border-soft)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
        />
        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="flex-1 rounded-lg bg-black/25 border border-[var(--border-soft)] px-3 py-2 text-sm outline-none focus:border-[var(--border-strong)]"
          />
          <GoldButton size="sm" onClick={() => void add()}>
            <Plus className="size-4" /> Add
          </GoldButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {links.length === 0 && (
          <div className="text-xs text-muted-foreground">No links shared yet.</div>
        )}
        {links.map((l) => (
          <div
            key={l.id}
            className="flex items-center gap-2 rounded-xl border border-[var(--border-soft)] bg-black/20 px-3 py-2"
          >
            <a
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 text-sm text-gold hover:underline truncate inline-flex items-center gap-1.5"
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {l.title}
            </a>
            <span className="text-[10px] text-muted-foreground shrink-0">{l.added_by_name}</span>
            {isOwner && (
              <button
                onClick={() => void supabase.from("meeting_links").delete().eq("id", l.id)}
                className="text-muted-foreground hover:text-rose-400"
                aria-label="Delete link"
              >
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Placeholder({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 p-8">
      <div className="size-14 rounded-2xl grid place-items-center bg-[image:var(--gradient-gold)] text-[#0a1a3a] shadow-[0_0_30px_-8px_var(--accent-glow)]">
        {icon}
      </div>
      <div className="font-display text-lg text-gold">{title}</div>
      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{body}</p>
      {action && (
        <GoldButton size="sm" variant="outline" onClick={action.onClick}>
          {action.label}
        </GoldButton>
      )}
    </div>
  );
}
