
## Scope

Two features that touch inspection + listing capture, video frame extraction, photo review, and the `inspection_photos` / `listing_photos` tables.

## 1. Shared capture library (new)

`src/lib/camera-quality.ts` — pure pixel-math helpers, no dependencies:
- `laplacianVariance(imageData)` — grayscale + 3×3 Laplacian, returns variance.
- `averageLuminance(imageData)` — 0–255 mean brightness.
- `sampleFrame(video, canvas, width=320)` — draws current video frame to a shared offscreen canvas at 320 wide, returns `ImageData`.
- `startFeedbackLoop({ video, onUpdate, intervalMs=500 })` — returns `stop()`. Runs blur + brightness sampling.
- `startMotionListener({ threshold=2.0, onUpdate })` — handles iOS `DeviceMotionEvent.requestPermission()` if present, rolling avg of 5 accelerometer readings, returns `stop()`. Degrades to no-op when denied/unavailable.
- `captureHighRes(stream, videoEl)` — tries `ImageCapture.takePhoto()` when available, falls back to canvas draw of `videoEl` at its native `videoWidth/Height`. Returns `Blob`.
- `scoreVideoFrames(videoEl, { intervalSec=0.5, topN, minVariance=80 })` — seeks through recorded blob, extracts candidate frames, computes Laplacian variance, returns top-N sharpest with scores.

`src/lib/photo-enhance-canvas.ts` — client enhancement pipeline (Canvas API + optional OffscreenCanvas in Web Worker):
- `autoEnhance(blob)` → applies histogram-stretch brightness/contrast, gray-world white balance, unsharp mask, +10% saturation. Returns enhanced `Blob`.
- `manualAdjust(blob, { brightness, contrast, warmth, sharpness })` → for the Adjust modal.
- `colourAdjustStaged(blob, { brightness, contrast, warmth })` → limited pipeline for staged photos (no sharpen/white-balance).
- Runs in Worker via `OffscreenCanvas.transferToImageBitmap` when supported; main-thread fallback with spinner.

## 2. `CameraFeedbackOverlay` component

`src/components/CameraFeedbackOverlay.tsx` — reads `videoRef`, spins up the sample loop + motion listener, renders a stack of pill badges at top of viewfinder (below room name):
- 📷 blurry (variance < 100)
- 💡 too dark (lum < 40) / ☀️ too bright (lum > 220)
- ✋ hold steady (motion delta > 2.0)
- Semi-transparent dark bg, white text, 200ms fade. `pointer-events: none` so the capture button is never blocked.

Also used during video recording; adds an amber overlay bar "Slow down for better photos" when motion > 3.0.

## 3. Capture screen upgrades

`src/routes/_authenticated/inspection.$id.capture.tsx` and `listing.$id.capture.tsx`:
- Change `getUserMedia` constraints to `{ width: { ideal: 4096 }, height: { ideal: 3072 }, facingMode: { ideal: 'environment' } }`.
- Route the still-photo path through `captureHighRes()`.
- Mount `<CameraFeedbackOverlay videoRef={...} recording={isRecording} />` inside the viewfinder.
- Stop the loop on unmount / when the viewfinder closes.

## 4. Smart video frame selection

Replace the current fixed-interval extraction in listing + inspection video flows:
- After recording stops, run `scoreVideoFrames` to rank candidates.
- Auto-pre-select the top N sharpest (5–10, capped by plan/room settings) above min-variance threshold; discard the rest from the grid.
- Grid still renders those N as thumbnails with a small sharpness score badge; user can uncheck any.
- "Analyse selected frames" proceeds as today; unsaved-frames prompt on room nav remains.

## 5. Enhancement UI + workflow state

Add `photo_state` enum column and `adjustments` JSONB to both `inspection_photos` and `listing_photos`:

```text
photo_state: 'raw' | 'enhanced' | 'staged' | 'colour_adjusted'  (default 'raw')
adjustments: { brightness?, contrast?, warmth?, sharpness? }
```

Migration: add columns, backfill `raw` for existing rows, add index on `photo_state` where useful.

`src/components/PhotoActions.tsx` — new toolbar rendered on the review/detail photo card. Buttons shown by state:

| State           | Buttons                                                       |
|-----------------|---------------------------------------------------------------|
| raw             | ✨ Enhance (client), 🪄 AI Enhance (server, metered), 🛋 Stage |
| enhanced        | 🛋 Stage, 🎚 Adjust, ↩ Undo enhancement                       |
| staged          | 🎚 Colour Adjust (brightness/contrast/warmth only), ↩ Undo stage |
| colour_adjusted | ↩ Undo colour adjust                                          |

- Tap-and-hold on the photo shows the original; release shows enhanced. Implemented with `pointerdown/up` swapping `src` between `photo_url` and `enhanced_url`/`staged_url`.
- Enhance uploads the new blob to storage under the same `{userId}/...` prefix (`-enhanced.jpg`), updates `enhanced_url` + `photo_state = 'enhanced'`.
- Adjust modal has live-preview sliders; on Save, renders final blob → uploads → stores slider values in `adjustments`.
- Staged photos use `colourAdjustStaged` pipeline; writes to `staged_url` (overwrites current staged image, keeps raw untouched).
- Undo actions revert `photo_state` and clear the corresponding URL; original `photo_url` is never touched.

Enforcement:
- `AI Enhance` (existing `EnhancePhotoModal` / `enhance-photo` server fn) becomes visible only when `photo_state === 'raw'`.
- Staging button hidden when `photo_state === 'staged'` or `'colour_adjusted'`.
- Client-side `autoEnhance` blocked (with toast) if state is `staged` or `colour_adjusted`.

## 6. Server functions (thin)

`src/lib/photo-state.functions.ts`:
- `setPhotoEnhanced({ table, photoId, enhancedPath, adjustments })`
- `setPhotoStaged({ table, photoId, stagedPath, style })` — called by existing staging flow, now also flips `photo_state`.
- `setPhotoColourAdjusted({ table, photoId, stagedPath, adjustments })`
- `revertPhotoState({ table, photoId, to })`

All use `requireSupabaseAuth`, verify ownership via RLS-scoped select, then update.

## 7. Report + PDF impact

`report-pdf.ts` already prefers `enhanced_url`, then original. Extend the priority to `staged_url > enhanced_url > photo_url` when the row's `photo_state` is `staged`/`colour_adjusted`; otherwise keep current behaviour.

## Non-goals / preserved

- Existing `EnhancePhotoModal` (Gemini) stays; it becomes "AI Enhance" and is metered exactly as today.
- Existing staging edge function stays as-is; only the state column and downstream state transitions are new.
- No visual redesign of capture screen beyond the badges.
- Behaviour degrades gracefully: no ImageCapture → canvas; no DeviceMotion perm → skip motion badge; no OffscreenCanvas → main-thread enhance.

## Rollout order

1. Migration (state + adjustments columns).
2. Shared libraries (`camera-quality.ts`, `photo-enhance-canvas.ts`).
3. `CameraFeedbackOverlay` component.
4. Wire high-res constraints + overlay into inspection & listing capture.
5. Smart frame ranking in video path.
6. `PhotoActions` toolbar + state-aware buttons on review screens.
7. `photo-state.functions.ts` + hook into existing enhance/stage flows.
8. `report-pdf.ts` priority update.
