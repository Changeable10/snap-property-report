import { useEffect, useRef, useState } from "react";
import { startFeedbackLoop, startMotionListener } from "@/lib/camera-quality";

interface Props {
  /** ref to the live <video> element playing the getUserMedia stream. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** True while recording video — enables the "slow down" bar when motion is high. */
  recording?: boolean;
  /** Blur variance cutoff. Below this → "blurry". Default 100. */
  blurThreshold?: number;
  /** Motion delta threshold for still capture. Default 2.0. */
  stillMotionThreshold?: number;
  /** Motion delta threshold for video "slow down". Default 3.0. */
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
  videoMotionThreshold = 3.0,
}: Props) {
  const [blurry, setBlurry] = useState(false);
  const [tooDark, setTooDark] = useState(false);
  const [tooBright, setTooBright] = useState(false);
  const [shaky, setShaky] = useState(false);
  const [slowDown, setSlowDown] = useState(false);
  const recordingRef = useRef(recording);
  recordingRef.current = recording;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const stopLoop = startFeedbackLoop({
      video: el,
      intervalMs: 500,
      onUpdate: ({ blurVariance, luminance }) => {
        setBlurry(blurVariance > 0 && blurVariance < blurThreshold);
        setTooDark(luminance < 40);
        setTooBright(luminance > 220);
      },
    });
    const stopMotion = startMotionListener({
      onUpdate: (delta) => {
        setShaky(delta > stillMotionThreshold);
        if (recordingRef.current) {
          setSlowDown(delta > videoMotionThreshold);
        } else {
          setSlowDown(false);
        }
      },
    });
    return () => {
      stopLoop();
      stopMotion();
    };
  }, [videoRef, blurThreshold, stillMotionThreshold, videoMotionThreshold]);

  const badges: { key: string; label: string; visible: boolean; amber?: boolean }[] = [
    { key: "blur", label: "📷 Image is blurry — hold steady", visible: blurry },
    { key: "dark", label: "💡 Too dark — find more light", visible: tooDark && !tooBright },
    { key: "bright", label: "☀️ Too bright — reduce glare", visible: tooBright && !tooDark },
    { key: "shake", label: "✋ Hold steady", visible: shaky && !recording },
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
            "rounded-full bg-black/70 px-3 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur transition-opacity duration-200 " +
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