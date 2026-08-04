import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";

const SummarySchema = z.object({
  overview: z.string(),
  action_items: z.array(
    z.object({
      owner: z.string(),
      text: z.string(),
      due: z.string().optional(),
    }),
  ),
  key_points: z.array(z.string()),
  decisions: z.array(z.string()),
  typo_flags: z
    .array(
      z.object({
        original: z.string(),
        suggestion: z.string(),
        reason: z.string(),
      }),
    )
    .default([]),
});

export type GeneratedSummary = z.infer<typeof SummarySchema>;

/**
 * Generate an AI summary for a meeting. Only the meeting host (or super_admin)
 * may invoke it. Saves the result to meeting_summaries with status=pending_review.
 */
export const generateMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ meetingId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: must be the host or super_admin
    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .select("id, title, host_id, started_at, ended_at")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (mErr) throw new Error(mErr.message);
    if (!meeting) throw new Error("Meeting not found");

    if (meeting.host_id !== userId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }

    // Pull transcripts and attendees
    const [{ data: transcripts }, { data: attendees }] = await Promise.all([
      supabase
        .from("meeting_transcripts")
        .select("speaker_name, text, started_at")
        .eq("meeting_id", data.meetingId)
        .eq("is_interim", false)
        .order("started_at", { ascending: true })
        .limit(2000),
      supabase
        .from("meeting_attendees")
        .select("full_name, email, joined_at, left_at")
        .eq("meeting_id", data.meetingId),
    ]);

    const transcriptText = (transcripts ?? [])
      .map(
        (t) =>
          `[${new Date(t.started_at).toISOString().substring(11, 19)}] ${t.speaker_name}: ${t.text}`,
      )
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    let summary: GeneratedSummary = {
      overview: "No spoken transcript was captured for this meeting.",
      action_items: [],
      key_points: [],
      decisions: [],
      typo_flags: [],
    };

    if (transcriptText.length > 20) {
      const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
      const gateway = createLovableAiGatewayProvider(apiKey);
      const model = gateway("google/gemini-3-flash-preview");
      const attendeeList = (attendees ?? [])
        .map((a) => `- ${a.full_name}${a.email ? ` <${a.email}>` : ""}`)
        .join("\n");

      try {
        const { output } = await generateText({
          model,
          output: Output.object({ schema: SummarySchema }),
          system:
            "You are an executive meeting assistant. Produce a concise, structured summary of the meeting. Identify clear action items with owners, key discussion points, decisions, and flag obvious transcription typos with suggested corrections. Be specific, never invent attendees, and respect the speakers as listed.",
          prompt:
            `Meeting title: ${meeting.title}\n\nAttendees:\n${attendeeList || "(unknown)"}\n\nTranscript:\n${transcriptText.slice(0, 60000)}`,
        });
        summary = output;
      } catch (e) {
        console.error("AI summary generation failed:", e);
        summary = {
          overview:
            "Summary generation failed. The raw transcript is preserved below for host review.",
          action_items: [],
          key_points: [],
          decisions: [],
          typo_flags: [],
        };
      }
    }

    // Upsert
    const { error: uErr } = await supabase
      .from("meeting_summaries")
      .upsert(
        {
          meeting_id: data.meetingId,
          status: "pending_review",
          // jsonb column; the DB accepts any JSON-serializable value
          content: summary as never,
        },
        { onConflict: "meeting_id" },
      );
    if (uErr) throw new Error(uErr.message);

    return { ok: true, summary };
  });

/**
 * Approve a summary. Marks status=approved and would trigger participant emails.
 * Email delivery is performed by a separate transactional email worker once an
 * email domain is configured for this project; for now the function records the
 * approval timestamp.
 */
export const approveMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        meetingId: z.string().uuid(),
        content: z.record(z.string(), z.unknown()).optional(),
        hostNotes: z.array(z.unknown()).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, host_id")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (!meeting) throw new Error("Meeting not found");
    if (meeting.host_id !== userId) {
      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      });
      if (!isAdmin) throw new Error("Forbidden");
    }

    const update = {
      status: "approved" as const,
      approved_at: new Date().toISOString(),
      ...(data.content ? { content: data.content as never } : {}),
      ...(data.hostNotes ? { host_notes: data.hostNotes as never } : {}),
    };

    const { error } = await supabase
      .from("meeting_summaries")
      .update(update)
      .eq("meeting_id", data.meetingId);
    if (error) throw new Error(error.message);

    // Append the approved summary to the collaborative meeting notes.
    try {
      const { data: row } = await supabase
        .from("meeting_summaries")
        .select("content")
        .eq("meeting_id", data.meetingId)
        .maybeSingle();
      const content = (row?.content ?? {}) as Partial<GeneratedSummary>;
      const esc = (s: string) =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const parts: string[] = ['<h2>AI Summary</h2>'];
      if (content.overview) parts.push(`<p>${esc(content.overview)}</p>`);
      if (content.key_points?.length)
        parts.push(
          `<h2>Key points</h2><ul>${content.key_points.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`,
        );
      if (content.decisions?.length)
        parts.push(
          `<h2>Decisions</h2><ul>${content.decisions.map((k) => `<li>${esc(k)}</li>`).join("")}</ul>`,
        );
      if (content.action_items?.length)
        parts.push(
          `<h2>Action items</h2><ul>${content.action_items
            .map((a) => `<li><strong>${esc(a.owner)}</strong>: ${esc(a.text)}${a.due ? ` (${esc(a.due)})` : ""}</li>`)
            .join("")}</ul>`,
        );
      const html = parts.join("");

      const { data: note } = await supabase
        .from("meeting_notes")
        .select("id, content_html")
        .eq("meeting_id", data.meetingId)
        .maybeSingle();
      if (note) {
        if (!(note.content_html ?? "").includes("<h2>AI Summary</h2>")) {
          await supabase
            .from("meeting_notes")
            .update({ content_html: `${note.content_html ?? ""}${html}`, updated_by_name: "AI Summary" })
            .eq("id", note.id);
        }
      } else {
        await supabase
          .from("meeting_notes")
          .insert({ meeting_id: data.meetingId, content_html: html, updated_by_name: "AI Summary" });
      }
    } catch (e) {
      console.error("Appending summary to notes failed:", e);
    }

    return { ok: true };
  });
