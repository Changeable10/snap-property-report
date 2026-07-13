export interface EnhanceRecs {
  brightness: number; // -100..100
  contrast: number;
  saturation: number;
  warmth: number;
  sharpness?: "low" | "acceptable" | "good";
  issues?: string[];
  suggestion?: string;
}

// Build a CSS filter string from -100..+100 adjustment recommendations.
// brightness/contrast/saturation: 0 -> 1.0, +100 -> 2.0, -100 -> 0.0
// warmth positive -> sepia() to warm the image; negative -> hue-rotate toward blue.
export function toFilterString(r: EnhanceRecs): string {
  const scale = (v: number) => Math.max(0, 1 + (v || 0) / 100);
  const parts: string[] = [];
  parts.push(`brightness(${scale(r.brightness).toFixed(3)})`);
  parts.push(`contrast(${scale(r.contrast).toFixed(3)})`);
  parts.push(`saturate(${scale(r.saturation).toFixed(3)})`);
  const w = r.warmth || 0;
  if (w > 0) {
    // sepia adds warm orange cast; cap at ~40% for +100
    parts.push(`sepia(${Math.min(0.4, (w / 100) * 0.4).toFixed(3)})`);
  } else if (w < 0) {
    // shift hue slightly toward blue for a cooler feel
    const deg = Math.min(20, Math.abs(w) / 5); // up to 20deg
    parts.push(`hue-rotate(-${deg.toFixed(1)}deg)`);
  }
  return parts.join(" ");
}

// Load an image (with CORS) into a decoded HTMLImageElement.
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

// Render the given image with a CSS filter onto a canvas and return a JPEG blob.
export async function renderEnhancedBlob(
  url: string,
  recs: EnhanceRecs,
  quality = 0.92,
): Promise<Blob> {
  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  // canvas filter is well supported in Chromium/Safari 18+/Firefox.
  (ctx as any).filter = toFilterString(recs);
  ctx.drawImage(img, 0, 0);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
      "image/jpeg",
      quality,
    );
  });
}