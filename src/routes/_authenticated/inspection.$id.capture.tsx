import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, Mic, Square, ChevronLeft, ChevronRight, Check, Pencil, Plus, Loader2, AlertTriangle, Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ConditionBadge } from "@/components/ConditionBadge";
import { parseTranscript, detectGeneralCondition, getStandardItemsForRoom, type Condition } from "@/lib/parse-transcript";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inspection/$id/capture")({
  head: () => ({ meta: [{ title: "Capture — Snapsure" }] }),
  component: CapturePage,
});

interface Room { id: string; name: string; sort_order: number }
interface PhotoRow {
  id: string; room_id: string; photo_url: string; captured_at: string;
  voice_transcript: string | null;
}
interface ItemRow {
  id: string; room_id: string; item_name: string;
  condition: Condition; description: string | null;
  sources: string[] | null; confidence: number | null;
}

const CONDITION_DOT: Record<Condition, string> = {
  good: "bg-condition-good",
  fair: "bg-condition-fair",
  poor: "bg-condition-poor",
  damaged: "bg-condition-damaged",
};

// signed url cache
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

function CapturePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: inspection } = useQuery({
    queryKey: ["inspection", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections").select("id, property_id, user_id, inspection_type").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  // Only compare on Routine / Exit inspections.
  const comparisonEnabled =
    inspection?.inspection_type === "routine" || inspection?.inspection_type === "exit";

  const { data: previousInspection } = useQuery({
    queryKey: ["previous-inspection", inspection?.property_id, id],
    enabled: !!inspection?.property_id && !!comparisonEnabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inspections")
        .select("id, inspection_date, inspection_type, completed_at")
        .eq("property_id", inspection!.property_id)
        .neq("id", id)
        .in("status", ["completed", "signed"])
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("inspection_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const previousInspectionId = previousInspection?.id;

  const { data: previousPhotos } = useQuery({
    queryKey: ["previous-inspection-photos", previousInspectionId],
    enabled: !!previousInspectionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_photos")
        .select("id,room_id,photo_url,captured_at,voice_transcript")
        .eq("inspection_id", previousInspectionId!)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhotoRow[];
    },
  });

  const { data: previousItems } = useQuery({
    queryKey: ["previous-inspection-items", previousInspectionId],
    enabled: !!previousInspectionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description,sources,confidence")
        .eq("inspection_id", previousInspectionId!);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const { data: comparisons } = useQuery({
    queryKey: ["comparison-photo-changes", id],
    enabled: !!comparisonEnabled,
    queryFn: async () => {
      const { data, error } = await supabase.from("comparison_results")
        .select("id, room_id, item_name, description, severity, status, changes_detected, current_photo_id, previous_photo_id")
        .eq("inspection_id", id)
        .not("changes_detected", "is", null);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; room_id: string; item_name: string; description: string | null;
        severity: "minor" | "moderate" | "significant";
        status: "pending" | "confirmed" | "dismissed";
        changes_detected: any; current_photo_id: string | null; previous_photo_id: string | null;
      }>;
    },
  });

  const { data: rooms } = useQuery({
    queryKey: ["rooms", inspection?.property_id],
    enabled: !!inspection?.property_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("rooms")
        .select("id,name,sort_order")
        .eq("property_id", inspection!.property_id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Room[];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["inspection-photos", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_photos")
        .select("id,room_id,photo_url,captured_at,voice_transcript")
        .eq("inspection_id", id)
        .order("captured_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PhotoRow[];
    },
  });

  const { data: items } = useQuery({
    queryKey: ["inspection-items", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inspection_items")
        .select("id,room_id,item_name,condition,description,sources,confidence")
        .eq("inspection_id", id)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(false);
  const didInitIndex = useRef(false);

  // ---- Video walkthrough state ----
  const [videoSupported, setVideoSupported] = useState(true);
  const [videoRecording, setVideoRecording] = useState(false);
  const [videoElapsed, setVideoElapsed] = useState(0);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [videoProgress, setVideoProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [videoError, setVideoError] = useState<string | null>(null);
  const [extractedFrames, setExtractedFrames] = useState<Array<{ base64: string; time: number }>>([]);
  const [selectedFrameIdx, setSelectedFrameIdx] = useState<Set<number>>(new Set());
  const [pendingVideoBlob, setPendingVideoBlob] = useState<Blob | null>(null);
  const [extractingFrames, setExtractingFrames] = useState(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const videoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const ok = typeof navigator !== "undefined"
      && !!navigator.mediaDevices?.getUserMedia
      && typeof window !== "undefined"
      && typeof (window as any).MediaRecorder !== "undefined";
    setVideoSupported(ok);
  }, []);

  // Attach the active MediaStream to the <video> element once it's actually
  // mounted in the DOM (state update → re-render → ref populated).
  useEffect(() => {
    if (!videoRecording) return;
    const el = videoPreviewRef.current;
    const stream = videoStreamRef.current;
    if (!el || !stream) return;
    try { el.srcObject = stream; } catch {}
    el.muted = true;
    (el as any).playsInline = true;
    el.autoplay = true;
    el.play().catch(() => {});
  }, [videoRecording]);

  const total = rooms?.length ?? 0;
  const current = rooms?.[index];

  // On first load, jump to the first room without any saved items (resume).
  useEffect(() => {
    if (didInitIndex.current) return;
    if (!rooms || !items) return;
    didInitIndex.current = true;
    if (items.length === 0) return;
    const withItems = new Set(items.map((i) => i.room_id));
    const firstEmpty = rooms.findIndex((r) => !withItems.has(r.id));
    if (firstEmpty > 0) setIndex(firstEmpty);
  }, [rooms, items]);

  useEffect(() => {
    if (!current) return;
    setVisited((prev) => prev.has(current.id) ? prev : new Set(prev).add(current.id));
  }, [current?.id]);

  const roomPhotos = useMemo(
    () => (photos ?? []).filter((p) => p.room_id === current?.id),
    [photos, current?.id],
  );
  const roomItems = useMemo(
    () => (items ?? []).filter((i) => i.room_id === current?.id),
    [items, current?.id],
  );

  const previousRoomPhotos = useMemo(
    () => (previousPhotos ?? []).filter((p) => p.room_id === current?.id),
    [previousPhotos, current?.id],
  );
  const previousRoomItems = useMemo(
    () => (previousItems ?? []).filter((i) => i.room_id === current?.id),
    [previousItems, current?.id],
  );
  const roomAcceptedChanges = useMemo(
    () => (comparisons ?? []).filter((c) => c.room_id === current?.id && c.status === "confirmed"),
    [comparisons, current?.id],
  );

  // Per-room ephemeral detected changes not yet accepted/dismissed.
  type DetectedChange = {
    key: string;
    item: string;
    description: string;
    severity: "minor" | "moderate" | "significant";
    currentPhotoId: string;
    previousPhotoId: string | null;
  };
  const [pendingChanges, setPendingChanges] = useState<Record<string, DetectedChange[]>>({});
  const [comparingRoomId, setComparingRoomId] = useState<string | null>(null);
  const currentPending = current ? (pendingChanges[current.id] ?? []) : [];

  const doneRoomIds = useMemo(() => {
    const set = new Set<string>();
    for (const it of items ?? []) set.add(it.room_id);
    return set;
  }, [items]);

  const progressPct = total > 0 ? (visited.size / total) * 100 : 0;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !current || !inspection) return;
    const path = `${inspection.user_id}/${id}/${current.id}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("inspection-photos").upload(path, file, { contentType: file.type });
    if (upErr) { toast.error(upErr.message); return; }
    const { data: inserted, error: insErr } = await supabase.from("inspection_photos").insert({
      user_id: inspection.user_id,
      inspection_id: id,
      room_id: current.id,
      photo_url: path,
    }).select("id").single();
    if (insErr) { toast.error(insErr.message); return; }
    qc.invalidateQueries({ queryKey: ["inspection-photos", id] });
    void analyzePhoto(file, current.id, current.name);
    if (comparisonEnabled && previousRoomPhotos.length > 0 && inserted?.id) {
      void runComparison(path, inserted.id, current.id, current.name);
    }
  }

  async function signedUrlFor(path: string): Promise<string | null> {
    const { data } = await supabase.storage.from("inspection-photos").createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  }

  async function runComparison(currentPath: string, currentPhotoId: string, roomId: string, roomName: string) {
    if (!inspection) return;
    const prev = (previousPhotos ?? []).filter((p) => p.room_id === roomId)[0];
    if (!prev) return;
    setComparingRoomId(roomId);
    try {
      const [currentUrl, previousUrl] = await Promise.all([
        signedUrlFor(currentPath),
        signedUrlFor(prev.photo_url),
      ]);
      if (!currentUrl || !previousUrl) return;
      const { data, error } = await supabase.functions.invoke("compare-inspection-photos", {
        body: { currentPhotoUrl: currentUrl, previousPhotoUrl: previousUrl, roomName },
      });
      if (error) throw error;
      const changes: Array<{ item: string; description: string; severity: DetectedChange["severity"] }> =
        Array.isArray(data?.changes) ? data.changes : [];
      if (changes.length === 0) return;
      setPendingChanges((prevMap) => {
        const existing = prevMap[roomId] ?? [];
        const mapped: DetectedChange[] = changes
          .filter((c) => c && c.severity && c.severity !== ("none" as any))
          .map((c, i) => ({
            key: `${currentPhotoId}-${i}`,
            item: String(c.item ?? "Item"),
            description: String(c.description ?? ""),
            severity: (c.severity as DetectedChange["severity"]) ?? "minor",
            currentPhotoId,
            previousPhotoId: prev.id,
          }));
        return { ...prevMap, [roomId]: [...existing, ...mapped] };
      });
    } catch (err: any) {
      console.warn("compare-inspection-photos failed", err?.message ?? err);
    } finally {
      setComparingRoomId((cur) => (cur === roomId ? null : cur));
    }
  }

  async function acceptChange(change: DetectedChange, roomId: string) {
    if (!inspection || !previousInspectionId) return;
    const { error } = await supabase.from("comparison_results").insert({
      user_id: inspection.user_id,
      inspection_id: id,
      previous_inspection_id: previousInspectionId,
      room_id: roomId,
      item_name: change.item,
      description: change.description || null,
      change_type: "deterioration",
      severity: change.severity,
      status: "confirmed",
      current_photo_id: change.currentPhotoId,
      previous_photo_id: change.previousPhotoId,
      changes_detected: {
        item: change.item,
        description: change.description,
        severity: change.severity,
      },
    });
    if (error) { toast.error(error.message); return; }
    setPendingChanges((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? []).filter((c) => c.key !== change.key),
    }));
    qc.invalidateQueries({ queryKey: ["comparison-photo-changes", id] });
  }

  function dismissChange(change: DetectedChange, roomId: string) {
    setPendingChanges((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] ?? []).filter((c) => c.key !== change.key),
    }));
  }

  async function analyzePhoto(file: File, roomId: string, roomName: string) {
    if (!inspection) return;
    setAnalyzing(true);
    setAnalyzeError(false);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
          const s = String(r.result ?? "");
          resolve(s.includes(",") ? s.split(",")[1] : s);
        };
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 15000),
      );
      const call = supabase.functions.invoke("analyze-photo", {
        body: { image_base64: base64, mime_type: file.type, room_type: roomName },
      });
      const { data, error } = (await Promise.race([call, timeout])) as any;
      if (error) throw error;
      const aiItems: Array<{
        name: string; condition: Condition; description?: string;
        maintenance_required?: boolean; maintenance_notes?: string;
        confidence?: number;
      }> = Array.isArray(data?.items) ? data.items : [];
      if (aiItems.length === 0) { setAnalyzing(false); return; }

      // Merge with existing items in this room (case-insensitive name match).
      const existing = (items ?? []).filter((i) => i.room_id === roomId);
      const byName = new Map(existing.map((it) => [it.item_name.toLowerCase(), it]));
      const toInsert: any[] = [];
      const nowSort = existing.length * 10;
      let idx = 0;
      for (const ai of aiItems) {
        if (!ai?.name) continue;
        const key = ai.name.toLowerCase();
        const cond = (["good","fair","poor","damaged"].includes(ai.condition) ? ai.condition : "good") as Condition;
        const existingItem = byName.get(key);
        if (existingItem) {
          const sources = Array.from(new Set([...(existingItem.sources ?? []), "photo"]));
          await supabase.from("inspection_items").update({
            sources,
            confidence: ai.confidence ?? existingItem.confidence,
          }).eq("id", existingItem.id);
          continue;
        }
        toInsert.push({
          user_id: inspection.user_id,
          inspection_id: id,
          room_id: roomId,
          item_name: ai.name,
          condition: cond,
          description: ai.description || null,
          maintenance_required: !!ai.maintenance_required,
          maintenance_notes: ai.maintenance_notes || null,
          sources: ["photo"],
          confidence: typeof ai.confidence === "number" ? ai.confidence : null,
          sort_order: nowSort + idx * 10,
        });
        idx++;
      }
      if (toInsert.length > 0) {
        const { error: insErr } = await supabase.from("inspection_items").insert(toInsert);
        if (insErr) throw insErr;
      }
      qc.invalidateQueries({ queryKey: ["inspection-items", id] });
    } catch (err: any) {
      setAnalyzeError(true);
    } finally {
      setAnalyzing(false);
    }
  }

  // ---- Voice recording ----
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState<string>("");
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const [manualText, setManualText] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);
  const recognitionRef = useRef<any>(null);
  const finalTranscriptRef = useRef<string>("");

  useEffect(() => {
    const SR: any = typeof window !== "undefined"
      ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
      : null;
    setSpeechSupported(!!SR);
  }, []);

  async function startRecording() {
    if (!current) return;
    setTranscript("");
    finalTranscriptRef.current = "";
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSpeechSupported(false);
      toast.message("Voice transcription isn't supported here — use the text box below.");
      return;
    }
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-NZ";
      rec.onresult = (ev: any) => {
        let interim = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) finalTranscriptRef.current += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        setTranscript((finalTranscriptRef.current + interim).trim());
      };
      rec.onerror = (ev: any) => {
        if (ev?.error === "not-allowed" || ev?.error === "service-not-allowed") {
          toast.error("Microphone permission denied");
        } else if (ev?.error === "no-speech") {
          // handled on stop
        }
      };
      rec.onend = () => { setRecording(false); };
      recognitionRef.current = rec;
      rec.start();
      setRecording(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start voice recording");
      setRecording(false);
    }
  }

  async function stopRecording() {
    setRecording(false);
    try { recognitionRef.current?.stop(); } catch {}
    // Allow final results to flush from SpeechRecognition before parsing.
    setTimeout(() => {
      const text = (finalTranscriptRef.current || transcript).trim();
      if (!text) {
        toast.message("No speech detected — try again or type your notes below.");
        return;
      }
      void saveTranscript(text);
    }, 500);
  }

  async function saveTranscript(rawText?: string) {
    if (!current || !inspection) return;
    const text = (rawText ?? transcript).trim();
    if (!text) return;
    // Attach transcript to most recent photo (if any)
    const latestPhoto = [...roomPhotos].pop();
    if (latestPhoto) {
      await supabase.from("inspection_photos")
        .update({ voice_transcript: text })
        .eq("id", latestPhoto.id);
    }
    // Build a per-item map. General condition (mode 1) sets a baseline for
    // all standard items with an EMPTY description. Specific mentions
    // (mode 2) override with their own condition + description.
    const parsed = parseTranscript(text, current.name);
    const general = detectGeneralCondition(text);
    const existingByName = new Map(
      roomItems.map((it) => [it.item_name.toLowerCase(), it] as const),
    );
    const perItem = new Map<string, {
      condition: Condition;
      description: string;
      maintenance_required: boolean;
      maintenance_notes: string | null;
      fromSpecific: boolean;
    }>();

    if (general) {
      for (const name of getStandardItemsForRoom(current.name)) {
        perItem.set(name, {
          condition: general,
          description: "",
          maintenance_required: general === "damaged" || general === "poor",
          maintenance_notes: null,
          fromSpecific: false,
        });
      }
    }
    for (const p of parsed) {
      perItem.set(p.item_name, {
        condition: p.condition,
        description: p.description,
        maintenance_required: !!p.maintenance_required,
        maintenance_notes: p.maintenance_notes ?? null,
        fromSpecific: true,
      });
    }

    const entries = Array.from(perItem.entries());
    const toInsert: any[] = [];
    let addIdx = 0;
    for (const [name, val] of entries) {
      const existing = existingByName.get(name.toLowerCase());
      if (existing) {
        // Voice overrides existing (e.g. photo detection) for this item.
        const sources = Array.from(new Set([...(existing.sources ?? []), "voice"]));
        // If voice only sets a baseline (no specific mention) AND the existing
        // item already has richer info, only merge the source tag.
        const patch: any = { sources };
        if (val.fromSpecific) {
          patch.condition = val.condition;
          patch.description = val.description || null;
          patch.maintenance_required = val.maintenance_required;
          patch.maintenance_notes = val.maintenance_notes;
        }
        await supabase.from("inspection_items").update(patch).eq("id", existing.id);
        continue;
      }
      toInsert.push({
        user_id: inspection.user_id,
        inspection_id: id,
        room_id: current.id,
        item_name: name,
        condition: val.condition,
        description: val.description ? val.description : null,
        maintenance_required: val.maintenance_required,
        maintenance_notes: val.maintenance_notes,
        sources: ["voice"],
        sort_order: (roomItems.length + addIdx) * 10,
      });
      addIdx++;
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from("inspection_items").insert(toInsert);
      if (error) { toast.error(error.message); return; }
    }
    if (entries.length > 0) {
      toast.success(`Voice notes applied to ${entries.length} ${entries.length === 1 ? "item" : "items"}`);
    }
    qc.invalidateQueries({ queryKey: ["inspection-items", id] });
    qc.invalidateQueries({ queryKey: ["inspection-photos", id] });
  }

  function goPrev() { setIndex((i) => Math.max(0, i - 1)); setTranscript(""); }
  function goNext() {
    if (!rooms) return;
    if (index >= rooms.length - 1) {
      navigate({ to: "/inspection/$id/review", params: { id } });
      return;
    }
    setIndex((i) => Math.min(rooms.length - 1, i + 1));
    setTranscript("");
  }

  // ---- Video walkthrough ----
  async function startVideoWalkthrough() {
    if (!current) return;
    setVideoError(null);
    setExtractedFrames([]);
    setSelectedFrameIdx(new Set());
    setPendingVideoBlob(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!stream.active) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Camera stream is not active");
      }
      videoStreamRef.current = stream;
      const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
      const mime = mimeCandidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "";
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      videoChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) videoChunksRef.current.push(e.data); };
      videoRecorderRef.current = mr;
      mr.start(1000);
      setVideoRecording(true);
      setVideoElapsed(0);
      videoTimerRef.current = setInterval(() => setVideoElapsed((s) => s + 1), 1000);
    } catch (err: any) {
      setVideoSupported(false);
      setVideoError(err?.message === "Camera stream is not active"
        ? "Camera did not start — try Capture photo instead."
        : "Video recording is not available on this device. Use Capture photo instead.");
      toast.error("Camera permission denied or unavailable");
    }
  }

  async function stopVideoWalkthrough() {
    const mr = videoRecorderRef.current;
    if (!mr) return;
    const stopped = new Promise<void>((resolve) => { mr.onstop = () => resolve(); });
    try { mr.stop(); } catch {}
    await stopped;
    if (videoTimerRef.current) { clearInterval(videoTimerRef.current); videoTimerRef.current = null; }
    videoStreamRef.current?.getTracks().forEach((t) => t.stop());
    videoStreamRef.current = null;
    if (videoPreviewRef.current) videoPreviewRef.current.srcObject = null;
    setVideoRecording(false);
    const blob = new Blob(videoChunksRef.current, { type: mr.mimeType || "video/webm" });
    videoChunksRef.current = [];
    if (blob.size === 0) return;
    setPendingVideoBlob(blob);
    setExtractingFrames(true);
    try {
      const frames = await extractFrames(blob);
      setExtractedFrames(frames);
      setSelectedFrameIdx(new Set(frames.map((_, i) => i)));
    } catch {
      toast.error("Could not extract frames from the recording");
    } finally {
      setExtractingFrames(false);
    }
  }

  async function extractFrames(blob: Blob): Promise<Array<{ base64: string; time: number }>> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const v = document.createElement("video");
      v.preload = "auto";
      v.muted = true;
      (v as any).playsInline = true;
      v.src = url;
      const canvas = document.createElement("canvas");
      const frames: Array<{ base64: string; time: number }> = [];
      const cleanup = () => { URL.revokeObjectURL(url); };
      v.onerror = () => { cleanup(); reject(new Error("video load error")); };
      v.onloadedmetadata = async () => {
        // Some browsers report duration=Infinity for MediaRecorder webm; seek to end to force resolve.
        if (!isFinite(v.duration) || v.duration === 0) {
          await new Promise<void>((res) => {
            const onSeeked = () => { v.removeEventListener("seeked", onSeeked); res(); };
            v.addEventListener("seeked", onSeeked);
            try { v.currentTime = 1e9; } catch { res(); }
          });
        }
        const duration = isFinite(v.duration) ? v.duration : Math.max(1, videoElapsed);
        const w = 640;
        const h = Math.round((v.videoHeight / (v.videoWidth || 1)) * w) || 360;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); reject(new Error("canvas unavailable")); return; }
        const times: number[] = [];
        for (let t = 0; t < duration; t += 2) times.push(t);
        if (times.length === 0) times.push(0);
        for (const t of times) {
          await new Promise<void>((res) => {
            const onSeeked = () => { v.removeEventListener("seeked", onSeeked); res(); };
            v.addEventListener("seeked", onSeeked);
            try { v.currentTime = Math.min(t, Math.max(0, duration - 0.05)); } catch { res(); }
          });
          ctx.drawImage(v, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
          const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
          frames.push({ base64, time: t });
        }
        cleanup();
        resolve(frames);
      };
    });
  }

  async function analyzeSelectedFrames() {
    if (!inspection || !current) return;
    const blob = pendingVideoBlob;
    const selectedIndices = Array.from(selectedFrameIdx).sort((a, b) => a - b);
    if (selectedIndices.length === 0) {
      toast.message("Select at least one frame to analyse.");
      return;
    }
    const frames = selectedIndices.map((i) => extractedFrames[i]).filter(Boolean);
    if (frames.length === 0) return;
    setVideoProcessing(true);
    setVideoProgress({ current: 0, total: frames.length });
    const roomId = current.id;
    const roomName = current.name;
    // Upload the full recording in the background.
    if (blob) {
      const videoPath = `${inspection.user_id}/${id}/${roomId}/walkthrough-${crypto.randomUUID()}.webm`;
      void supabase.storage.from("inspection-photos").upload(videoPath, blob, { contentType: blob.type || "video/webm" });
    }

    type AiItem = {
      name: string; condition: Condition; description?: string;
      maintenance_required?: boolean; maintenance_notes?: string; confidence?: number;
    };
    const rank: Record<Condition, number> = { good: 0, fair: 1, poor: 2, damaged: 3 };
    // Dedup by item name. For same name + same condition, keep only the
    // first detected instance (highest-confidence frame). For same name +
    // different condition, worst-condition wins.
    const merged = new Map<string, {
      name: string; condition: Condition; confidence: number;
      description: string | null; maintenance_required: boolean;
      maintenance_notes: string | null; bestFrameIdx: number;
    }>();

    for (let i = 0; i < frames.length; i++) {
      setVideoProgress({ current: i + 1, total: frames.length });
      try {
        const call = supabase.functions.invoke("analyze-photo", {
          body: { image_base64: frames[i].base64, mime_type: "image/jpeg", room_type: roomName },
        });
        const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 20000));
        const { data, error } = (await Promise.race([call, timeout])) as any;
        if (error) continue;
        const aiItems: AiItem[] = Array.isArray(data?.items) ? data.items : [];
        for (const ai of aiItems) {
          if (!ai?.name) continue;
          const cond = (["good","fair","poor","damaged"].includes(ai.condition) ? ai.condition : "good") as Condition;
          const conf = typeof ai.confidence === "number" ? ai.confidence : 0;
          const key = ai.name.toLowerCase().trim();
          const prev = merged.get(key);
          if (!prev) {
            merged.set(key, {
              name: ai.name,
              condition: cond,
              confidence: conf,
              description: ai.description?.trim() || null,
              maintenance_required: !!ai.maintenance_required,
              maintenance_notes: ai.maintenance_notes?.trim() || null,
              bestFrameIdx: i,
            });
          } else if (rank[cond] > rank[prev.condition]) {
            // Worse condition — replace the record entirely.
            merged.set(key, {
              name: ai.name,
              condition: cond,
              confidence: conf,
              description: ai.description?.trim() || null,
              maintenance_required: !!ai.maintenance_required,
              maintenance_notes: ai.maintenance_notes?.trim() || null,
              bestFrameIdx: i,
            });
          }
          // else: same or better condition → keep the first (highest-confidence) instance.
        }
      } catch {
        // continue on error
      }
    }

    // Upload best frames per item (deduped by frame index) and record photo rows.
    const frameIdxToPath = new Map<number, string>();
    for (const m of merged.values()) {
      if (frameIdxToPath.has(m.bestFrameIdx)) continue;
      const bin = Uint8Array.from(atob(frames[m.bestFrameIdx].base64), (c) => c.charCodeAt(0));
      const path = `${inspection.user_id}/${id}/${roomId}/frame-${crypto.randomUUID()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("inspection-photos").upload(path, bin, { contentType: "image/jpeg" });
      if (upErr) continue;
      frameIdxToPath.set(m.bestFrameIdx, path);
      await supabase.from("inspection_photos").insert({
        user_id: inspection.user_id,
        inspection_id: id,
        room_id: roomId,
        photo_url: path,
      });
    }

    // Merge into inspection_items (matching by name, video source).
    const existing = (items ?? []).filter((i) => i.room_id === roomId);
    const byName = new Map(existing.map((it) => [it.item_name.toLowerCase(), it]));
    const toInsert: any[] = [];
    const nowSort = existing.length * 10;
    let insIdx = 0;
    for (const m of merged.values()) {
      const key = m.name.toLowerCase();
      const existingItem = byName.get(key);
      const description = m.description;
      const notes = m.maintenance_notes;
      if (existingItem) {
        const sources = Array.from(new Set([...(existingItem.sources ?? []), "video"]));
        const nextCond = rank[m.condition] > rank[existingItem.condition] ? m.condition : existingItem.condition;
        await supabase.from("inspection_items").update({
          sources,
          condition: nextCond,
          description: existingItem.description ? existingItem.description : description,
          confidence: m.confidence || existingItem.confidence,
        }).eq("id", existingItem.id);
        continue;
      }
      toInsert.push({
        user_id: inspection.user_id,
        inspection_id: id,
        room_id: roomId,
        item_name: m.name,
        condition: m.condition,
        description,
        maintenance_required: m.maintenance_required,
        maintenance_notes: notes,
        sources: ["video"],
        confidence: m.confidence,
        sort_order: nowSort + insIdx * 10,
      });
      insIdx++;
    }
    if (toInsert.length > 0) {
      const { error } = await supabase.from("inspection_items").insert(toInsert);
      if (error) toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["inspection-items", id] });
    qc.invalidateQueries({ queryKey: ["inspection-photos", id] });
    setVideoProcessing(false);
    const framesAnalyzed = frames.length;
    setExtractedFrames([]);
    setSelectedFrameIdx(new Set());
    setPendingVideoBlob(null);
    if (merged.size > 0) {
      toast.success(`${merged.size} unique ${merged.size === 1 ? "item" : "items"} found from ${framesAnalyzed} ${framesAnalyzed === 1 ? "frame" : "frames"} analysed`);
    } else {
      toast.message(`No items detected across ${framesAnalyzed} ${framesAnalyzed === 1 ? "frame" : "frames"}.`);
    }
  }

  const countsByCondition = useMemo(() => {
    const c: Record<Condition, number> = { good: 0, fair: 0, poor: 0, damaged: 0 };
    for (const it of roomItems) c[it.condition]++;
    return c;
  }, [roomItems]);

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="border-b border-border px-5 pt-6 pb-4">
        <div className="mx-auto max-w-md">
          <Link to="/" className="mb-2 inline-flex min-h-11 items-center gap-1 -ml-2 pr-3 pl-2 text-sm font-medium text-teal">
            <ArrowLeft className="size-4" /> Exit
          </Link>
          {total > 0 && current ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <h1 className="truncate text-xl font-bold tracking-tight text-foreground">{current.name}</h1>
                <span className="shrink-0 text-sm font-medium text-muted-foreground">{index + 1} of {total}</span>
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-teal-light">
                <div className="h-full bg-teal transition-all" style={{ width: `${progressPct}%` }} />
              </div>
            </>
          ) : (
            <h1 className="text-xl font-bold tracking-tight text-foreground">Loading…</h1>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-md px-5 py-6">
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />

        {comparisonEnabled && previousInspection && (
          <div className="mb-4 rounded-xl border border-teal/30 bg-teal/5 px-3 py-2 text-xs font-medium text-teal-dark">
            Comparing against {capitaliseInspection(previousInspection.inspection_type)} inspection from {formatDMY(previousInspection.completed_at ?? previousInspection.inspection_date)}
          </div>
        )}

        {comparisonEnabled && previousInspection && current && (
          <PreviousInspectionPanel
            photos={previousRoomPhotos}
            items={previousRoomItems}
          />
        )}

        {comparisonEnabled && previousInspection && current && (
          <ChangesSection
            comparing={comparingRoomId === current.id}
            pending={currentPending}
            accepted={roomAcceptedChanges}
            onAccept={(c) => acceptChange(c, current.id)}
            onDismiss={(c) => dismissChange(c, current.id)}
          />
        )}

        {roomPhotos.length === 0 ? (
          <div className={`grid gap-3 ${videoSupported ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!current}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 text-base font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              <Camera className="size-5" /> Capture photo
            </button>
            {videoSupported && (
              <button
                type="button"
                onClick={startVideoWalkthrough}
                disabled={!current || videoProcessing}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 text-base font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
              >
                <Video className="size-5" /> Video walkthrough
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {roomPhotos.map((p) => <PhotoThumb key={p.id} path={p.photo_url} />)}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 text-sm font-semibold text-teal"
              >
                <Plus className="size-5" />
                Add close-up
              </button>
            </div>
            {videoSupported && (
              <button
                type="button"
                onClick={startVideoWalkthrough}
                disabled={!current || videoProcessing}
                className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
              >
                <Video className="size-4" /> Video walkthrough
              </button>
            )}
          </>
        )}

        {videoError && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="size-4" /> {videoError}
          </div>
        )}

        {videoRecording && (
          <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-black">
            <div className="relative">
              <video
                ref={videoPreviewRef}
                autoPlay
                muted
                playsInline
                className="block w-full aspect-video bg-black object-cover"
              />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
                <span className="inline-block size-2.5 animate-pulse rounded-full bg-red-500" />
                REC {String(Math.floor(videoElapsed / 60)).padStart(2, "0")}:{String(videoElapsed % 60).padStart(2, "0")}
              </div>
            </div>
            <button
              type="button"
              onClick={stopVideoWalkthrough}
              className="flex min-h-12 w-full items-center justify-center gap-2 bg-red-600 px-5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <Square className="size-4 fill-white" /> Stop recording
            </button>
          </div>
        )}

        {extractingFrames && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-teal/5 px-4 py-3 text-sm font-medium text-teal">
            <Loader2 className="size-4 animate-spin" /> Extracting frames…
          </div>
        )}

        {!videoProcessing && extractedFrames.length > 0 && (
          <div className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">
                Review frames ({selectedFrameIdx.size} of {extractedFrames.length} selected)
              </p>
              <button
                type="button"
                onClick={() => {
                  if (selectedFrameIdx.size === extractedFrames.length) setSelectedFrameIdx(new Set());
                  else setSelectedFrameIdx(new Set(extractedFrames.map((_, i) => i)));
                }}
                className="text-xs font-semibold text-teal"
              >
                {selectedFrameIdx.size === extractedFrames.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uncheck blurry or duplicate frames before analysis.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {extractedFrames.map((f, i) => {
                const isSelected = selectedFrameIdx.has(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedFrameIdx((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      });
                    }}
                    className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-muted ${isSelected ? "border-teal" : "border-border opacity-60"}`}
                  >
                    <img
                      src={`data:image/jpeg;base64,${f.base64}`}
                      alt={`Frame at ${Math.round(f.time)}s`}
                      className="h-full w-full object-cover"
                    />
                    <span className={`absolute right-1 top-1 grid size-5 place-items-center rounded-full text-white shadow ring-2 ring-white ${isSelected ? "bg-teal" : "bg-black/40"}`}>
                      {isSelected ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <span className="absolute left-1 bottom-1 rounded bg-black/60 px-1 py-0.5 text-[10px] font-medium text-white">
                      {Math.round(f.time)}s
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setExtractedFrames([]);
                  setSelectedFrameIdx(new Set());
                  setPendingVideoBlob(null);
                }}
                className="flex-1 min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-muted-foreground"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={analyzeSelectedFrames}
                disabled={selectedFrameIdx.size === 0}
                className="flex-[2] min-h-11 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-50"
              >
                Analyse {selectedFrameIdx.size} selected {selectedFrameIdx.size === 1 ? "frame" : "frames"}
              </button>
            </div>
          </div>
        )}

        {videoProcessing && (
          <div className="mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-teal/5 px-4 py-4 text-sm font-medium text-teal">
            <Loader2 className="size-5 animate-spin" />
            <p>Extracting frames and analysing room</p>
            {videoProgress.total > 0 && (
              <p className="text-xs text-muted-foreground">
                Analysing frame {videoProgress.current} of {videoProgress.total}
              </p>
            )}
          </div>
        )}

        {speechSupported && (
          <button
            type="button"
            onClick={recording ? stopRecording : startRecording}
            disabled={!current}
            className={`mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold shadow-sm transition-colors disabled:opacity-60 ${
              recording
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-teal text-teal-foreground hover:bg-teal-dark"
            }`}
          >
            {recording ? <><Square className="size-5 fill-white" /> Stop recording</> : <><Mic className="size-5" /> Describe this room</>}
          </button>
        )}

        {recording && <Waveform />}

        {transcript && (
          <blockquote className="mt-4 rounded-r-lg border-l-4 border-teal bg-teal/5 px-4 py-3 text-sm italic text-foreground">
            "{transcript}"
          </blockquote>
        )}

        {(!speechSupported || !recording) && (
          <div className="mt-4 rounded-2xl border border-border bg-card p-4">
            {!speechSupported && (
              <p className="mb-2 text-xs text-muted-foreground">
                Speech recognition isn't supported on this device. Type your observations below and we'll parse them the same way.
              </p>
            )}
            {speechSupported && (
              <p className="mb-2 text-xs text-muted-foreground">
                Or type notes for this room (parsed the same as voice).
              </p>
            )}
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="e.g. Walls look good. Cracked window. Carpet has a small stain."
              rows={3}
              className="min-h-20 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!manualText.trim() || savingNotes || !current}
              onClick={async () => {
                const text = manualText.trim();
                if (!text) return;
                setSavingNotes(true);
                setTranscript(text);
                try {
                  await saveTranscript(text);
                  setManualText("");
                } finally {
                  setSavingNotes(false);
                }
              }}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground shadow-sm transition-colors hover:bg-teal-dark disabled:opacity-60"
            >
              {savingNotes ? <Loader2 className="size-4 animate-spin" /> : null}
              Parse notes
            </button>
          </div>
        )}

        {analyzing && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-border bg-teal/5 px-4 py-3 text-sm font-medium text-teal">
            <Loader2 className="size-4 animate-spin" /> Analysing photo…
          </div>
        )}
        {analyzeError && !analyzing && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="size-4" /> Photo analysis unavailable — continue with voice or manual entry.
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">
              {roomItems.length} {roomItems.length === 1 ? "item" : "items"} detected
            </h2>
            {roomItems.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {(Object.entries(countsByCondition) as [Condition, number][]).map(([c, n]) =>
                  n > 0 ? (
                    <span key={c} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${CONDITION_DOT[c]}`}>
                      {n} {c}
                    </span>
                  ) : null
                )}
              </div>
            )}
          </div>

          {roomItems.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Detected items will appear here after you capture a photo and voice note.
            </div>
          ) : (
            <ul className="space-y-2">
              {roomItems.map((it) => (
                <ItemCard key={it.id} item={it} onEdited={() => qc.invalidateQueries({ queryKey: ["inspection-items", id] })} />
              ))}
            </ul>
          )}

          {current && (
            <ManualAddItem
              roomId={current.id}
              inspectionId={id}
              userId={inspection?.user_id}
              nextSortOrder={roomItems.length * 10}
              onAdded={() => qc.invalidateQueries({ queryKey: ["inspection-items", id] })}
            />
          )}
        </section>
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3">
          <button type="button" onClick={goPrev} disabled={index === 0}
            className="flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-medium text-teal disabled:opacity-40">
            <ChevronLeft className="size-4" /> Previous
          </button>
          <span className="text-xs font-medium text-muted-foreground">
            {doneRoomIds.size} of {total} done
          </span>
          <button type="button" onClick={goNext} disabled={!rooms}
            className="flex min-h-11 items-center gap-1 rounded-xl bg-teal px-4 text-sm font-semibold text-teal-foreground disabled:opacity-40">
            {rooms && index >= rooms.length - 1 ? "Finish" : "Next"} <ChevronRight className="size-4" />
          </button>
        </div>
      </nav>
    </div>
  );
}

function PhotoThumb({ path }: { path: string }) {
  const url = useSignedUrl(path);
  return (
    <div className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
      {url && <img src={url} alt="Captured" className="h-full w-full object-cover" />}
      <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-condition-good text-white shadow ring-2 ring-white">
        <Check className="size-3.5" strokeWidth={3} />
      </span>
    </div>
  );
}

function Waveform() {
  return (
    <div className="mt-3 flex h-10 items-center justify-center gap-1">
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <span
          key={i}
          className="inline-block w-1.5 rounded-full bg-red-500"
          style={{
            animation: `wave 900ms ease-in-out ${i * 90}ms infinite`,
            height: "40%",
          }}
        />
      ))}
      <style>{`@keyframes wave { 0%,100% { height: 20%; } 50% { height: 100%; } }`}</style>
    </div>
  );
}

function ItemCard({ item, onEdited }: { item: ItemRow; onEdited: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.item_name);
  const [condition, setCondition] = useState<Condition>(item.condition);
  const [description, setDescription] = useState(item.description ?? "");

  async function save() {
    const { error } = await supabase.from("inspection_items")
      .update({ item_name: name, condition, description })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    setEditing(false);
    onEdited();
  }

  if (editing) {
    return (
      <li className="rounded-xl border border-border bg-card p-3 space-y-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <select value={condition} onChange={(e) => setCondition(e.target.value as Condition)}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm">
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
          <option value="damaged">Damaged</option>
        </select>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          className="w-full rounded-lg border border-border px-3 py-2 text-sm" />
        <div className="flex justify-end gap-2">
          <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground">Cancel</button>
          <button onClick={save} className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-teal-foreground">Save</button>
        </div>
      </li>
    );
  }

  const sources = item.sources ?? [];
  const hasPhoto = sources.includes("photo");
  const hasVoice = sources.includes("voice");
  const hasVideo = sources.includes("video");
  const lowConfidence =
    (hasPhoto || hasVideo) && typeof item.confidence === "number" && item.confidence < 0.7;

  return (
    <li className={`flex items-start gap-3 rounded-xl border bg-card p-3 ${lowConfidence ? "border-amber-400 bg-amber-50/40" : "border-border"}`}>
      <span className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-full ${CONDITION_DOT[item.condition]}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{item.item_name}</p>
            {hasPhoto && <Camera className="size-3.5 shrink-0 text-teal" aria-label="From photo analysis" />}
            {hasVideo && <Video className="size-3.5 shrink-0 text-teal" aria-label="From video walkthrough" />}
            {hasVoice && <Mic className="size-3.5 shrink-0 text-teal" aria-label="From voice" />}
          </div>
          <ConditionBadge condition={item.condition} />
        </div>
        {item.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.description}</p>
        )}
        {lowConfidence && (
          <p className="mt-1 text-[11px] font-medium text-amber-700">Low confidence — please review</p>
        )}
      </div>
      <button onClick={() => setEditing(true)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted">
        <Pencil className="size-4" />
      </button>
    </li>
  );
}

function ManualAddItem({
  roomId, inspectionId, userId, nextSortOrder, onAdded,
}: {
  roomId: string;
  inspectionId: string;
  userId: string | undefined;
  nextSortOrder: number;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<Condition>("good");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim() || !userId) return;
    setSaving(true);
    const { error } = await supabase.from("inspection_items").insert({
      user_id: userId,
      inspection_id: inspectionId,
      room_id: roomId,
      item_name: name.trim(),
      condition,
      description: description.trim() || null,
      sort_order: nextSortOrder,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setCondition("good"); setDescription("");
    setOpen(false);
    onAdded();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-teal/40 bg-teal/5 px-4 text-sm font-semibold text-teal"
      >
        <Plus className="size-4" /> Manually add item
      </button>
    );
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-3">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Item name (e.g. Curtains)"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <select
        value={condition}
        onChange={(e) => setCondition(e.target.value as Condition)}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      >
        <option value="good">Good</option>
        <option value="fair">Fair</option>
        <option value="poor">Poor</option>
        <option value="damaged">Damaged</option>
      </select>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={() => { setOpen(false); setName(""); setDescription(""); }}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!name.trim() || saving}
          className="rounded-lg bg-teal px-3 py-1.5 text-sm font-semibold text-teal-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add item"}
        </button>
      </div>
    </div>
  );
}