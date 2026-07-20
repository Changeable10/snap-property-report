// Client-side image enhancement pipeline — pure Canvas API, no dependencies.
// Runs on the main thread; enhancements complete in well under 1 second on
// typical property photos.

export interface AdjustmentValues {
  brightness?: number; // 0.5..1.5, 1.0 = no change
  contrast?: number;   // 0.5..1.5, 1.0 = no change
  warmth?: number;     // -1..1, 0 = neutral (positive = warmer, negative = cooler)
  sharpness?: number;  // 0..1, 0 = no sharpen
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Note: caller renders synchronously so URL revocation happens after image is drawn.
    // We revoke a moment later via requestAnimationFrame to avoid Safari edge cases.
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d unavailable");
  return { canvas, ctx };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}

// Compute histogram-based brightness/contrast stretch.
// Returns multiplicative factors suitable for ctx.filter.
function computeHistogramStretch(imgData: ImageData): { brightness: number; contrast: number } {
  const d = imgData.data;
  // Cumulative distribution, then take 1% and 99% percentiles.
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < d.length; i += 16) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    hist[Math.max(0, Math.min(255, Math.round(y)))]++;
    total++;
  }
  let acc = 0;
  let lo = 0, hi = 255;
  const loT = total * 0.01;
  const hiT = total * 0.99;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= loT) { lo = i; break; }
  }
  acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= hiT) { hi = i; break; }
  }
  const range = Math.max(1, hi - lo);
  // Map so that lo->0, hi->255 (approximate via brightness/contrast).
  const contrast = Math.min(1.2, Math.max(1.0, 255 / range * 0.85));
  const mid = (lo + hi) / 2;
  // Brightness: bias so darker photos get lifted more.
  const brightness = mid < 110 ? Math.min(1.2, 1 + (110 - mid) / 250) : 1.05;
  return { brightness, contrast };
}

// Gray-world white balance: scale each channel so the frame's average
// R, G, B become equal.
function applyGrayWorld(imgData: ImageData): void {
  const d = imgData.data;
  let sr = 0, sg = 0, sb = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) {
    sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
  }
  if (n === 0) return;
  const ar = sr / n, ag = sg / n, ab = sb / n;
  const gray = (ar + ag + ab) / 3;
  // Clamp scaling factors to avoid over-correction on already-neutral photos.
  const clamp = (v: number) => Math.max(0.85, Math.min(1.15, v));
  const kr = clamp(gray / Math.max(1, ar));
  const kg = clamp(gray / Math.max(1, ag));
  const kb = clamp(gray / Math.max(1, ab));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, d[i] * kr);
    d[i + 1] = Math.min(255, d[i + 1] * kg);
    d[i + 2] = Math.min(255, d[i + 2] * kb);
  }
}

// Unsharp mask: blur, subtract, add scaled difference. Amount 0..1.
function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  amount = 0.4,
): void {
  if (amount <= 0) return;
  // Grab original once.
  const original = ctx.getImageData(0, 0, w, h);
  // Draw blurred copy via CSS filter blur.
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = w;
  blurCanvas.height = h;
  const bctx = blurCanvas.getContext("2d");
  if (!bctx) return;
  (bctx as any).filter = "blur(1.5px)";
  bctx.drawImage(ctx.canvas, 0, 0);
  const blurred = bctx.getImageData(0, 0, w, h);
  const out = original.data;
  const blr = blurred.data;
  for (let i = 0; i < out.length; i += 4) {
    out[i] = clamp255(out[i] + amount * (out[i] - blr[i]));
    out[i + 1] = clamp255(out[i + 1] + amount * (out[i + 1] - blr[i + 1]));
    out[i + 2] = clamp255(out[i + 2] + amount * (out[i + 2] - blr[i + 2]));
  }
  ctx.putImageData(original, 0, 0);
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Apply a warmth shift by biasing R up / B down (or vice versa).
// value: -1 (cool) .. +1 (warm).
function applyWarmth(imgData: ImageData, value: number): void {
  if (Math.abs(value) < 0.01) return;
  const d = imgData.data;
  const rShift = value * 20;   // up to ±20 on red
  const bShift = -value * 20;  // up to ∓20 on blue
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp255(d[i] + rShift);
    d[i + 2] = clamp255(d[i + 2] + bShift);
  }
}

/**
 * Auto-enhance a photo: histogram-stretch brightness/contrast, gray-world
 * white balance, unsharp mask, +10% saturation. Returns enhanced Blob.
 */
export async function autoEnhance(blob: Blob): Promise<Blob> {
  const img = await blobToImage(blob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { canvas, ctx } = makeCanvas(w, h);

  // Downsample for histogram sampling only.
  const sampleCanvas = document.createElement("canvas");
  sampleCanvas.width = 200;
  sampleCanvas.height = Math.max(1, Math.round((h / w) * 200));
  const sctx = sampleCanvas.getContext("2d");
  if (!sctx) throw new Error("canvas unavailable");
  sctx.drawImage(img, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const sample = sctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);

  const { brightness, contrast } = computeHistogramStretch(sample);

  // Apply brightness/contrast/saturation via ctx.filter for perf.
  (ctx as any).filter =
    `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)}) saturate(1.1)`;
  ctx.drawImage(img, 0, 0);
  (ctx as any).filter = "none";

  // Gray-world white balance on pixel data.
  const pixels = ctx.getImageData(0, 0, w, h);
  applyGrayWorld(pixels);
  ctx.putImageData(pixels, 0, 0);

  // Unsharp mask.
  applyUnsharpMask(ctx, w, h, 0.4);

  return canvasToBlob(canvas, 0.92);
}

/** Manual adjust: full pipeline slider values. Used by the Adjust modal. */
export async function manualAdjust(
  blob: Blob,
  a: AdjustmentValues,
): Promise<Blob> {
  const img = await blobToImage(blob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { canvas, ctx } = makeCanvas(w, h);
  const brightness = a.brightness ?? 1;
  const contrast = a.contrast ?? 1;
  (ctx as any).filter =
    `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
  ctx.drawImage(img, 0, 0);
  (ctx as any).filter = "none";

  if (a.warmth) {
    const pixels = ctx.getImageData(0, 0, w, h);
    applyWarmth(pixels, a.warmth);
    ctx.putImageData(pixels, 0, 0);
  }

  if (a.sharpness && a.sharpness > 0) {
    applyUnsharpMask(ctx, w, h, Math.min(1, a.sharpness));
  }

  return canvasToBlob(canvas, 0.92);
}

/**
 * Limited pipeline for staged photos: brightness/contrast/warmth only.
 * No sharpening or white balance — purpose is to nudge staged colours.
 */
export async function colourAdjustStaged(
  blob: Blob,
  a: Pick<AdjustmentValues, "brightness" | "contrast" | "warmth">,
): Promise<Blob> {
  const img = await blobToImage(blob);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const { canvas, ctx } = makeCanvas(w, h);
  const brightness = a.brightness ?? 1;
  const contrast = a.contrast ?? 1;
  (ctx as any).filter =
    `brightness(${brightness.toFixed(3)}) contrast(${contrast.toFixed(3)})`;
  ctx.drawImage(img, 0, 0);
  (ctx as any).filter = "none";
  if (a.warmth) {
    const pixels = ctx.getImageData(0, 0, w, h);
    applyWarmth(pixels, a.warmth);
    ctx.putImageData(pixels, 0, 0);
  }
  return canvasToBlob(canvas, 0.92);
}