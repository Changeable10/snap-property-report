import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, Mic, Square, ChevronLeft, ChevronRight, Check, Video, Loader2,
  Lightbulb, X, AlertTriangle, RefreshCw, Wand2, Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePlan } from "@/lib/use-plan";
import { useStagingThisMonth, STAGING_MONTHLY_LIMIT, STAGING_STYLES } from "@/lib/use-staging-limit";
import { incrementUsage } from "@/lib/use-usage";
import { UpgradeModal } from "@/components/UpgradeModal";
import { EnhancePhotoModal } from "@/components/EnhancePhotoModal";
import { DeletePhotoButton } from "@/components/DeletePhotoButton";
import { ACCEPTED_IMAGE_ACCEPT_ATTR, IMAGE_VALIDATION_ERROR, isAcceptedImage } from "@/lib/image-validation";
import { CameraFeedbackOverlay } from "@/components/CameraFeedbackOverlay";
import { HIGH_RES_VIDEO_CONSTRAINTS, scoreVideoFrames } from "@/lib/camera-quality";
import { PhotoEnhanceClientModal } from "@/components/PhotoEnhanceClientModal";
import { PhotoQualityGate } from "@/components/PhotoQualityGate";

export const Route = createFileRoute("/_authenticated/listing/$id/capture")({
  head: () => ({ meta: [{ title: "Listing capture — Snapsure" }] }),
  component: ListingCapture,
});

interface Room { id: string; name: string; sort_order: number }
interface ListingPhoto {
  id: string;
  room_id: string | null;
  photo_url: string;
  source: "photo" | "video_frame";
  captured_at: string;
  staged_url: string | null;
  staging_style: string | null;
  enhanced_url?: string | null;
  photo_state?: "raw" | "enhanced" | "staged" | "colour_adjusted" | null;
  adjustments?: Record<string, number> | null;
  user_id?: string;
}
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
        .select("id,room_id,photo_url,source,captured_at,staged_url,staging_style,enhanced_url,photo_state,adjustments,user_id")
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

  // Post-capture photo quality gate (blur/exposure check, before the AI shot check)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [showQualityGate, setShowQualityGate] = useState(false);

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

  // ---- Virtual staging ----
  const [authUserId, setAuthUserId] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) console.error("[virtual-staging] Failed to read authenticated user", error);
      if (active) setAuthUserId(data.user?.id);
    });
    return () => { active = false; };
  }, []);
  const { data: plan = "free" } = usePlan(listing?.user_id);
  const { data: stagingUsed = 0, refetch: refetchStagingUsage } = useStagingThisMonth(authUserId);
  const stagingLimit = STAGING_MONTHLY_LIMIT[plan];
  const stagingRemaining = stagingLimit === Infinity ? Infinity : Math.max(0, stagingLimit - stagingUsed);
  const outOfCredits = plan !== "free" && stagingRemaining < 1;
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [styleModalFor, setStyleModalFor] = useState<ListingPhoto | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  function requestStage(p: ListingPhoto) {
    if (plan === "free" || stagingRemaining < 1) {
      setShowUpgrade(true);
      return;
    }
    setStyleModalFor(p);
  }

  async function stagePhoto(p: ListingPhoto, styleKey: string) {
    setStagingId(p.id);
    try {
      const { data: signed } = await supabase.storage
        .from("inspection-photos").createSignedUrl(p.photo_url, 3600);
      const url = signed?.signedUrl;
      if (!url) throw new Error("Signed URL failed");
      const { data, error } = await supabase.functions.invoke("stage-listing-photo", {
        body: { image_url: url, style: styleKey, listing_id: id, photo_id: p.id, photo_path: p.photo_url },
      });
      if (error) {
        const { unwrapFunctionsError } = await import("@/lib/email-client");
        throw new Error(await unwrapFunctionsError(error, "Staging failed"));
      }
      console.log("[virtual-staging] stage-listing-photo response", data);
      if ((data as any)?.error) throw new Error((data as any).error);
      const stagedPathFromServer = (data as any)?.staged_path as string | undefined;
      if (stagedPathFromServer) {
        await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
        await refetchStagingUsage();
        toast.success("Staged version ready");
        return;
      }
      const stagedRemote = (data as any).staged_url as string;
      console.log("[virtual-staging] remote stagedUrl", stagedRemote);
      const resp = await fetch(stagedRemote);
      if (!resp.ok) throw new Error("Failed to fetch staged image");
      const blob = await resp.blob();
      // Storage RLS requires first folder to equal auth.uid().
      const { data: { user: _u } } = await supabase.auth.getUser();
      const uid = _u?.id ?? authUserId;
      if (!uid) throw new Error("Sign in required to save staged image");
      const stagedPath = `${uid}/staging/${id}/${p.id}-staged.jpg`;
      const { error: upErr } = await supabase.storage
        .from("inspection-photos")
        .upload(stagedPath, blob, { contentType: "image/jpeg", upsert: true });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from("listing_photos")
        .update({ staged_url: stagedPath, staging_style: styleKey, photo_state: "staged" })
        .eq("id", p.id);
      if (dbErr) {
        console.error("[virtual-staging] Failed to update photo", {
          table: "listing_photos",
          operation: "update",
          error: dbErr,
        });
        throw new Error("Failed to update photo");
      }
      const { data: { user: _authUser }, error: userErr } = await supabase.auth.getUser();
      if (userErr) console.error("[virtual-staging] Failed to read authenticated user before staging usage insert", userErr);
      const usageUserId = _authUser?.id ?? authUserId;
      if (!usageUserId) throw new Error("Sign in required to save staging usage");
      const { error: usageErr } = await supabase.from("staging_usage").insert({
        user_id: usageUserId,
        listing_photo_id: p.id,
        style: styleKey,
      });
      if (usageErr) {
        console.error("[virtual-staging] Failed to save staging usage", {
          table: "staging_usage",
          operation: "insert",
          error: usageErr,
        });
        throw new Error("Failed to save staging usage");
      }
      await qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      await refetchStagingUsage();
      void incrementUsage("staging");
      await qc.invalidateQueries({ queryKey: ["usage-tracking"] });
      toast.success("Staged version ready");
    } catch (e: any) {
      toast.error(e?.message ?? "Staging failed");
    } finally {
      setStagingId(null);
    }
  }

  async function handleStyleChosen(styleKey: string) {
    const target = styleModalFor;
    setStyleModalFor(null);
    if (!target) return;
    if (stagingRemaining < 1) { setShowUpgrade(true); return; }
    await stagePhoto(target, styleKey);
  }

  async function keepOriginal(p: ListingPhoto) {
    if (!p.staged_url) return;
    try {
      await supabase.storage.from("inspection-photos").remove([p.staged_url]);
    } catch { /* ignore */ }
    const { error } = await supabase.from("listing_photos")
      .update({ staged_url: null, staging_style: null })
      .eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["listing-photos", id] });
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !current || !listing) return;
    if (!isAcceptedImage(file)) { toast.error(IMAGE_VALIDATION_ERROR); return; }
    // Route through the post-capture quality gate first — upload/shot-check
    // only happens once the user confirms (or the photo auto-passes).
    setPendingPhotoFile(file);
    setShowQualityGate(true);
  }

  async function processAcceptedPhoto(file: File) {
    setShowQualityGate(false);
    setPendingPhotoFile(null);
    if (!current || !listing) return;
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

  function retakePendingPhoto() {
    setShowQualityGate(false);
    setPendingPhotoFile(null);
    fileRef.current?.click();
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
    rec.continuous = true; rec.interimResults = false; rec.lang = "en-NZ";
    rec.onresult = (ev: any) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
      }
      setTranscript(finalRef.current.trim());
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
  const [extractedFrames, setExtractedFrames] = useState<Array<{ base64: string; time: number; variance: number }>>([]);
  const [selectedFrames, setSelectedFrames] = useState<Set<number>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  // Room the video was recorded in — frames must save against this room,
  // not whichever room is currently displayed if the user navigates away.
  const [frameRoomId, setFrameRoomId] = useState<string | null>(null);
  const [pendingNavDir, setPendingNavDir] = useState<null | "prev" | "next" | "finish">(null);
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
      if (!current) return;
      // Lock the recording to the current room so saves land here even
      // if the user navigates before saving.
      setFrameRoomId(current.id);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: HIGH_RES_VIDEO_CONSTRAINTS, audio: true,
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
      const scored = await scoreVideoFrames(blob, {
        intervalSec: 0.5,
        topN: 10,
        minVariance: 80,
        width: 1280,
        quality: 0.85,
        fallbackDuration: Math.max(1, videoElapsed),
      });
      // Preserve existing shape: base64 as data URL for downstream consumers.
      const frames = scored
        .map((f) => ({
          base64: `data:image/jpeg;base64,${f.base64}`,
          time: f.time,
          variance: f.variance,
        }))
        // Sort sharpest first.
        .sort((a, b) => b.variance - a.variance);
      setExtractedFrames(frames);
      // Auto-deselect frames below the sharpness cutoff.
      const SHARP_CUTOFF = 150;
      setSelectedFrames(
        new Set(
          frames
            .map((f, i) => (f.variance >= SHARP_CUTOFF ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
      if (frames.length === 0) {
        toast.message("No sharp frames detected — try recording again with steadier motion.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Frame extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function saveSelectedFrames() {
    const targetRoomId = frameRoomId ?? current?.id ?? null;
    if (!targetRoomId || !listing || extractedFrames.length === 0) return;
    setSaving(true);
    try {
      const toSave = extractedFrames.filter((_, i) => selectedFrames.has(i));
      for (const f of toSave) {
        const bin = atob(f.base64.split(",")[1]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const path = `${listing.user_id}/listing-${id}/${targetRoomId}/frame-${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("inspection-photos")
          .upload(path, new Blob([bytes], { type: "image/jpeg" }), { contentType: "image/jpeg" });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("listing_photos").insert({
          user_id: listing.user_id,
          listing_id: id,
          room_id: targetRoomId,
          photo_url: path,
          source: "video_frame",
        });
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["listing-photos", id] });
      setExtractedFrames([]);
      setSelectedFrames(new Set());
      setFrameRoomId(null);
      toast.success(`Saved ${toSave.length} frames`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save frames");
    } finally {
      setSaving(false);
    }
  }

  function discardFrames() {
    setExtractedFrames([]);
    setSelectedFrames(new Set());
    setFrameRoomId(null);
  }

  const frameRoomName = useMemo(
    () => (rooms ?? []).find((r) => r.id === frameRoomId)?.name ?? "this room",
    [rooms, frameRoomId],
  );

  function tryNavigate(dir: "prev" | "next" | "finish") {
    if (extractedFrames.length > 0) {
      setPendingNavDir(dir);
      return;
    }
    performNavigate(dir);
  }

  async function performNavigate(dir: "prev" | "next" | "finish") {
    if (dir === "finish") { await finish(); return; }
    if (transcript || manualNotes) await saveNotes(transcript, manualNotes);
    if (dir === "prev") setIndex((i) => Math.max(0, i - 1));
    else setIndex((i) => Math.min(total - 1, i + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function confirmSaveThenNavigate() {
    const dir = pendingNavDir;
    if (!dir) return;
    await saveSelectedFrames();
    setPendingNavDir(null);
    await performNavigate(dir);
  }

  async function confirmDiscardThenNavigate() {
    const dir = pendingNavDir;
    if (!dir) return;
    discardFrames();
    setPendingNavDir(null);
    await performNavigate(dir);
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
            to="/property/$id"
            params={{ id: listing.property_id }}
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
          <input ref={fileRef} type="file" accept={ACCEPTED_IMAGE_ACCEPT_ATTR} capture="environment" className="hidden" onChange={onFile} />
          <PhotoQualityGate
            open={showQualityGate}
            imageFile={pendingPhotoFile}
            onAccept={processAcceptedPhoto}
            onRetake={retakePendingPhoto}
          />

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
          <div
            className="fixed inset-0 z-50 flex flex-col bg-black"
            role="dialog"
            aria-label="Video walkthrough recording"
          >
            <div className="relative flex-1">
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full bg-black object-cover"
              />
              <CameraFeedbackOverlay videoRef={videoPreviewRef} recording />
              <div className="absolute left-4 top-[calc(env(safe-area-inset-top)+12px)] flex items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white">
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-red-500" />
                REC {String(Math.floor(videoElapsed / 60)).padStart(2, "0")}:{String(videoElapsed % 60).padStart(2, "0")}
              </div>
            </div>
            <div className="shrink-0 bg-black px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              <button
                type="button"
                onClick={stopVideo}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-5 text-base font-semibold text-white shadow-lg hover:bg-red-700"
              >
                <Square className="size-5 fill-white" /> Stop recording
              </button>
            </div>
          </div>
        ) : null}

        {extracting ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Extracting frames…
          </div>
        ) : null}

        {extractedFrames.length > 0 ? (() => {
          const SHARP_CUTOFF = 150;
          const sharpCount = extractedFrames.filter((f) => f.variance >= SHARP_CUTOFF).length;
          const blurryCount = extractedFrames.length - sharpCount;
          const selectedSharp = Array.from(selectedFrames).filter(
            (i) => extractedFrames[i]?.variance >= SHARP_CUTOFF,
          ).length;
          return (
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
            <p className="mb-2 text-[11px] text-muted-foreground">
              {selectedSharp} sharp frame{selectedSharp === 1 ? "" : "s"} selected
              {blurryCount > 0 ? `, ${blurryCount} blurry excluded` : ""}. Sorted sharpest first.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {extractedFrames.map((f, i) => {
                const sel = selectedFrames.has(i);
                const dot =
                  f.variance >= 250 ? "bg-emerald-500" :
                  f.variance >= SHARP_CUTOFF ? "bg-amber-500" : "bg-red-500";
                const label =
                  f.variance >= 250 ? "Sharp" :
                  f.variance >= SHARP_CUTOFF ? "OK" : "Blurry";
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
                    <span
                      className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                      title={`Sharpness: ${label} (${Math.round(f.variance)})`}
                    >
                      <span className={`inline-block size-1.5 rounded-full ${dot}`} />
                      {label}
                    </span>
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
          );
        })() : null}

        {/* Photo thumbs */}
        {roomPhotos.length > 0 ? (
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Photos ({roomPhotos.length})
            </p>
            {plan !== "free" ? (
              <p className="mb-2 text-[11px] text-muted-foreground">
                {stagingLimit === Infinity
                  ? "Unlimited virtual staging on your plan."
                  : `${stagingUsed} of ${stagingLimit} staging credits used this month.`}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              {roomPhotos.map((p) => (
                <StagedPhotoCard
                  key={p.id}
                  photo={p}
                  staging={stagingId === p.id}
                  outOfCredits={outOfCredits}
                  freePlan={plan === "free"}
                  onStage={() => requestStage(p)}
                  onKeepOriginal={() => keepOriginal(p)}
                  onDeleted={() => qc.invalidateQueries({ queryKey: ["listing-photos", id] })}
                />
              ))}
            </div>
            {checking ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Checking shot quality…
              </div>
            ) : null}
            {shotCheck && !checking ? (
              <ShotCheckCard
                check={shotCheck}
                onKeep={() => setShotCheck(null)}
                onRetake={retakeCurrent}
              />
            ) : null}
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

      <nav
        className="fixed inset-x-0 z-40 border-t border-border bg-card/95 px-5 py-3 backdrop-blur bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] md:bottom-0"
        aria-label="Room navigation"
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => tryNavigate("prev")}
            disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-teal disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Previous
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            Room {index + 1} of {total}
          </span>
          <button
            type="button"
            onClick={() => tryNavigate(index < total - 1 ? "next" : "finish")}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-40"
          >
            {index < total - 1 ? "Next" : "Finish"} {index < total - 1 ? <ChevronRight className="size-4" /> : <Check className="size-4" />}
          </button>
        </div>
      </nav>

      {styleModalFor ? (
        <StyleModal onClose={() => setStyleModalFor(null)} onChoose={handleStyleChosen} />
      ) : null}
      <UpgradeModal open={showUpgrade} onClose={() => setShowUpgrade(false)} topUp="staging" />

      {pendingNavDir ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl">
            <h2 className="text-base font-semibold text-foreground">
              Save {selectedFrames.size || extractedFrames.length} photos to {frameRoomName} before moving on?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              You have unsaved video frames from {frameRoomName}. They'll be discarded if you continue without saving.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={confirmSaveThenNavigate}
                disabled={saving || selectedFrames.size === 0}
                className="flex min-h-11 items-center justify-center rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-60"
              >
                {saving ? "Saving…" : `Save to ${frameRoomName}`}
              </button>
              <button
                type="button"
                onClick={confirmDiscardThenNavigate}
                className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground"
              >
                Discard frames
              </button>
              <button
                type="button"
                onClick={() => setPendingNavDir(null)}
                className="flex min-h-9 items-center justify-center px-4 text-xs font-medium text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StagedPhotoCard({
  photo,
  staging,
  outOfCredits,
  freePlan,
  onStage,
  onKeepOriginal,
  onDeleted,
}: {
  photo: ListingPhoto;
  staging: boolean;
  outOfCredits: boolean;
  freePlan: boolean;
  onStage: () => void;
  onKeepOriginal: () => void;
  onDeleted?: () => void;
}) {
  const origUrl = useSignedUrl(photo.photo_url);
  const enhancedUrl = useSignedUrl(photo.enhanced_url ?? undefined);
  const stagedUrl = useSignedUrl(photo.staged_url ?? undefined);
  const hasStaged = !!photo.staged_url;
  const hasEnhanced = !!photo.enhanced_url;
  const hasAdjustments = !!photo.adjustments;
  const [aiEnhanceOpen, setAiEnhanceOpen] = useState(false);
  const [clientOpen, setClientOpen] = useState<null | "enhance" | "adjust" | "colour_adjust">(null);
  const state = (photo.photo_state ?? (hasStaged ? "staged" : hasEnhanced ? "enhanced" : "raw")) as
    "raw" | "enhanced" | "staged" | "colour_adjusted";
  const qc = useQueryClient();
  const disabled = staging || (!hasStaged && (freePlan || outOfCredits));
  const label = freePlan
    ? "Upgrade for staging"
    : outOfCredits && !hasStaged
      ? "Upgrade for more credits"
      : hasStaged ? "Try another style" : "Virtual staging";

  const hasBeforeAfter = hasStaged;
  const [lightbox, setLightbox] = useState<"before" | "staged" | "current" | null>(null);
  const lightboxUrl = lightbox === "before" ? origUrl : lightbox === "staged" ? stagedUrl : lightbox === "current" ? (hasEnhanced ? enhancedUrl : origUrl) : null;
  const lightboxLabel = lightbox === "before" ? "Original" : lightbox === "staged" ? `Staged · ${photo.staging_style ?? ""}` : lightbox === "current" ? (hasEnhanced ? (hasAdjustments ? "Adjusted" : "Enhanced") : "Original") : "";

  return (
    <div className={`relative overflow-hidden rounded-lg border border-border bg-background${hasBeforeAfter ? " col-span-2" : ""}`}>
      {lightbox && lightboxUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute right-3 top-3 z-10 flex size-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-sm"
            aria-label="Close"
          >
            <X className="size-6" />
          </button>
          <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-xs font-semibold text-white">
            {lightboxLabel}
          </span>
          <img
            src={lightboxUrl}
            alt={lightboxLabel}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          {hasStaged ? (
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox("before"); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-sm ${lightbox === "before" ? "bg-white text-black" : "bg-white/20 text-white"}`}
              >
                Before
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLightbox("staged"); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold backdrop-blur-sm ${lightbox === "staged" ? "bg-teal text-teal-foreground" : "bg-white/20 text-white"}`}
              >
                Staged
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      <DeletePhotoButton
        photoId={photo.id}
        table="listing_photos"
        storagePaths={[photo.photo_url, photo.enhanced_url, photo.staged_url]}
        onDeleted={onDeleted}
        className="absolute right-1 top-1 z-10 flex size-7 items-center justify-center rounded-full bg-black/60 text-white shadow backdrop-blur-sm hover:bg-black/75"
      />
      {hasStaged ? (
        <div className="grid grid-cols-2 gap-px bg-border">
          <button type="button" onClick={() => setLightbox("before")} className="relative aspect-[4/3] overflow-hidden bg-muted text-left">
            {origUrl ? <img src={origUrl} alt="Original" className="size-full object-cover" /> : null}
            <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">Before</span>
          </button>
          <button type="button" onClick={() => setLightbox("staged")} className="relative aspect-[4/3] overflow-hidden bg-muted text-left">
            {stagedUrl ? <img src={stagedUrl} alt="Staged" className="size-full object-cover" /> : null}
            <span className="absolute left-1 top-1 rounded bg-teal px-1.5 py-0.5 text-[10px] font-semibold text-teal-foreground">
              Staged{photo.staging_style ? ` · ${photo.staging_style}` : ""}
            </span>
          </button>
        </div>
      ) : (
        <div className="relative aspect-square w-full overflow-hidden bg-muted" onClick={() => setLightbox("current")} role="button" tabIndex={0}>
          {(hasEnhanced ? enhancedUrl : origUrl) ? (
            <img src={hasEnhanced ? enhancedUrl : origUrl} alt="" className="size-full object-cover" />
          ) : null}
          {hasEnhanced ? (
            <span className="absolute left-1 top-1 rounded bg-teal px-1.5 py-0.5 text-[9px] font-semibold text-teal-foreground">
              ✓ {hasAdjustments ? "Adjusted" : "Enhanced"}
            </span>
          ) : null}
          {!staging && state === "raw" ? (
            <div className="absolute bottom-1 right-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setAiEnhanceOpen(true)}
                className="flex size-7 items-center justify-center rounded-full bg-background/85 text-teal shadow backdrop-blur-sm"
                aria-label="Enhance photo (uses monthly credit)"
                title="AI enhance"
              >
                <Sparkles className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={onStage}
                disabled={disabled}
                className="flex size-7 items-center justify-center rounded-full bg-background/85 text-teal shadow backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Stage photo"
                title="Stage"
              >
                <Wand2 className="size-3.5" />
              </button>
            </div>
          ) : !staging && state === "enhanced" ? (
            <div className="absolute bottom-1 right-1 flex items-center gap-1">
              <button
                type="button"
                onClick={() => setClientOpen("adjust")}
                className="rounded-full bg-background/85 px-2 py-1 text-[10px] font-semibold text-teal shadow backdrop-blur-sm"
              >
                {hasAdjustments ? "Re-adjust" : "Adjust"}
              </button>
              <button
                type="button"
                onClick={onStage}
                disabled={disabled}
                className="flex size-7 items-center justify-center rounded-full bg-background/85 text-teal shadow backdrop-blur-sm disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Stage photo"
                title="Stage"
              >
                <Wand2 className="size-3.5" />
              </button>
            </div>
          ) : null}
          {!staging && (state === "staged" || state === "colour_adjusted") ? (
            <button
              type="button"
              onClick={() => setClientOpen("colour_adjust")}
              className="absolute bottom-1 right-1 rounded-full bg-background/85 px-2 py-1 text-[10px] font-semibold text-teal shadow backdrop-blur-sm"
            >
              Colour adjust
            </button>
          ) : null}
          {staging ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white">
              <Loader2 className="size-5 animate-spin" />
              <p className="text-[11px] font-medium">Staging your room…</p>
            </div>
          ) : null}
        </div>
      )}
      <div className="space-y-1.5 p-2">
        {hasStaged ? (
          <>
            <button
              type="button"
              onClick={() => setClientOpen("colour_adjust")}
              className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-teal px-2 text-[11px] font-semibold text-teal-foreground"
            >
              Colour adjust
            </button>
            <button
              type="button"
              onClick={onKeepOriginal}
              className="flex min-h-8 w-full items-center justify-center rounded-md border border-border px-2 text-[11px] font-semibold text-foreground"
            >
              Keep original
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onStage}
            disabled={disabled}
            className="flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-teal px-2 text-[11px] font-semibold text-teal-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            {staging ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
            {staging ? "Staging…" : label}
          </button>
        )}
      </div>
      <EnhancePhotoModal
        open={aiEnhanceOpen}
        onClose={() => setAiEnhanceOpen(false)}
        photoId={photo.id}
        photoPath={photo.photo_url}
        table="listing_photos"
        onApplied={() => qc.invalidateQueries({ queryKey: ["listing-photos"] })}
        onDiscarded={() => qc.invalidateQueries({ queryKey: ["listing-photos"] })}
      />
      {clientOpen && photo.user_id ? (
        <PhotoEnhanceClientModal
          open={!!clientOpen}
          onClose={() => setClientOpen(null)}
          mode={clientOpen}
          photoId={photo.id}
          photoPath={photo.photo_url}
          stagedPath={photo.staged_url ?? undefined}
          photoState={state}
          table="listing_photos"
          userId={photo.user_id}
          queryKey={["listing-photos"]}
        />
      ) : null}
    </div>
  );
}

function StyleModal({
  onClose,
  onChoose,
}: {
  onClose: () => void;
  onChoose: (styleKey: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-background p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom)+5.25rem)] shadow-xl sm:rounded-2xl sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          <X className="size-5" />
        </button>
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-teal" />
          <h3 className="pr-10 text-lg font-semibold text-foreground">Choose a style</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The AI will re-stage this room in your chosen style.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {STAGING_STYLES.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onChoose(s.key)}
              className="flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground hover:border-teal hover:bg-teal-light"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShotCheckCard({
  check,
  onKeep,
  onRetake,
}: {
  check: ShotCheck;
  onKeep: () => void;
  onRetake: () => void;
}) {
  const style =
    check.rating === "good"
      ? { border: "border-green-500/40", bg: "bg-green-50", text: "text-green-700", label: "Good shot", Icon: Check }
      : check.rating === "consider_retaking"
      ? { border: "border-amber-500/40", bg: "bg-amber-50", text: "text-amber-700", label: "Consider retaking", Icon: AlertTriangle }
      : { border: "border-red-500/40", bg: "bg-red-50", text: "text-red-700", label: "Retake recommended", Icon: RefreshCw };
  const Icon = style.Icon;
  return (
    <div className={`mt-3 rounded-xl border ${style.border} ${style.bg} p-3`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${style.text}`}>
        <Icon className="size-4" /> {style.label}
      </div>
      {check.reason ? (
        <p className="mt-1 text-xs text-foreground">{check.reason}</p>
      ) : null}
      {check.rating !== "good" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex min-h-9 flex-1 items-center justify-center rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground"
          >
            Keep anyway
          </button>
          <button
            type="button"
            onClick={onRetake}
            className="flex min-h-9 flex-1 items-center justify-center rounded-lg bg-teal px-3 text-xs font-semibold text-teal-foreground"
          >
            Retake
          </button>
        </div>
      ) : null}
    </div>
  );
}