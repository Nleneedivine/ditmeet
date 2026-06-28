# DITM Meet — AI & Collaboration Update

I'll ship in three stages without stopping. Visual design, branding, routes, auth, and existing WebRTC logic stay untouched — this is purely additive.

## Stage 0 — Audio fix (first)

DITM uses Daily.co (managed TURN/STUN, not raw WebRTC). The "no audio" symptom is almost always one of:

- The Daily callObject was joined before mic permissions resolved → track never published.
- `startCamera()` runs but `setLocalAudio(true)` was never called.
- The `<DailyAudio />` (or equivalent audio sink) component isn't mounted, so remote audio tracks have nowhere to play.

I'll reproduce in a two-tab Playwright run, inspect the participant track state, and fix the actual cause. If it really is a TURN issue I'll add a backup TURN config — but I won't add infra speculatively.

## Stage A — Transcription + Summary + Email + PDF

**Database**
- `meeting_transcripts` (meeting_id, attendee_id, speaker_name, text, started_at, ended_at, is_flagged, host_note)
- `meeting_summaries` (meeting_id, status: 'pending_review' | 'approved' | 'sent', content jsonb, host_notes jsonb, approved_at, sent_at, reminder_sent_at, pdf_url)
- `meeting_highlights` (summary_id, section, range, note) — host annotations
- `user_roles` + `app_role` enum incl. `super_admin`; trigger auto-grants `super_admin` to verified `divintelteam@gmail.com`
- `has_role()` security-definer fn for RLS
- RLS: participants read their own meeting transcripts/summaries; host reads/writes their meetings; super_admin reads everything

**Transcription (client-side Web Speech API)**
- New `useLiveTranscription` hook: per-tab `webkitSpeechRecognition`, English, continuous, interim results
- Final phrases insert into `meeting_transcripts` and broadcast on a Supabase Realtime channel for instant captions
- YouTube-style caption overlay on each video tile, attributed to speaker name
- Firefox fallback: caption strip says "Captions unavailable in this browser"

**AI summary pipeline** (`createServerFn` calling Lovable AI Gateway, `google/gemini-3-flash-preview`)
- Triggered when host clicks "End for all" or all participants leave
- Inputs: full transcript, commitments, polls, agenda, whiteboard snapshot, attendance, reputation
- Output: structured JSON (sections: overview, action_items, commitments, polls, agenda_planned, agenda_discovered, agenda_focus_score, reputation_deltas, typo_flags)
- Saved to `meeting_summaries` with `status='pending_review'`
- Typo detection: AI scans transcript, returns `{range, suggestion, reason}[]` shown as inline flags (transcript itself stays uneditable)

**Host review UI** (`/dashboard` → "Pending Review" section)
- Read-only transcript with highlight-to-annotate
- Editable summary/action-items body
- Approve → emails go out; Download PDF anytime

**Email** (Lovable Cloud built-in `resend`-style API via server fn)
- Approval → batched send to all attendees with summary HTML + PDF link
- 12-hour reminder via `pg_cron` + `/api/public/cron/summary-reminders` (auth via Supabase anon key per docs)

**PDF**: jsPDF + autoTable, brand-matched header, timestamped transcript, commitments, polls, agenda compare, focus score, whiteboard image, reputation table.

## Stage B — Agenda + Polls + Commitments tracker

**Agenda**
- `meeting_agenda_items` (meeting_id, position, title, notes, status: pending|active|done, completed_at)
- Pre-meeting agenda editor (host only) in dashboard
- In-meeting subtle banner pinned above video area showing current item
- AI watcher: every ~30s, server fn checks recent transcript window; if a topic seems concluded, sends private toast to host (Supabase channel scoped to host_id) suggesting "Mark item N complete?"
- Mark-done → realtime broadcast → "Agenda 2/5 complete" toast for everyone
- Drift detector: AI compares discussion vs planned; if low overlap, build "discovered agenda" list + subtle drift chip
- Final focus score = items_covered / items_planned weighted by talk-time alignment

**Polls**
- `meeting_polls` (meeting_id, created_by, question, options jsonb, anonymous, expires_at, closed_at)
- `meeting_poll_votes` (poll_id, attendee_id, option_index) — unique (poll_id, attendee_id)
- Any participant can launch; concurrent polls render in a stacked panel
- Live tallies via Realtime
- Closed/expired polls feed into summary

**Commitments**
- `meeting_commitments` (meeting_id, speaker_id, text, status: proposed|accepted|declined|retracted, decided_at)
- `meeting_commitment_reactions` (commitment_id, attendee_id, kind: endorse|challenge, note)
- AI commitment detector: same transcript window watcher, regex+LLM hybrid; on hit, inserts `status='proposed'`, opens modal for everyone with Accept/Decline targeted at speaker
- Accepted → appears in side tracker (visible to all rest of call)
- Reactions live-counted; if challenges > endorsements at meeting end → flagged in summary
- Speaker can retract → struck-through in tracker, marked retracted in PDF

## Stage C — Whiteboard + Reputation + Mobile

**Whiteboard**
- Route `/m/$roomName/board` (also embedded full-screen toggle from meeting room)
- `tldraw` (MIT, multiplayer-ready) with Supabase Realtime as the sync channel
- `meeting_whiteboards` (meeting_id, snapshot jsonb, image_url) — snapshot saved on meeting end
- Export PNG/SVG; snapshot embedded in PDF

**Reputation**
- `user_reputation` (user_id, meetings_attended, commitments_made, commitments_kept, commitments_retracted, commitments_challenged, polls_created, total_talk_time_sec, total_meeting_time_sec, agenda_focus_contribution)
- Updated by post-meeting summary job
- Profile page `/profile` shows charts + history
- Small badge next to participant name in meeting room (tier: Bronze/Silver/Gold based on kept/made ratio + activity)
- Super-admin view at `/admin` lists all meetings, summaries, reputations

**Mobile responsiveness** (no visual redesign — just reflow)
- Toolbar: collapses into a bottom sheet on `<768px`
- Chat panel: slide-up `Sheet` instead of side panel
- Video grid: `grid-cols-1` on mobile, scroll
- Agenda banner: truncates with tap-to-expand
- Whiteboard: touch-optimised toolbar
- Audit every dashboard/profile/admin screen at 360px width

## Technical notes
- All cross-client events (captions, commitments, polls, agenda, drift, reactions) go through Supabase Realtime channels keyed by `meeting_id`. No new infra.
- AI calls all go through `createServerFn` → Lovable AI Gateway → `google/gemini-3-flash-preview` (chat) and `openai/gpt-4o-mini-transcribe` only as Firefox fallback if you later want it (default stays free Web Speech).
- pg_cron handles the 12h reminder; endpoint lives at `/api/public/cron/summary-reminders`, authed with the existing anon key.
- Existing routes, brand tokens, Daily call logic, and the theme system are untouched. Every new component uses existing `VelvetCard` / `GoldButton` / CSS variables.

## Execution order (no stops between)
1. Stage 0 audio repro+fix → verify with two-tab Playwright
2. Migration: roles + transcripts + summaries (Stage A schema)
3. Stage A: transcription → summary pipeline → host review → email → PDF
4. Migration: agenda + polls + commitments
5. Stage B: agenda banner + AI watcher + polls UI + commitments tracker
6. Migration: whiteboard + reputation
7. Stage C: tldraw integration + reputation tracking + mobile audit
8. Final pass: end-to-end Playwright run, fix any regressions

This is large — expect significant credit usage. Approve to proceed.
