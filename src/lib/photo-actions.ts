import type { Plan } from "@/lib/use-plan";

/**
 * Single canonical set of rules for the Enhance / Clean up / Stage actions,
 * shared by PhotoStagingTile and StagedCard (listing.$id.review.tsx) and
 * StagedPhotoCard (listing.$id.capture.tsx) — the three cards deliberately
 * keep their own layouts, but must not diverge on what's available, what
 * it's labelled, or what "blocked" looks like. See the investigation this
 * was built from: all three actions are always rendered (never hidden,
 * never silently disabled) on every photo state; only labels change.
 */
export interface PhotoActionFields {
  staged_url?: string | null;
  staging_style?: string | null;
  decluttered_url?: string | null;
  enhanced_url?: string | null;
}

export function enhanceLabel(photo: PhotoActionFields): string {
  return photo.enhanced_url ? "Re-enhance" : "Enhance";
}

export function stageLabel(photo: PhotoActionFields): string {
  return photo.staged_url ? "Try another style" : "Stage this room";
}

/** Clean up's label never changes with state — always just "Clean up". */
export const CLEAN_UP_LABEL = "Clean up";

/**
 * Stage auto-chains a declutter pass first when the photo hasn't been
 * decluttered yet (see stageListingPhoto), so it costs 2 shared credits
 * instead of 1 in that case.
 */
export function stageCreditsNeeded(photo: PhotoActionFields): 1 | 2 {
  return photo.decluttered_url ? 1 : 2;
}

export type ActionGate = { ok: true } | { ok: false; reason: "free_plan" | "no_credits" };

/**
 * Gates Clean up / Stage against the shared staging_usage credit pool.
 * Enhance has its own separate, self-contained gate inside EnhancePhotoModal
 * (its own plan/usage query) and isn't checked here — see the design note
 * in the Fix 1 report for why the two aren't unified.
 */
export function gateCreditAction(plan: Plan, stagingRemaining: number, needed: number): ActionGate {
  if (plan === "free") return { ok: false, reason: "free_plan" };
  if (stagingRemaining < needed) return { ok: false, reason: "no_credits" };
  return { ok: true };
}

/** User-facing copy for a blocked gate, for the UpgradeModal description. */
export function gateDescription(reason: "free_plan" | "no_credits"): string {
  return reason === "free_plan"
    ? "Virtual staging and Clean up are available from the Professional plan and up."
    : "You're out of staging/clean-up credits for this month.";
}
