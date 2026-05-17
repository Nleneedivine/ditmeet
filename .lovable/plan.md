This is a large set of features. To ship them well without one massive unreviewable change, I'll fix the visible Google sign-in bug first, then stage the rest in three reviewable passes. Each stage ends in a working app you can test.

## Stage 0 — Fix Google sign-in visibility (this turn)

The landing page's Google button isn't rendering. I'll inspect `src/routes/index.tsx`, confirm the `lovable.auth.signInWithOAuth("google", …)` button is mounted for signed-out users, restore it if missing, and verify in the preview.

## Stage 1 — Admin controls + Attendance + Waiting room

Database

- `meetings`: add `waiting_room_enabled` (bool), `recording_started_at`, `ended_at` already exists
- `meeting_attendees`: add `status` ('waiting' | 'admitted' | 'denied' | 'removed'), `is_admin` (bool, true for host), keep `joined_at` / `left_at` so duration = left_at − joined_at
- New table `meeting_speaker_timers` (meeting_id, attendee_id, seconds, started_at)
- RLS: host (auth.uid = meetings.host_id) can update/delete attendee rows and insert speaker timers; everyone can read for that meeting

UI / logic

- Host badge (gold "HOST" chip) on host's tile
- Admin action menu on each participant tile + in People sidebar: Mute, Remove, Set speaker timer, Spotlight, Request screen share
- Mute / kick via Daily's `updateParticipant({ setAudio: false })` / `updateParticipant({ eject: true })` (host token required — handled via a `createServerFn` `createDailyMeetingToken` that issues an owner token for the host and a regular token for guests)
- Speaker timer: Supabase row drives a synced countdown; on `0` the targeted client mutes itself (participant can unmute)
- Waiting room: lobby inserts attendee with `status='waiting'`; host sidebar shows pending list with Admit / Deny; only `admitted` rows call `callObject.join`
- Live attendance sidebar (already partly there) shows joined / left / duration
- "End meeting for all" → host ejects everyone and sets `meetings.ended_at`

Post-meeting

- Summary card: duration, unique participants, peak concurrent
- Attendance report: client-side CSV download (zero deps); PDF deferred to stage 3 if you want it

## Stage 2 — Recording + Smart screen share + Spotlight

- MediaRecorder on the host's tab capturing `getDisplayMedia({ video, audio })` mixed with mic; red "● REC" indicator broadcast via Supabase realtime to all tiles; on stop, a download button appears with a `.webm` blob URL
- Screen share: use Daily's existing `startScreenShare()` (already wired) — auto-spotlight the screen track to the main grid slot; small picture-in-picture row for camera tiles
- Annotation toolbar: transparent `<canvas>` overlay on the spotlight tile with pen / highlighter / arrow / clear, local-only (no shared-canvas backend in this stage)
- Admin "Request screen share" → Supabase broadcast event; target sees a toast with Accept / Decline

## Stage 3 — Reactions, Raise hand, Background blur, Auto-copy, PDF report

- Raise hand: per-attendee `hand_raised_at` column + realtime; queue shown in People sidebar; hand emoji on tile
- Reactions bar (👏 🎉 ❤️ 😂): Supabase broadcast channel; floating emojis animate up over the grid
- Background blur: Daily's `updateInputSettings({ video: { processor: { type: 'background-blur' } } })` toggle
- Auto-copy link on meeting create (toast + clipboard write — small change in dashboard)
- PDF attendance report via `jspdf` + `jspdf-autotable` (added then)

## Technical notes (for your reference)

- Owner tokens are minted server-side using `DAILY_API_KEY` (already stored); guests get non-owner tokens. This is what unlocks admin mute/eject on Daily.
- All cross-client signaling (timers, hand-raise, reactions, recording indicator, waiting-room admit) uses Supabase Realtime channels keyed by `meeting_id` — no new infra needed.
- The brand system (`bg-velvet`, `border-gold`, `text-rainbow`, `pulse-gold`) is reused for every new control.

## What I'll do right now

1. Fix the missing Google sign-in button (Stage 0).
2. Then ship Stage 1, after stage 1 move to ship stage 2 without stopping, after stage 2, move to ship stage 3. o stage by stage until you are done, do not stop half way.

&nbsp;