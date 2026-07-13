import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, Mic, Square, ChevronLeft, ChevronRight, Check, Video, Loader2,
  Lightbulb, X, AlertTriangle, RefreshCw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/listing/$id/capture")({
  head: () => ({ meta: [{ title: "Listing capture — Snapsure" }] }),
  component: ListingCapture,
});

interface Room { id: string; name: string; sort_order: number }
interface ListingPhoto { id: string; room_id: string | null; photo_url: string; source: "photo" | "video_frame"; captured_at: string }
interface ListingRoom { id: string; room_id: string; transcript: string | null; notes: string | null }

type ShotRating = "good" | "consider_retaking" | "retake_recommended";
interface ShotCheck { photoId: string; rating: ShotRating; reason: string }

const ROOM_TIPS: { keywords: string[]; tip: string }[] = [
  { keywords: ["living", "lounge", "family"], tip: "Stand in the doorway and shoot towards the window. Natural light sells." },
  { keywords: ["kitchen"], tip: "Capture the full bench and splashback. Include appliances. Clear the clutter." },
  { keywords: ["bed"], tip: "Shoot from the corner to show the full room. Include the window for light." },
  { keywords: ["bath", "toilet", "ensuite", "wc"], tip: "Shoot from the doorway. Include the vanity, shower, and toilet in one frame if possible." },
  { keywords: ["outdoor", "garden", "yard", "deck", "patio", "section", "exterior"], tip: "Shoot in the afternoon for warm light. Include the full section if possible." },
  { keywords: ["garage"], tip: "Open the door for light. Show the full depth." },
];
const DEFAULT_TIP = "Stand in the corner and shoot diagonally across the room for the widest view.";

function tipForRoom(name: string | undefined): string {
  if (!name) return DEFAULT_TIP;
  const lower = name.toLowerCase();
  for (const t of ROOM_TIPS) if (t.keywords.some((k) => lower.includes(k))) return t.tip;
  return DEFAULT_TIP;
}

function useSignedUrl(path: string | undefined) {
  const [url, setUrl] = useState<string | undefined>();
  useEffect(() => {
    let cancel = false;
    if (!path) { setUrl(undefined); return; }
    supabase.storage.from("inspection-photos").createSignedUrl(path, 3600).then(({ data }) => {
      if (!cancel) setUrl(data?.signedUrl);
    });
    return () => { cancel = true; };
  }, [path]);
  return url;
}

function ListingCapture() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: listing } = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("id,property_id,user_id,title,listing_type,target_portal")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["listing-rooms-list", listing?.property_id],
    enabled: !!listing?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", listing!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["listing-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("listing_photos")
        .select("id,room_id,photo_url,source,captured_at")
        .eq("listing_id", id)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ListingPhoto[];
    },
  });

  const { data: listingRooms } = useQuery({
    queryKey: ["listing-room-notes", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("listing_rooms")
        .select("id,room_id,transcript,notes")
        .eq("listing_id", id);
      if (error) throw error;
      return (data ?? []) as ListingRoom[];
    },
  });

  const [index, setIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = rooms?.[index];
  const total = rooms?.length ?? 0;

  // Shot guidance: on/off toggle (persisted) and per-room tip dismissal
  const [tipsEnabled, setTipsEnabled] = useState<boolean>(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("snapsure.shotTips");
    if (v === "off") setTipsEnabled(false);
  }, []);
  function toggleTips() {
    const next = !tipsEnabled;
    setTipsEnabled(next);
    try { window.localStorage.setItem("snapsure.shotTips", next ? "on" : "off"); } catch {}
  }
  const [dismissedTipRooms, setDismissedTipRooms] = useState<Set<string>>(new Set());
  const tipVisible =
    tipsEnabled &&
    !!current &&
    !dismissedTipRooms.has(current.id);

  // Post-capture shot check
  const [checking, setChecking] = useState(false);
  const [shotCheck, setShotCheck] = useState<ShotCheck | null>(null);
  useEffect(() => { setShotCheck(null); }, [current?.id]);

  const roomPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.room_id === current?.id),
    [photos, current?.id],
  );
  const showTipCard = tipVisible && roomPhotos.length === 0;
  const currentNotes = useMemo(
    () => (listingRooms ?? []).find((r) => r.room_id === current?.id),
    [listingRooms, current?.id],
  );

  const doneRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of photos ?? []) if (p.room_id) set.add(p.room_id);
    for (const r of listingRooms ?? []) if (r.transcript || r.notes) set.add(r.room_id);
    return set;
  }, [photos, listingRooms]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !current || !listing) return;
    const path = `${listing.user_id}/listing-${id}/${current.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("inspection-photos").upload(path, file, { contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: inserted, error: insErr } = await supabase.from("listing_photos").insert({
      user_id: listing.user_id,
      listing_id: id,
      room_id: current.id,
      photo_url: path,
      source: "photo",
    }).select("id").single();
    if (insErr) { toast.error(insErr.message); return; }
    qc.invalidateQueries({ queryKey: ["listing-photos", id] });
    if (tipsEnabled && inserted?.id) {
      void runShotCheck(inserted.id, path);
    }
  }

  async function runShotCheck(photoId: string, storagePath: string) {
    setChecking(true);
    setShotCheck(null);
    try {
      const { data: signed } = await supabase.storage
        .from("inspection-photos").createSignedUrl(storagePath, 600);
      if (!signed?.signedUrl) throw new Error("Signed URL failed");
      const { data, error } = await supabase.functions.invoke("check-listing-photo", {
        body: { image_url: signed.signedUrl },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const rating = (data as any).rating as ShotRating;
      const reason = String((data as any).reason ?? "");
      setShotCheck({ photoId, rating, reason });
    } catch (e) {
      console.warn("shot check failed", e);
    } finally {
      setChecking(false);
    }
  }

  async function retakeCurrent() {
    if (!shotCheck) return;
    const photo = (photos ?? []).find((p) => p.id === shotCheck.photoId);
    if (photo) {
      try {
        await supabase.storage.from("inspection-photos").remove([photo.photo_url]);
      } catch { /* ignore */ }
      await supabase.from("listing_photos").delete().eq("id", photo.id);
      qc.invalidateQueries({ queryKey: ["listing-photos", id] });
    }
    setShotCheck(null);
    fileRef.current?.click();
  }

  // ---- Voice ----
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const finalRef = useRef("");

  useEffect(() => {
    const SR: any = typeof window !== "undefined"
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    setSpeechSupported(!!SR);
  }, []);

  useEffect(() => {
    setTranscript(currentNotes?.transcript ?? "");
    setManualNotes(currentNotes?.notes ?? "");
    finalRef.current = "";
  }, [current?.id, currentNotes?.id]);

  function startRec() {
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setSpeechSupported(false); return; }
    finalRef.current = transcript ? transcript + " " : "";
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-NZ";
    rec.onresult = (ev: any) => {
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setTranscript((finalRef.current + interim).trim());
    };
    rec.onerror = (ev: any) => {
      if (ev?.error === "not-allowed") toast.error("Microphone permission denied");
    };
    rec.onend = () => setRecording(false);
    recognitionRef.current = rec;
    try { rec.start(); setRecording(true); } catch (e: any) { toast.error(e?.message ?? "Voice error"); }
  }
  function stopRec() {
    setRecording(false);
    try { recognitionRef.current?.stop(); } catch {}
    setTimeout(() => saveNotes(finalRef.current.trim() || transcript, manualNotes), 400);
  }

  async function saveNotes(newTranscript: string, newNotes: string) {
    if (!current || !listing) return;
    const payload = {
      user_id: listing.user_id,
      listing_id: id,
      room_id: current.id,
      transcript: newTranscript || null,
      notes: newNotes || null,
    };
    const { error } = await supabase.from("listing_rooms")
      .upsert(payload, { onConflict: "listing_id,room_id" });
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["listing-room-notes", id] });
  }

  // ---- Video walkthrough ----
  const [videoSupported, setVideoSupported] = useState(true);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoElapsed, setVideoElapsed] = useState(0);
  const [extractedFrames, setExtractedFrames] = useState<Array<{ base64: string; time: number }>>([]);
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ok = typeof navigator !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia
      && typeof (window as any).MediaRecorder !== "undefined";
    setVideoSupported(ok);
  }, []);

  useEffect(() => {
    if (!videoRecording) return;
    const el = videoPreviewRef.current; const stream = videoStreamRef.current;
    if (!el || !stream) return;
    try { el.srcObject = stream; } catch {}
    el.muted = true; (el as any).playsInline = true; el.autoplay = true;
    el.play().catch(() => {});
  }, [videoRecording]);

  async function startVideo() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } }, audio: true,
      });
      videoStreamRef.current = stream;
      videoChunksRef.current = [];
      const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
      rec.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: "video/webm" });
        stream.getTracks().forEach((t) => t.stop());
        videoStreamRef.current = null;
        if (videoTimerRef.current) clearInterval(videoTimerRef.current);
        void extractFrames(blob);
      };
      videoRecRef.current = rec;
      rec.start();
      setVideoRecording(true);
      setVideoElapsed(0);
      videoTimerRef.current = setInterval(() => setVideoElapsed((v) => v + 1), 1000);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start video");
    }
  }
  function stopVideo() {
    try { videoRecRef.current?.stop(); } catch {}
    setVideoRecording(false);
  }

  async function extractFrames(blob: Blob) {
    setExtracting(true);
    try {
      const url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.src = url; v.muted = true; (v as any).playsInline = true;
      await new Promise<void>((res, rej) => {
        v.onloadedmetadata = () => res();
        v.onerror = () => rej(new Error("video load failed"));
      });
      const duration = v.duration || 0;
      const canvas = document.createElement("canvas");
      canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext("2d")!;
      const frames: Array<{ base64: string; time: number }> = [];
      for (let t = 1; t < duration; t += 2) {
        await new Promise<void>((res) => {
          v.currentTime = t;
          v.onseeked = () => res();
        });
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        frames.push({ base64: dataUrl, time: t });
      }
      URL.revokeObjectURL(url);
      setExtractedFrames(frames);
      setSelectedFrames(new Set(frames.map((_, i) => i)));
    } catch (e: any) {
      toast.error(e?.message ?? "Frame extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function saveSelectedFrames() {
    if (!current || !listing || extractedFrames.length === 0) return;
    setSaving(true);
    try {
      const toSave = extractedFrames.filter((_, i) => selectedFrames.has(i));
      for (const f of toSave) {
        const bin = atob(f.base64.split(",")[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const path = `${listing.user_id}/listing-${id}/${current.id}/frame-${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("inspection-photos")
          .upload(path, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("listing_photos").insert({
          user_id: listing.user_id,
          listing_id: id,
          room_id: current.id,
          photo_url: path,
          source: "video_frame",
        });
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      setExtractedFrames([]);
      setSelectedFrames(new Set());
      toast.success(`Saved ${toSave.length} frames`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save frames");
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    // Save any pending notes
    if (current && (transcript || manualNotes)) {
      await saveNotes(transcript, manualNotes);
    }
    navigate({ to: "/listing/$id/review", params: { id } });
  }

  if (!listing || !rooms || total === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link
            to="/inspection/setup/$propertyId"
            params={{ propertyId: listing.property_id }}
            className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal"
          >
            <ArrowLeft className="size-4" />
            Back
          </Link>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight text-foreground">{current?.name}</h1>
            <span className="text-xs font-medium text-muted-foreground">
              Room {index + 1} of {total} · {doneRoomIds.size} done
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-teal transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-teal">Listing mode</p>
            <button
              type="button"
              onClick={toggleTips}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              aria-pressed={tipsEnabled}
            >
              <Lightbulb className={`size-3.5 ${tipsEnabled ? "text-teal" : ""}`} />
              Shot tips: {tipsEnabled ? "On" : "Off"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-6 px-5 py-6">
        {showTipCard ? (
          <div className="flex items-start gap-2 rounded-xl border border-teal/40 bg-teal-light/60 p-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-teal" />
            <p className="flex-1 text-xs text-foreground">
              <span className="font-semibold">Tip: </span>{tipForRoom(current?.name)}
            </p>
            <button
              type="button"
              onClick={() => {
                if (!current) return;
                setDismissedTipRooms((s) => new Set(s).add(current.id));
              }}
              aria-label="Dismiss tip"
              className="rounded-full p-1 text-muted-foreground hover:bg-teal/10"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {/* Capture buttons */}
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-teal px-5 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark"
          >
            <Camera className="size-5" /> Capture photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

          {videoSupported ? (
            !videoRecording ? (
              <button
                type="button"
                onClick={startVideo}
                disabled={extracting || saving}
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-teal bg-card px-5 text-sm font-semibold text-teal transition-colors hover:bg-teal-light disabled:opacity-60"
              >
                <Video className="size-5" /> Video walkthrough
              </button>
            ) : (
              <button
                type="button"
                onClick={stopVideo}
                className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700"
              >
                <Square className="size-5" /> Stop ({videoElapsed}s)
              </button>
            )
          ) : null}
        </section>

        {videoRecording ? (
          <div className="overflow-hidden rounded-xl border border-border bg-black">
            <video ref={videoPreviewRef} className="aspect-video w-full" />
          </div>
        ) : null}

        {extracting ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Extracting frames…
          </div>
        ) : null}

        {extractedFrames.length > 0 ? (
          <section className="rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">Select frames to save ({selectedFrames.size}/{extractedFrames.length})</p>
              <button
                type="button"
                onClick={saveSelectedFrames}
                disabled={saving || selectedFrames.size === 0}
                className="rounded-lg bg-teal px-3 py-1.5 text-xs font-semibold text-teal-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {extractedFrames.map((f, i) => {
                const sel = selectedFrames.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      const s = new Set(selectedFrames);
                      if (sel) s.delete(i); else s.add(i);
                      setSelectedFrames(s);
                    }}
                    className={`relative overflow-hidden rounded-lg border-2 ${sel ? "border-teal" : "border-transparent"}`}
                  >
                    <img src={f.base64} alt={`Frame ${i}`} className="aspect-video w-full object-cover" />
                    {sel ? (
                      <div className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-teal text-teal-foreground">
                        <Check className="size-3" />
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* Photo thumbs */}
        {roomPhotos.length > 0 ? (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Photos ({roomPhotos.length})
            </p>
            <div className="grid grid-cols-3 gap-2">
              {roomPhotos.map((p) => <PhotoThumb key={p.id} path={p.photo_url} />)}
            </div>
          </section>
        ) : null}

        {/* Voice notes */}
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Describe this room</p>
            {speechSupported ? (
              !recording ? (
                <button
                  type="button"
                  onClick={startRec}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground"
                >
                  <Mic className="size-4" /> Record
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRec}
                  className="flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white"
                >
                  <Square className="size-4" /> Stop
                </button>
              )
            ) : null}
          </div>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onBlur={() => saveNotes(transcript, manualNotes)}
            placeholder="Speak or type: e.g. spacious living area with polished timber floors and lots of natural light"
            rows={4}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <label className="mt-3 flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Additional notes
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              onBlur={() => saveNotes(transcript, manualNotes)}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
            />
          </label>
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card px-5 py-3">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-foreground disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Previous
          </button>
          {index < total - 1 ? (
            <button
              type="button"
              onClick={async () => {
                if (transcript || manualNotes) await saveNotes(transcript, manualNotes);
                setIndex((i) => Math.min(total - 1, i + 1));
              }}
              className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground"
            >
              Next <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={finish}
              className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground"
            >
              Finish <Check className="size-4" />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}

function PhotoThumb({ path }: { path: string }) {
  const url = useSignedUrl(path);
  return (
    <div className="aspect-square overflow-hidden rounded-lg bg-muted">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}