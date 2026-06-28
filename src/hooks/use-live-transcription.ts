import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Options {
  meetingId: string;
  attendeeId: string;
  speakerName: string;
  enabled: boolean;
}

// Minimal Web Speech API typings — avoids relying on lib.dom.d.ts variants.
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
  start: () => void;
  stop: () => void;
}

type SRConstructor = new () => SpeechRecognitionLike;

export interface LiveTranscriptionState {
  supported: boolean;
  listening: boolean;
  interim: string;
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
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SRConstructor;
      webkitSpeechRecognition?: SRConstructor;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
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

    rec.onresult = (event) => {
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0].transcript.trim();
        if (!transcript) continue;
        if (res.isFinal) {
          // Persist final transcript line
          void supabase.from("meeting_transcripts").insert({
            meeting_id: meetingId,
            attendee_id: attendeeId,
            speaker_name: speakerName,
            text: transcript,
            is_interim: false,
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
          });
        } else {
          interimText += transcript + " ";
        }
      }
      setInterim(interimText.trim());
    };

    rec.onerror = (e) => {
      setError(e?.error || "transcription-error");
    };

    rec.onend = () => {
      setListening(false);
      // Browsers auto-stop after silence — restart unless we deliberately stopped.
      if (!stoppedRef.current) {
        try {
          rec.start();
          setListening(true);
        } catch {
          /* noop */
        }
      }
    };

    try {
      rec.start();
      setListening(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "could-not-start");
    }

    return () => {
      stoppedRef.current = true;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      recRef.current = null;
      setListening(false);
      setInterim("");
    };
  }, [meetingId, attendeeId, speakerName, enabled]);

  return { supported, listening, interim, error };
}
