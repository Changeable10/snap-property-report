// Per-room_type prompt + design_creativity overrides for Decor8's
// generate_designs_for_room, used by stage-listing-photo. Only populated for
// room types where Decor8's default behaviour has been observed to go
// wrong (see the kitchen-staged-as-a-lounge investigation) — kitchen,
// bathroom, and laundryroom all have expensive, structurally fixed elements
// (cabinets, appliances, plumbing fixtures) that the model has been
// replacing wholesale instead of styling around, most likely because our
// default-parameter calls land in Decor8's "empty room" behaviour mode
// rather than its "already furnished" one.
//
// Deliberately NOT populated for bedroom/living/dining/family/openplan —
// those are Decor8's demonstrated core competency (their own gallery
// examples are exclusively living rooms and bedrooms); adding prompts there
// risks degrading a working state for no observed gain. Add more room types
// here only in response to a confirmed bad result, not speculatively.
//
// Trivial to add/remove/tune: just edit these two objects. Keyed by the
// same lowercased room_type string stage-listing-photo/index.ts already
// resolves into `rt` — no shared type needed across the Deno/Node boundary.
export const STAGING_PROMPTS: Record<string, string> = {
  kitchen:
    "Kitchen. Keep all existing cabinets, appliances, countertops, sink, " +
    "dishwasher, and range/oven. Add only kitchen-appropriate styling: bar " +
    "stools, a small breakfast table, counter accessories, pendant " +
    "lighting, a rug, plants. Do not add sofas, coffee tables, beds, or " +
    "living room furniture.",
  bathroom:
    "Bathroom. Keep all existing fixtures — vanity, sink, toilet, bathtub, " +
    "shower, tiling. Add only bathroom-appropriate styling: fresh towels, " +
    "a bath mat, small plants, tasteful wall art, minimal counter " +
    "accessories. Do not add sofas, beds, dining furniture, or living room " +
    "furniture.",
  laundryroom:
    "Laundry room. Keep all existing appliances — washer, dryer, " +
    "cabinetry, sink, benchtop. Add only laundry-appropriate styling: " +
    "baskets, neatly folded linens, small plants, wall storage " +
    "accessories. Do not add sofas, beds, or living/dining furniture.",
};

// Default is 0.39 (Decor8's default). Lower here is a starting hypothesis —
// inferred from adjacent parameter naming/conventions, not confirmed by
// Decor8's docs — meant to bias generation closer to the source photo for
// room types that must preserve fixed structure. Tune against real results.
export const STAGING_CREATIVITY: Record<string, number> = {
  kitchen: 0.2,
  bathroom: 0.2,
  laundryroom: 0.2,
};
