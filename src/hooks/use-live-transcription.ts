import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  meetingId: string;
  attendeeId: string;
  speakerName: string;
  enabled: boolean;
}

interface SpeechRecognitionAlt {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
  resultIndex: number;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionAlt) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SRConstructor = new () => SpeechRecognitionLike;

export interface LiveTranscriptionState {
  supported: boolean;
  listening: boolean;
  interim: string;
  lastFinal: string;
  error: string | null;
}

/**
 * Streams the local participant's speech to Supabase as transcript rows.
 * Captions are then broadcast to all other clients via Postgres Realtime.
 */
export function useLiveTranscription({
  meetingId,
  attendeeId,
  speakerName,
  enabled,
}: Options): LiveTranscriptionState {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [lastFinal, setLastFinal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const stoppedRef = useRef(false);
  const finalTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      console.warn("[captions] SpeechRecognition not available in this browser");
      return;
    }
    setSupported(true);
    if (!enabled) return;

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    recRef.current = rec;
    stoppedRef.current = false;

    rec.onstart = () => {
      console.info("[captions] recognition started");
      setListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript.trim();
        if (!transcript) continue;
        if (res.isFinal) {
          console.info("[captions] final:", transcript);
          setLastFinal(transcript);
          if (finalTimerRef.current) window.clearTimeout(finalTimerRef.current);
          finalTimerRef.current = window.setTimeout(() => setLastFinal(""), 6000);
          void supabase
            .from("meeting_transcripts")
            .insert({
              meeting_id: meetingId,
              attendee_id: attendeeId,
              speaker_name: speakerName,
              text: transcript,
              is_interim: false,
              started_at: new Date().toISOString(),
              ended_at: new Date().toISOString(),
            })
            .then(({ error: insErr }) => {
              if (insErr) console.error("[captions] insert failed:", insErr);
            });
        } else {
          interimText += transcript + " ";
        }
      }
      setInterim(interimText.trim());
    };

    rec.onerror = (e) => {
      const err = e?.error || "transcription-error";
      console.warn("[captions] error:", err);
      if (err === "no-speech" || err === "aborted") return; // benign
      setError(err);
    };

    rec.onend = () => {
      console.info("[captions] recognition ended (auto-restart:", !stoppedRef.current, ")");
      setListening(false);
      if (!stoppedRef.current) {
        window.setTimeout(() => {
          if (stoppedRef.current) return;
          try {
            rec.start();
          } catch (err) {
            console.warn("[captions] restart failed:", err);
          }
        }, 250);
      }
    };

    try {
      rec.start();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "could-not-start";
      console.error("[captions] start threw:", msg);
      setError(msg);
    }

    return () => {
      stoppedRef.current = true;
      if (finalTimerRef.current) window.clearTimeout(finalTimerRef.current);
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
      setListening(false);
      setInterim("");
      setLastFinal("");
    };
  }, [meetingId, attendeeId, speakerName, enabled]);

  return { supported, listening, interim, lastFinal, error };
}
