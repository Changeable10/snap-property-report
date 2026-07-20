// Camera/image quality helpers — pure pixel math, no external libraries.
// Used by the live viewfinder feedback overlay and smart video frame selection.

export interface FrameStats {
  blurVariance: number; // Laplacian variance (higher = sharper)
  luminance: number;    // mean grayscale 0..255
}

/**
 * 3x3 Laplacian variance on grayscale. Downsamples via the passed ImageData
 * (caller controls resolution — 320px wide is a good perf/quality trade-off).
 */
export function laplacianVariance(img: ImageData): number {
  const { width: w, height: h, data } = img;
  if (w < 3 || h < 3) return 0;
  // Grayscale buffer.
  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec.709 luma
    gray[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  // Apply 3x3 Laplacian [0 1 0 / 1 -4 1 / 0 1 0]; compute mean + variance in one pass.
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const v =
        gray[idx - w] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx + w] -
        4 * gray[idx];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function averageLuminance(img: ImageData): number {
  const { data } = img;
  let s = 0, n = 0;
  // Sample every 4th pixel for speed.
  for (let i = 0; i < data.length; i += 16) {
    s += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    n++;
  }
  return n === 0 ? 0 : s / n;
}

/** Draw the current video frame onto a shared canvas at `targetWidth` and return ImageData. */
export function sampleVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  targetWidth = 320,
): ImageData | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const w = Math.min(targetWidth, vw);
  const h = Math.round((vh / vw) * w);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
}

export interface FeedbackLoopOptions {
  video: HTMLVideoElement;
  onUpdate: (stats: FrameStats) => void;
  intervalMs?: number;
  sampleWidth?: number;
}

/** Starts a setInterval loop that samples the video and reports blur/luminance. Returns stop(). */
export function startFeedbackLoop(opts: FeedbackLoopOptions): () => void {
  const canvas = document.createElement("canvas");
  const tick = () => {
    const img = sampleVideoFrame(opts.video, canvas, opts.sampleWidth ?? 320);
    if (!img) return;
    opts.onUpdate({
      blurVariance: laplacianVariance(img),
      luminance: averageLuminance(img),
    });
  };
  const timer = window.setInterval(tick, opts.intervalMs ?? 500);
  // Kick off immediately after a short delay for the first frame.
  window.setTimeout(tick, 250);
  return () => window.clearInterval(timer);
}

export interface MotionListenerOptions {
  onUpdate: (delta: number) => void;
  windowSize?: number;
}

/**
 * Listens to devicemotion, maintains a rolling average, and reports the
 * per-tick acceleration magnitude delta. Returns stop(). Degrades to no-op
 * when unsupported or permission denied.
 */
export function startMotionListener(opts: MotionListenerOptions): () => void {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
    return () => {};
  }
  let cancelled = false;
  const readings: number[] = [];
  const size = opts.windowSize ?? 5;
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
    readings.push(mag);
    if (readings.length > size) readings.shift();
    if (readings.length < 2) return;
    const avg = readings.reduce((s, v) => s + v, 0) / readings.length;
    opts.onUpdate(Math.abs(mag - avg));
  };
  const attach = () => {
    if (cancelled) return;
    window.addEventListener("devicemotion", handler);
  };
  const reqPerm = (DeviceMotionEvent as any).requestPermission as
    | (() => Promise<"granted" | "denied">)
    | undefined;
  if (typeof reqPerm === "function") {
    // iOS 13+
    reqPerm()
      .then((state) => {
        if (state === "granted") attach();
      })
      .catch(() => {});
  } else {
    attach();
  }
  return () => {
    cancelled = true;
    window.removeEventListener("devicemotion", handler);
  };
}

/**
 * Take a still photo at the highest available resolution.
 * Tries the ImageCapture API first; falls back to a canvas draw of the video.
 */
export async function captureHighRes(
  stream: MediaStream,
  videoEl: HTMLVideoElement,
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  const IC: any = (globalThis as any).ImageCapture;
  if (track && typeof IC !== "undefined") {
    try {
      const imageCapture = new IC(track);
      const blob: Blob = await imageCapture.takePhoto();
      if (blob && blob.size > 0) return blob;
    } catch {
      // fall through to canvas fallback
    }
  }
  const w = videoEl.videoWidth || 1920;
  const h = videoEl.videoHeight || 1080;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  ctx.drawImage(videoEl, 0, 0, w, h);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      0.92,
    );
  });
}

export const HIGH_RES_VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 4096 },
  height: { ideal: 3072 },
  facingMode: { ideal: "environment" },
};

export interface ScoredFrame {
  base64: string;   // JPEG data URL "data:image/jpeg;base64,..."
  time: number;     // seconds
  variance: number; // sharpness score
}

export interface ScoreVideoOptions {
  intervalSec?: number;   // candidate sampling interval (0.5s default)
  topN?: number;          // keep top-N sharpest (default 8)
  minVariance?: number;   // minimum sharpness threshold (default 80)
  width?: number;         // output frame width (default 1280)
  quality?: number;       // JPEG quality (default 0.85)
  fallbackDuration?: number; // fallback when v.duration is Infinity
}

/**
 * Extract candidate frames at intervalSec, rank by Laplacian variance,
 * keep top-N above minVariance. Returns ordered by time ascending.
 */
export async function scoreVideoFrames(
  blob: Blob,
  opts: ScoreVideoOptions = {},
): Promise<ScoredFrame[]> {
  const intervalSec = opts.intervalSec ?? 0.5;
  const topN = opts.topN ?? 8;
  const minVariance = opts.minVariance ?? 80;
  const outW = opts.width ?? 1280;
  const quality = opts.quality ?? 0.85;

  const url = URL.createObjectURL(blob);
  const v = document.createElement("video");
  v.preload = "auto";
  v.muted = true;
  (v as any).playsInline = true;
  v.src = url;

  try {
    await new Promise<void>((res, rej) => {
      v.onloadedmetadata = () => res();
      v.onerror = () => rej(new Error("video load failed"));
    });
    // Force duration resolution for MediaRecorder webm (some browsers report Infinity)
    if (!isFinite(v.duration) || v.duration === 0) {
      await new Promise<void>((res) => {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          res();
        };
        v.addEventListener("seeked", onSeeked);
        try {
          v.currentTime = 1e9;
        } catch {
          res();
        }
      });
    }
    const duration = isFinite(v.duration) && v.duration > 0
      ? v.duration
      : (opts.fallbackDuration ?? 10);

    const vw = v.videoWidth || 1280;
    const vh = v.videoHeight || 720;
    const w = Math.min(outW, vw);
    const h = Math.round((vh / vw) * w);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("canvas unavailable");

    // Downscale canvas for the variance check (perf).
    const scoreCanvas = document.createElement("canvas");
    const scoreW = 320;
    const scoreH = Math.round((vh / vw) * scoreW);
    scoreCanvas.width = scoreW;
    scoreCanvas.height = scoreH;
    const scoreCtx = scoreCanvas.getContext("2d", { willReadFrequently: true });
    if (!scoreCtx) throw new Error("score canvas unavailable");

    const times: number[] = [];
    for (let t = 0.2; t < duration; t += intervalSec) times.push(t);
    if (times.length === 0) times.push(0);

    const scored: ScoredFrame[] = [];
    for (const t of times) {
      await new Promise<void>((res) => {
        const onSeeked = () => {
          v.removeEventListener("seeked", onSeeked);
          res();
        };
        v.addEventListener("seeked", onSeeked);
        try {
          v.currentTime = Math.min(t, Math.max(0, duration - 0.05));
        } catch {
          res();
        }
      });
      scoreCtx.drawImage(v, 0, 0, scoreW, scoreH);
      const variance = laplacianVariance(scoreCtx.getImageData(0, 0, scoreW, scoreH));
      if (variance < minVariance) continue;
      ctx.drawImage(v, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
      scored.push({ base64, time: t, variance });
    }
    // Rank by variance, keep top N, then re-sort by time.
    scored.sort((a, b) => b.variance - a.variance);
    const top = scored.slice(0, topN);
    top.sort((a, b) => a.time - b.time);
    return top;
  } finally {
    URL.revokeObjectURL(url);
  }
}