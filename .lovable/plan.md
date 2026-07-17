
## Goal
Add live per-room comparison against the most recent prior completed inspection during Routine/Exit capture, powered by an AI vision Edge Function, with accepted changes surfaced in Review and the PDF report.

## 1. Database migration
Extend `comparison_results` (currently keyed to a single row per detected item) to support photo-pair comparisons:
- Add columns: `current_photo_id uuid null`, `previous_photo_id uuid null`, `changes_detected jsonb null`, `previous_inspection_id uuid null`.
- Keep existing per-item comparison rows working (all new cols nullable).
- Add index on `(inspection_id, room_id)`.
- RLS already scoped by `user_id`; no policy changes needed.

## 2. Edge Function: `compare-inspection-photos`
New file `supabase/functions/compare-inspection-photos/index.ts`:
- Require JWT via shared `requireUser` helper.
- Input: `{ currentPhotoUrl, previousPhotoUrl, roomName }` (signed URLs from client).
- Call OpenAI `gpt-4o` chat/completions with both images and a comparison prompt asking for JSON array `[{item, description, severity: "none|minor|moderate|significant"}]`.
- Return `{ changes: [...] }`. Handle non-JSON responses gracefully.
- CORS headers, error passthrough.
- Config in `supabase/config.toml` if needed (existing analyze-photo pattern).

## 3. Capture screen (`inspection.$id.capture.tsx`)
- On mount, if inspection type is `routine` or `exit`, query most recent prior inspection for the property (`status in ('completed','signed')`, ordered by `completed_at` desc, else `created_at`). Store id + date + type.
- Render banner at top: "Comparing against {Entry|Routine|Exit} inspection from DD/MM/YYYY" when previous exists.
- Add "Previous inspection" panel per room: previous photo (first `inspection_photos` for that room from prior inspection, signed URL) + list of prior `inspection_items` (name + ConditionBadge).
- If no prior data for room: show "No previous inspection data for this room".
- After a new photo is captured (existing upload flow), auto-invoke `compare-inspection-photos` with signed URLs for current + prior photo. Show detected changes as cards under the photo area with color-coded severity badges (green/amber/orange/red) and Accept / Dismiss buttons.
- On Accept: insert row into `comparison_results` with `current_photo_id`, `previous_photo_id`, `previous_inspection_id`, `changes_detected` (single change object), `severity`, `change_type='deterioration'` (default), `status='confirmed'`, `item_name`, `description`. On Dismiss: local state only.

## 4. Review screen (`inspection.$id.review.tsx`)
- For each room accordion, add "Changes from previous inspection" subsection listing accepted comparison rows (where `changes_detected is not null` and `status='confirmed'`), with severity badge + description.

## 5. PDF report (`report-pdf.ts`)
- Per room, after the items table, add "Changes Noted" subsection listing accepted photo-pair changes with severity color chip and description.

## 6. Types
Rerun after migration to refresh `types.ts`.

## Out of scope
- Not changing the existing item-level auto-detection on `inspection.$id.compare.tsx` (that flow stays).
- No new tables.
