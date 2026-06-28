import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  meetingId: string;
  speakerName: string;
  /** Live interim text for the LOCAL participant (Web Speech API). */
  liveInterim?: string;
}

/**
 * YouTube-style caption strip rendered under each participant tile.
 * - For the local participant we prefer the in-flight interim text.
 * - For remote participants we listen to meeting_transcripts inserts and
 *   show the latest line attributed to the matching speaker_name.
 */
export function CaptionStrip({ meetingId, speakerName, liveInterim }: Props) {
  const [latest, setLatest] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const ch = supabase
      .channel(`captions:${meetingId}:${speakerName}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "meeting_transcripts",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload) => {
          const row = payload.new as { speaker_name: string; text: string; is_interim: boolean };
          if (row.is_interim) return;
          if (row.speaker_name !== speakerName) return;
          if (cancelled) return;
          setLatest(row.text);
          window.setTimeout(() => {
            if (!cancelled) setLatest((cur) => (cur === row.text ? "" : cur));
          }, 5500);
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [meetingId, speakerName]);

  const display = liveInterim || latest;
  if (!display) return null;
  return (
    <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 max-w-[90%] z-10">
      <span className="inline-block px-3 py-1.5 rounded-md bg-black/80 text-white text-xs md:text-sm font-medium leading-snug shadow-lg backdrop-blur-sm text-center">
        {display}
      </span>
    </div>
  );
}
