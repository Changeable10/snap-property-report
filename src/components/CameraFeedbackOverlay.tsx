import { useEffect, useRef, useState } from "react";
import { startFeedbackLoop, startMotionListener } from "@/lib/camera-quality";

interface Props {
  /** ref to the live <video> element playing the getUserMedia stream. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** True while recording video — enables the "slow down" bar when motion is high. */
  recording?: boolean;
  /** Blur variance cutoff. Below this → "blurry". Default 100. */
  blurThreshold?: number;
  /** Motion magnitude threshold (m/s²) for "hold steady". Default 3.0. */
  stillMotionThreshold?: number;
  /** Motion magnitude threshold (m/s²) for video "slow down". Default 4.0. */
  videoMotionThreshold?: number;
}

/**
 * Semi-transparent live quality badges over the camera viewfinder. Never
 * blocks the capture button (pointer-events: none). Degrades gracefully:
 * no motion sensor → no motion badge.
 */
export function CameraFeedbackOverlay({
  videoRef,
  recording = false,
  blurThreshold = 100,
  stillMotionThreshold = 2.0,
  videoMotionThreshold = 1.6,
}: Props) {
  const [blurry, setBlurry] = useState(false);
  const [tooDark, setTooDark] = useState(false);
  const [tooBright, setTooBright] = useState(false);
  const [shaky, setShaky] = useState(false);
  const [slowDown, setSlowDown] = useState(false);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  // Timestamps of last positive detection — used to auto-clear within ~1s.
  const lastBlurRef = useRef(0);
  const lastDarkRef = useRef(0);
  const lastBrightRef = useRef(0);
  const lastShakeRef = useRef(0);
  const lastSlowRef = useRef(0);
  // Frame-diff based motion tracker. Held stable when < 5% pixel change for STABLE_MS.
  const lastMotionActiveRef = useRef(0);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const CLEAR_MS = 900;
    const STABLE_MS = 1000; // 1s of low pixel diff before we clear the shake badge
    const now = () => performance.now();
    const sweep = window.setInterval(() => {
      const t = now();
      if (t - lastBlurRef.current > CLEAR_MS) setBlurry(false);
      if (t - lastDarkRef.current > CLEAR_MS) setTooDark(false);
      if (t - lastBrightRef.current > CLEAR_MS) setTooBright(false);
      // Only clear shake when we've also seen a full second of low motion via frame diff.
      if (
        t - lastShakeRef.current > CLEAR_MS &&
        t - lastMotionActiveRef.current > STABLE_MS
      ) {
        setShaky(false);
      }
      if (t - lastSlowRef.current > CLEAR_MS) setSlowDown(false);
    }, 300);
    const stopLoop = startFeedbackLoop({
      video: el,
      intervalMs: 400,
      onUpdate: ({ blurVariance, luminance, motionFraction }) => {
        const t = now();
        if (blurVariance > 0 && blurVariance < blurThreshold) {
          lastBlurRef.current = t;
          setBlurry(true);
        }
        if (luminance < 40) { lastDarkRef.current = t; setTooDark(true); }
        if (luminance > 220) { lastBrightRef.current = t; setTooBright(true); }
        if (!Number.isNaN(motionFraction)) {
          // >15% pixels changed → shaky. 5–15% keeps the "still active" timer
          // ticking so the badge doesn't clear mid-movement. <5% → stable.
          if (motionFraction > 0.15) {
            lastShakeRef.current = t;
            lastMotionActiveRef.current = t;
            setShaky(true);
          } else if (motionFraction >= 0.05) {
            lastMotionActiveRef.current = t;
          }
          if (recordingRef.current && motionFraction > 0.25) {
            lastSlowRef.current = t;
            setSlowDown(true);
          }
        }
      },
    });
    const stopMotion = startMotionListener({
      onUpdate: (mag) => {
        const t = now();
        if (mag > stillMotionThreshold) {
          lastShakeRef.current = t;
          lastMotionActiveRef.current = t;
          setShaky(true);
        }
        if (recordingRef.current && mag > videoMotionThreshold) {
          lastSlowRef.current = t;
          setSlowDown(true);
        }
      },
    });
    return () => {
      window.clearInterval(sweep);
      stopLoop();
      stopMotion();
    };
  }, [videoRef, blurThreshold, stillMotionThreshold, videoMotionThreshold]);

  const badges: { key: string; label: string; visible: boolean; amber?: boolean }[] = [
    { key: "blur", label: "📷 Image appears blurry — hold steady", visible: blurry },
    { key: "dark", label: "🔅 Too dark — try adding more light", visible: tooDark && !tooBright },
    { key: "bright", label: "🔆 Too bright — reduce exposure", visible: tooBright && !tooDark },
    { key: "shake", label: "✋ Hold steady", visible: shaky },
  ];

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-1.5 px-3 pt-3">
      {slowDown ? (
        <div className="w-full rounded-lg bg-amber-500/90 px-3 py-2 text-center text-xs font-semibold text-white shadow transition-opacity duration-200">
          Slow down for better photos
        </div>
      ) : null}
      {badges.map((b) => (
        <div
          key={b.key}
          className={
            "rounded-full bg-amber-500/90 px-3 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur transition-opacity duration-200 " +
            (b.visible ? "opacity-100" : "opacity-0")
          }
          aria-live={b.visible ? "polite" : "off"}
        >
          {b.label}
        </div>
      ))}
    </div>
  );
}