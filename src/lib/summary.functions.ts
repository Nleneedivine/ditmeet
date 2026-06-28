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
          content: summary as unknown as Record<string, unknown>,
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

    const update: Record<string, unknown> = {
      status: "approved",
      approved_at: new Date().toISOString(),
    };
    if (data.content) update.content = data.content;
    if (data.hostNotes) update.host_notes = data.hostNotes;

    const { error } = await supabase
      .from("meeting_summaries")
      .update(update)
      .eq("meeting_id", data.meetingId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });
