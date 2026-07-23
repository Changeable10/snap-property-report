import { useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Status = "idle" | "recording" | "processing";

export function FeedbackButton() {
  const [status, setStatus] = useState<Status>("idle");
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");

  function startRecording() {
    const SR: any =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      toast.message("Voice feedback isn't supported in this browser.");
      return;
    }
    finalTranscriptRef.current = "";
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-NZ";
      rec.onresult = (ev: any) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalTranscriptRef.current += r[0].transcript + " ";
        }
      };
      rec.onerror = (ev: any) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          toast.error("Microphone permission denied");
        }
      };
      rec.onend = () => {
        void finishRecording();
      };
      recognitionRef.current = rec;
      rec.start();
      setStatus("recording");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start recording");
      setStatus("idle");
    }
  }

  function stopRecording() {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
  }

  async function finishRecording() {
    setStatus("processing");
    const transcript = finalTranscriptRef.current.trim();
    if (!transcript) {
      toast.message("No speech detected — try again.");
      setStatus("idle");
      return;
    }
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Not signed in");

      const { data, error } = await supabase.functions.invoke("classify-feedback", {
        body: { transcript },
      });
      if (error) throw error;
      const classification = data as {
        feedback_type: string;
        severity: string;
        structured_summary: string;
      };

      const { error: insertError } = await supabase.from("tester_feedback").insert({
        user_id: userId,
        feedback_type: classification.feedback_type,
        severity: classification.severity,
        raw_transcript: transcript,
        structured_summary: classification.structured_summary,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
      });
      if (insertError) throw insertError;

      toast.success("Thanks for your feedback!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save feedback");
    } finally {
      setStatus("idle");
    }
  }

  function handleClick() {
    if (status === "idle") startRecording();
    else if (status === "recording") stopRecording();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "processing"}
      aria-label={
        status === "recording"
          ? "Stop recording feedback"
          : status === "processing"
            ? "Saving feedback"
            : "Give voice feedback"
      }
      className={cn(
        "fixed bottom-20 right-4 z-40 flex size-14 items-center justify-center rounded-full shadow-lg transition-colors md:bottom-6",
        status === "recording"
          ? "bg-destructive text-destructive-foreground"
          : "bg-teal text-teal-foreground hover:bg-teal-dark",
        status === "processing" && "opacity-70",
      )}
    >
      {status === "processing" ? (
        <Loader2 className="size-5 animate-spin" />
      ) : status === "recording" ? (
        <Square className="size-5" />
      ) : (
        <Mic className="size-5" />
      )}
    </button>
  );
}
