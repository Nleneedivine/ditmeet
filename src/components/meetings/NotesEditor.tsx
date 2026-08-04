import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  ListChecks,
  Code2,
  Table as TableIcon,
  Link2,
  History,
  Save,
  RotateCcw,
  Lock,
  Users,
  Cloud,
  CloudOff,
  AtSign,
} from "lucide-react";
import { GoldButton } from "@/components/brand/GoldButton";
import { Badge } from "@/components/ui/badge";

export interface NoteAttendee {
  id: string;
  full_name: string;
}

interface Props {
  meetingId: string;
  guestName: string;
  isOwner: boolean;
  attendees: NoteAttendee[];
  onMention?: (attendeeId: string | null, name: string) => void;
}

interface NoteRow {
  id: string;
  meeting_id: string;
  content_html: string;
  edit_mode: string;
  allowed_editors: unknown;
  updated_by_name: string | null;
  updated_at: string;
}

interface VersionRow {
  id: string;
  content_html: string;
  label: string | null;
  author_name: string | null;
  created_at: string;
}

interface RemoteCursor {
  id: string;
  name: string;
  color: string;
  offset: number;
  at: number;
}

const CURSOR_COLORS = ["#7cc3f0", "#e6c15a", "#8be9c0", "#f28fb2", "#b39ddb", "#f4a15d"];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return CURSOR_COLORS[h % CURSOR_COLORS.length];
}

/** absolute character offset of the caret inside a root element */
function caretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer)) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

/** locate a DOM position for an absolute character offset */
function positionForOffset(root: HTMLElement, offset: number): { node: Node; off: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let last: Text | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) return { node, off: remaining };
    remaining -= len;
    last = node;
  }
  if (last) return { node: last, off: last.textContent?.length ?? 0 };
  return null;
}

export function NotesEditor({ meetingId, guestName, isOwner, attendees, onMention }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const clientId = useMemo(() => Math.random().toString(36).slice(2), []);
  const myColor = useMemo(() => colorFor(clientId), [clientId]);

  const [note, setNote] = useState<NoteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved" | "offline">("idle");
  const [showHistory, setShowHistory] = useState(false);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);
  const [cursorPoints, setCursorPoints] = useState<
    { id: string; name: string; color: string; top: number; left: number }[]
  >([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const pendingHtmlRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<string>("");
  const dirtyRef = useRef(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const noteIdRef = useRef<string | null>(null);

  const canEdit = !!note && (isOwner || note.edit_mode === "everyone");

  /* ---------------- load / create the note document ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("meeting_notes")
        .select("*")
        .eq("meeting_id", meetingId)
        .maybeSingle();
      let row = data as NoteRow | null;
      if (!row) {
        const { data: created, error } = await supabase
          .from("meeting_notes")
          .insert({ meeting_id: meetingId, content_html: "", content_text: "" })
          .select("*")
          .maybeSingle();
        if (error) {
          // Another client may have created it concurrently.
          const { data: again } = await supabase
            .from("meeting_notes")
            .select("*")
            .eq("meeting_id", meetingId)
            .maybeSingle();
          row = again as NoteRow | null;
        } else {
          row = created as NoteRow | null;
        }
      }
      if (cancelled || !row) return;
      noteIdRef.current = row.id;
      setNote(row);
      lastSyncedRef.current = row.content_html ?? "";
      if (editorRef.current) editorRef.current.innerHTML = row.content_html || "";
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  /* ---------------- realtime: document + cursors ---------------- */
  useEffect(() => {
    const channel = supabase
      .channel(`notes:${meetingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "meeting_notes", filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          const row = payload.new as NoteRow;
          if (!row) return;
          setNote((prev) => ({ ...(prev ?? row), ...row }));
          const html = row.content_html ?? "";
          if (html === lastSyncedRef.current) return;
          lastSyncedRef.current = html;
          // Never clobber unsaved local edits.
          if (dirtyRef.current) return;
          if (editorRef.current && editorRef.current.innerHTML !== html) {
            editorRef.current.innerHTML = html;
          }
        },
      )
      .on("broadcast", { event: "cursor" }, ({ payload }) => {
        const p = payload as RemoteCursor;
        if (!p || p.id === clientId) return;
        setCursors((prev) => {
          const rest = prev.filter((c) => c.id !== p.id);
          return [...rest, { ...p, at: Date.now() }];
        });
      })
      .subscribe();
    channelRef.current = channel;
    const prune = window.setInterval(
      () => setCursors((prev) => prev.filter((c) => Date.now() - c.at < 8000)),
      3000,
    );
    return () => {
      window.clearInterval(prune);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [meetingId, clientId]);

  /* ---------------- project remote cursors to screen ---------------- */
  useEffect(() => {
    const root = editorRef.current;
    const wrap = wrapRef.current;
    if (!root || !wrap) return;
    const wrapBox = wrap.getBoundingClientRect();
    const pts = cursors
      .map((c) => {
        const pos = positionForOffset(root, c.offset);
        if (!pos) return null;
        const range = document.createRange();
        try {
          range.setStart(pos.node, Math.min(pos.off, pos.node.textContent?.length ?? 0));
          range.collapse(true);
        } catch {
          return null;
        }
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.top === 0 && rect.left === 0)) return null;
        return {
          id: c.id,
          name: c.name,
          color: c.color,
          top: rect.top - wrapBox.top + wrap.scrollTop,
          left: rect.left - wrapBox.left,
        };
      })
      .filter(Boolean) as { id: string; name: string; color: string; top: number; left: number }[];
    setCursorPoints(pts);
  }, [cursors]);

  const broadcastCursor = useCallback(() => {
    const root = editorRef.current;
    if (!root) return;
    const off = caretOffset(root);
    if (off == null) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "cursor",
      payload: { id: clientId, name: guestName, color: myColor, offset: off },
    });
  }, [clientId, guestName, myColor]);

  /* ---------------- autosave ---------------- */
  const flush = useCallback(async () => {
    const html = pendingHtmlRef.current;
    const id = noteIdRef.current;
    if (html == null || !id) return;
    setSavingState("saving");
    const text = editorRef.current?.innerText ?? "";
    const { error } = await supabase
      .from("meeting_notes")
      .update({ content_html: html, content_text: text, updated_by_name: guestName })
      .eq("id", id);
    if (error) {
      setSavingState("offline");
      return; // stay dirty; retried by the interval below
    }
    pendingHtmlRef.current = null;
    lastSyncedRef.current = html;
    dirtyRef.current = false;
    setDirty(false);
    setSavingState("saved");
  }, [guestName]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (dirtyRef.current) void flush();
    }, 2500);
    const onOnline = () => {
      if (dirtyRef.current) void flush();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("online", onOnline);
    };
  }, [flush]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    pendingHtmlRef.current = editorRef.current.innerHTML;
    dirtyRef.current = true;
    setDirty(true);
    broadcastCursor();
    // mention trigger
    const sel = window.getSelection();
    const text = sel?.anchorNode?.textContent ?? "";
    const at = sel ? text.slice(0, sel.anchorOffset) : "";
    const m = /@([\w ]{0,20})$/.exec(at);
    if (m) {
      setMentionQuery(m[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  }, [broadcastCursor]);

  /* ---------------- formatting ---------------- */
  const exec = useCallback(
    (cmd: string, value?: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, value);
      handleInput();
    },
    [handleInput],
  );

  const insertHtml = useCallback(
    (html: string) => {
      editorRef.current?.focus();
      document.execCommand("insertHTML", false, html);
      handleInput();
    },
    [handleInput],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") { e.preventDefault(); exec("bold"); }
      else if (k === "i") { e.preventDefault(); exec("italic"); }
      else if (k === "u") { e.preventDefault(); exec("underline"); }
      else if (k === "k") {
        e.preventDefault();
        const url = window.prompt("Link URL");
        if (url) exec("createLink", url);
      } else if (k === "s") { e.preventDefault(); void flush(); }
    },
    [exec, flush],
  );

  const insertMention = useCallback(
    (a: NoteAttendee) => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const node = range.startContainer;
        const text = node.textContent ?? "";
        const before = text.slice(0, range.startOffset);
        const m = /@([\w ]{0,20})$/.exec(before);
        if (m && node.nodeType === Node.TEXT_NODE) {
          const r = document.createRange();
          r.setStart(node, range.startOffset - m[0].length);
          r.setEnd(node, range.startOffset);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      insertHtml(
        `<span class="ditm-mention" data-attendee-id="${a.id}" data-name="${a.full_name}">@${a.full_name}</span>&nbsp;`,
      );
      setMentionOpen(false);
    },
    [insertHtml],
  );

  const onEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const target = (e.target as HTMLElement).closest?.(".ditm-mention") as HTMLElement | null;
      if (target) {
        const id = target.getAttribute("data-attendee-id");
        const name = target.getAttribute("data-name") ?? "";
        onMention?.(id, name);
      }
      broadcastCursor();
    },
    [onMention, broadcastCursor],
  );

  /* ---------------- versions ---------------- */
  const loadVersions = useCallback(async () => {
    const { data } = await supabase
      .from("meeting_note_versions")
      .select("id, content_html, label, author_name, created_at")
      .eq("meeting_id", meetingId)
      .order("created_at", { ascending: false })
      .limit(50);
    setVersions((data ?? []) as VersionRow[]);
  }, [meetingId]);

  useEffect(() => {
    if (showHistory) void loadVersions();
  }, [showHistory, loadVersions]);

  const saveVersion = useCallback(
    async (label?: string) => {
      const id = noteIdRef.current;
      if (!id) return;
      await flush();
      const html = editorRef.current?.innerHTML ?? "";
      const { error } = await supabase.from("meeting_note_versions").insert({
        meeting_id: meetingId,
        note_id: id,
        content_html: html,
        label: label ?? null,
        author_name: guestName,
      });
      if (error) {
        toast.error("Could not save version");
        return;
      }
      toast.success("Version saved");
      if (showHistory) void loadVersions();
    },
    [flush, guestName, loadVersions, meetingId, showHistory],
  );

  // Snapshot a version automatically every 3 minutes while the doc changes.
  useEffect(() => {
    const t = window.setInterval(() => {
      const html = editorRef.current?.innerHTML ?? "";
      if (html.trim().length > 0 && dirtyRef.current === false && html !== "") {
        void supabase.from("meeting_note_versions").insert({
          meeting_id: meetingId,
          note_id: noteIdRef.current!,
          content_html: html,
          label: "Auto snapshot",
          author_name: guestName,
        });
      }
    }, 180000);
    return () => window.clearInterval(t);
  }, [meetingId, guestName]);

  const restoreVersion = useCallback(
    async (v: VersionRow) => {
      const id = noteIdRef.current;
      if (!id) return;
      const { error } = await supabase
        .from("meeting_notes")
        .update({ content_html: v.content_html, updated_by_name: guestName })
        .eq("id", id);
      if (error) {
        toast.error("Restore failed");
        return;
      }
      if (editorRef.current) editorRef.current.innerHTML = v.content_html;
      lastSyncedRef.current = v.content_html;
      pendingHtmlRef.current = null;
      dirtyRef.current = false;
      setDirty(false);
      toast.success("Version restored");
      setShowHistory(false);
    },
    [guestName],
  );

  const toggleEditMode = useCallback(async () => {
    const id = noteIdRef.current;
    if (!id || !note) return;
    const next = note.edit_mode === "everyone" ? "editors" : "everyone";
    const { error } = await supabase.from("meeting_notes").update({ edit_mode: next }).eq("id", id);
    if (error) {
      toast.error("Could not change permissions");
      return;
    }
    setNote({ ...note, edit_mode: next });
    toast.success(next === "everyone" ? "Everyone can edit" : "Only the host can edit");
  }, [note]);

  const mentionMatches = useMemo(
    () =>
      attendees
        .filter((a) => a.full_name.toLowerCase().includes(mentionQuery.trim().toLowerCase()))
        .slice(0, 6),
    [attendees, mentionQuery],
  );

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading notes…</div>;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="shrink-0 px-2 py-2 border-b border-[var(--border-soft)] flex flex-wrap items-center gap-1">
        <TB onClick={() => exec("formatBlock", "<h1>")} label="Heading 1" disabled={!canEdit}><Heading1 className="size-4" /></TB>
        <TB onClick={() => exec("formatBlock", "<h2>")} label="Heading 2" disabled={!canEdit}><Heading2 className="size-4" /></TB>
        <TB onClick={() => exec("bold")} label="Bold (Ctrl+B)" disabled={!canEdit}><Bold className="size-4" /></TB>
        <TB onClick={() => exec("italic")} label="Italic (Ctrl+I)" disabled={!canEdit}><Italic className="size-4" /></TB>
        <TB onClick={() => exec("underline")} label="Underline (Ctrl+U)" disabled={!canEdit}><Underline className="size-4" /></TB>
        <TB onClick={() => exec("insertUnorderedList")} label="Bullet list" disabled={!canEdit}><List className="size-4" /></TB>
        <TB onClick={() => exec("insertOrderedList")} label="Numbered list" disabled={!canEdit}><ListOrdered className="size-4" /></TB>
        <TB
          onClick={() => insertHtml('<div class="ditm-check"><input type="checkbox" /> <span>To do</span></div>')}
          label="Checklist"
          disabled={!canEdit}
        >
          <ListChecks className="size-4" />
        </TB>
        <TB onClick={() => insertHtml("<pre class=\"ditm-code\"><code>code</code></pre><p><br/></p>")} label="Code block" disabled={!canEdit}>
          <Code2 className="size-4" />
        </TB>
        <TB
          onClick={() =>
            insertHtml(
              '<table class="ditm-table"><tbody><tr><th>Item</th><th>Owner</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br/></p>',
            )
          }
          label="Table"
          disabled={!canEdit}
        >
          <TableIcon className="size-4" />
        </TB>
        <TB
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) exec("createLink", url);
          }}
          label="Link (Ctrl+K)"
          disabled={!canEdit}
        >
          <Link2 className="size-4" />
        </TB>
        <TB onClick={() => { setMentionQuery(""); setMentionOpen(true); }} label="Mention someone" disabled={!canEdit}>
          <AtSign className="size-4" />
        </TB>
        <div className="ml-auto flex items-center gap-1">
          <TB onClick={() => void saveVersion()} label="Save version" disabled={!canEdit}><Save className="size-4" /></TB>
          <TB onClick={() => setShowHistory((v) => !v)} label="Version history"><History className="size-4" /></TB>
        </div>
      </div>

      {/* Status row */}
      <div className="shrink-0 px-3 py-1.5 flex items-center gap-2 text-[11px] text-muted-foreground border-b border-[var(--border-soft)]">
        <span className="inline-flex items-center gap-1">
          {savingState === "offline" ? (
            <CloudOff className="size-3 text-amber-400" />
          ) : (
            <Cloud className={`size-3 ${savingState === "saving" ? "text-sky-300 animate-pulse" : "text-emerald-400"}`} />
          )}
          {savingState === "offline"
            ? "Offline — will sync"
            : savingState === "saving"
              ? "Saving…"
              : dirty
                ? "Unsaved changes"
                : "All changes saved"}
        </span>
        {note && (
          <Badge variant="outline" className="gap-1 text-[10px] border-[var(--border-soft)]">
            {note.edit_mode === "everyone" ? <Users className="size-3" /> : <Lock className="size-3" />}
            {note.edit_mode === "everyone" ? "Everyone edits" : "Host only"}
          </Badge>
        )}
        {isOwner && (
          <button onClick={() => void toggleEditMode()} className="text-gold hover:underline text-[11px]">
            change
          </button>
        )}
        {cursors.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1">
            {cursors.map((c) => (
              <span key={c.id} className="size-2 rounded-full" style={{ background: c.color }} title={c.name} />
            ))}
            editing now
          </span>
        )}
      </div>

      {/* Editor */}
      <div ref={wrapRef} className="relative flex-1 min-h-0 overflow-y-auto">
        <div
          ref={editorRef}
          className="ditm-notes min-h-full px-4 py-3 text-sm leading-relaxed outline-none"
          contentEditable={canEdit}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={onKeyDown}
          onKeyUp={broadcastCursor}
          onClick={onEditorClick}
          onBlur={() => { if (dirtyRef.current) void flush(); }}
          data-placeholder="Start typing meeting notes…"
        />

        {/* remote cursors */}
        {cursorPoints.map((c) => (
          <span
            key={c.id}
            className="pointer-events-none absolute z-10"
            style={{ top: c.top, left: c.left }}
          >
            <span className="block w-0.5 h-4" style={{ background: c.color }} />
            <span
              className="block -mt-0.5 px-1 rounded text-[9px] whitespace-nowrap text-[#0a1a3a]"
              style={{ background: c.color }}
            >
              {c.name}
            </span>
          </span>
        ))}

        {/* mention picker */}
        {mentionOpen && canEdit && (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-[var(--border-soft)] bg-[oklch(0.12_0.06_275/0.96)] backdrop-blur-md p-1 shadow-lg">
            {mentionMatches.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No matching participant</div>
            )}
            {mentionMatches.map((a) => (
              <button
                key={a.id}
                onClick={() => insertMention(a)}
                className="w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[color:var(--accent)]/15"
              >
                @{a.full_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Version history drawer */}
      {showHistory && (
        <div className="shrink-0 max-h-56 overflow-y-auto border-t border-[var(--border-soft)] bg-black/20">
          <div className="px-3 py-2 text-xs uppercase tracking-widest text-gold">Version history</div>
          {versions.length === 0 && (
            <div className="px-3 pb-3 text-xs text-muted-foreground">No versions saved yet.</div>
          )}
          {versions.map((v) => (
            <div key={v.id} className="px-3 py-2 flex items-center gap-2 border-t border-white/5">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-foreground/90 truncate">
                  {v.label || "Manual save"} · {v.author_name || "Unknown"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()}
                </div>
              </div>
              {isOwner && (
                <GoldButton size="sm" variant="outline" onClick={() => void restoreVersion(v)}>
                  <RotateCcw className="size-3" /> Restore
                </GoldButton>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TB({
  onClick,
  label,
  children,
  disabled,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="size-8 inline-flex items-center justify-center rounded-lg border border-[var(--border-soft)] bg-[color:var(--accent)]/5 text-foreground/85 hover:text-foreground hover:bg-[color:var(--accent)]/15 disabled:opacity-40 disabled:pointer-events-none transition-colors"
    >
      {children}
    </button>
  );
}
