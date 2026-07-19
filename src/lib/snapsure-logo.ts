import logoAsset from "@/assets/snapsure-logo.png.asset.json";

let cached: { dataUrl: string; w: number; h: number } | null | undefined;

export async function loadSnapsureLogo(): Promise<{ dataUrl: string; w: number; h: number } | null> {
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(logoAsset.url);
    if (!res.ok) { cached = null; return null; }
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims = await new Promise<{ w: number; h: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 200, h: 60 });
      img.src = dataUrl;
    });
    cached = { dataUrl, w: dims.w, h: dims.h };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}