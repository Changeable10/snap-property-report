export type Condition = "good" | "fair" | "poor" | "damaged";

// Aliases (lowercased). Order matters: longer/more specific phrases first so
// "power points" wins over "points" and "range hood" wins over "hood".
interface AliasEntry { canonical: string; aliases: string[] }
const ALIAS_TABLE: AliasEntry[] = [
  { canonical: "Walls", aliases: ["wall area", "walls", "wall"] },
  { canonical: "Ceiling", aliases: ["ceiling"] },
  { canonical: "Floor / Carpet", aliases: ["floor / carpet", "flooring", "carpets", "carpet", "floor"] },
  { canonical: "Curtains / Blinds", aliases: ["curtains / blinds", "curtains", "curtain", "blinds", "blind"] },
  { canonical: "Windows", aliases: ["windows", "window"] },
  { canonical: "Door", aliases: ["doors", "door"] },
  { canonical: "Light fittings", aliases: ["light fittings", "light fitting", "lights", "light"] },
  { canonical: "Power points", aliases: ["power points", "power point", "sockets", "socket", "plugs", "plug"] },
  { canonical: "Wardrobe", aliases: ["wardrobe", "closet"] },
  { canonical: "Smoke alarm", aliases: ["smoke alarm", "smoke detector"] },
  { canonical: "Shower", aliases: ["shower head", "shower"] },
  { canonical: "Bath", aliases: ["bathtub", "bath"] },
  { canonical: "Toilet", aliases: ["toilet", "loo"] },
  { canonical: "Vanity / Basin", aliases: ["vanity / basin", "vanity", "basin"] },
  { canonical: "Mirror", aliases: ["mirror"] },
  { canonical: "Tapware", aliases: ["tapware", "taps", "tap"] },
  { canonical: "Towel rail", aliases: ["towel rail"] },
  { canonical: "Exhaust fan", aliases: ["exhaust fan", "extractor fan", "extractor", "exhaust"] },
  { canonical: "Benchtop", aliases: ["benchtop", "bench", "countertop", "counter"] },
  { canonical: "Sink", aliases: ["sink"] },
  { canonical: "Oven / Cooktop", aliases: ["oven / cooktop", "cooktop", "stovetop", "stove", "oven"] },
  { canonical: "Rangehood", aliases: ["range hood", "rangehood", "hood"] },
  { canonical: "Dishwasher", aliases: ["dishwasher"] },
  { canonical: "Cupboards", aliases: ["cupboards", "cupboard", "cabinets", "cabinet"] },
  { canonical: "Drawers", aliases: ["drawers", "drawer"] },
  { canonical: "Splashback", aliases: ["splashback"] },
  { canonical: "Heat pump / Heater", aliases: ["heat pump", "air con", "aircon", "air conditioning", "heater"] },
  { canonical: "Hot water cylinder", aliases: ["hot water cylinder", "hot water"] },
  { canonical: "Fencing", aliases: ["fencing", "fences", "fence"] },
  { canonical: "Letterbox", aliases: ["letterbox", "mailbox"] },
  { canonical: "Driveway", aliases: ["driveway"] },
  { canonical: "Deck / Patio", aliases: ["deck / patio", "decking", "patio", "deck"] },
  { canonical: "Garden / Lawn", aliases: ["garden", "lawn", "grass"] },
  { canonical: "Clothesline", aliases: ["clothesline", "washing line"] },
  { canonical: "Guttering", aliases: ["guttering", "gutters", "gutter"] },
  { canonical: "Garage door", aliases: ["garage door"] },
];

export const ITEM_NAMES = ALIAS_TABLE.map((e) => e.canonical);

const CONDITION_KEYWORDS: Record<Condition, string[]> = {
  good: ["good condition", "fine", "clean", "no issues", "good", "great"],
  fair: ["bit of wear", "minor", "small mark", "slight", "some wear"],
  poor: [
    "needs attention", "worn", "stained", "faded", "not great",
    "tatty", "peeling", "rusty", "poor",
  ],
  damaged: [
    "extensive repairs", "needs replacing", "needs replacement", "needs repair",
    "needs repairs", "not working", "damaged", "damage", "destroyed",
    "smashed", "cracked", "broken",
  ],
};

const GENERAL_CONDITION_PHRASES: Record<Condition, string[]> = {
  good: [
    "looks good", "look good", "everything is fine", "everything's fine",
    "all good", "no issues", "no problems", "room looks good",
    "good condition", "all fine", "everything looks good", "nothing to note",
    "no damage", "in good order",
  ],
  fair: ["generally fine", "mostly fine", "some wear throughout", "a bit worn overall"],
  poor: ["generally worn", "needs attention throughout", "poor throughout"],
  damaged: [],
};

export function detectGeneralCondition(transcript: string): Condition | null {
  const t = transcript.toLowerCase();
  if (!t.trim()) return null;
  for (const c of ["damaged", "poor", "fair", "good"] as Condition[]) {
    for (const phrase of GENERAL_CONDITION_PHRASES[c]) {
      if (t.includes(phrase)) return c;
    }
  }
  return null;
}

const STANDARD_ITEMS: Record<string, string[]> = {
  bedroom: ["Walls","Ceiling","Floor / Carpet","Curtains / Blinds","Windows","Light fittings","Power points","Door","Wardrobe","Smoke alarm"],
  bathroom: ["Walls","Ceiling","Floor","Shower","Toilet","Vanity / Basin","Mirror","Tapware","Towel rail","Exhaust fan","Door"],
  kitchen: ["Walls","Ceiling","Floor","Benchtop","Sink","Tapware","Oven / Cooktop","Rangehood","Cupboards","Splashback"],
  living: ["Walls","Ceiling","Floor / Carpet","Curtains / Blinds","Windows","Light fittings","Power points","Door"],
  dining: ["Walls","Ceiling","Floor / Carpet","Curtains / Blinds","Windows","Light fittings","Power points","Door"],
  laundry: ["Walls","Ceiling","Floor","Tub / Sink","Tapware","Power points","Door"],
  garage: ["Walls","Floor","Garage door","Light fitting","Power points"],
  outdoor: ["Fencing","Letterbox","Driveway","Garden / Lawn","Clothesline","Deck / Patio","External lighting","Guttering"],
  hallway: ["Walls","Ceiling","Floor","Light fitting","Smoke alarm","Door"],
};

export function getStandardItemsForRoom(roomName: string): string[] {
  const n = roomName.toLowerCase();
  if (n.includes("bedroom")) return STANDARD_ITEMS.bedroom;
  if (n.includes("bathroom") || n.includes("ensuite") || n.includes("toilet")) return STANDARD_ITEMS.bathroom;
  if (n.includes("kitchen")) return STANDARD_ITEMS.kitchen;
  if (n.includes("dining")) return STANDARD_ITEMS.dining;
  if (n.includes("living") || n.includes("lounge")) return STANDARD_ITEMS.living;
  if (n.includes("laundry")) return STANDARD_ITEMS.laundry;
  if (n.includes("garage")) return STANDARD_ITEMS.garage;
  if (n.includes("outdoor") || n.includes("balcony") || n.includes("deck") || n.includes("patio") || n.includes("garden") || n.includes("yard")) return STANDARD_ITEMS.outdoor;
  if (n.includes("hallway") || n.includes("entrance") || n.includes("entry")) return STANDARD_ITEMS.hallway;
  return STANDARD_ITEMS.living;
}

export interface ParsedItem {
  item_name: string;
  condition: Condition;
  description: string;
  maintenance_required?: boolean;
  maintenance_notes?: string | null;
}

function detectConditionIn(text: string): Condition | null {
  const t = text.toLowerCase();
  for (const c of ["damaged", "poor", "fair", "good"] as Condition[]) {
    for (const kw of CONDITION_KEYWORDS[c]) {
      if (t.includes(kw)) return c;
    }
  }
  return null;
}

function detectMaintenanceNote(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("extensive repairs")) return "Needs extensive repairs";
  if (t.includes("needs replacing") || t.includes("needs replacement")) return "Needs replacing";
  if (t.includes("needs repair") || t.includes("needs repairs")) return "Needs repair";
  if (t.includes("not working")) return "Not working";
  if (t.includes("destroyed")) return "Destroyed — needs replacing";
  if (t.includes("damaged") || t.includes("damage")) return "Damage noted";
  return null;
}

export function parseTranscript(transcript: string, roomName?: string): ParsedItem[] {
  const text = transcript.trim();
  if (!text) return [];
  const lower = text.toLowerCase();

  // Bathroom disambiguation: "sink" in a bathroom means Vanity / Basin
  const isBathroom = !!roomName && /bathroom|ensuite|toilet/i.test(roomName);
  const isKitchen = !!roomName && /kitchen/i.test(roomName);

  // Find all alias occurrences; keep the first (longest, since aliases are
  // sorted long→short per entry) match per canonical, but track every
  // canonical mention position in the transcript.
  interface Hit { canonical: string; index: number; matchLen: number }
  const hits: Hit[] = [];
  const claimed: Array<[number, number]> = []; // [start, end) already consumed by a longer alias
  const overlaps = (s: number, e: number) => claimed.some(([cs, ce]) => s < ce && e > cs);

  // Flatten aliases sorted by length desc so longer phrases win.
  const flat: { canonical: string; alias: string }[] = [];
  for (const entry of ALIAS_TABLE) for (const a of entry.aliases) flat.push({ canonical: entry.canonical, alias: a });
  flat.sort((a, b) => b.alias.length - a.alias.length);

  const seenCanonical = new Set<string>();
  for (const { canonical, alias } of flat) {
    let from = 0;
    while (from < lower.length) {
      const idx = lower.indexOf(alias, from);
      if (idx === -1) break;
      const end = idx + alias.length;
      // require token-ish boundary (start/end of string or non-letter)
      const prev = idx === 0 ? " " : lower[idx - 1];
      const next = end >= lower.length ? " " : lower[end];
      const isBoundary = /[^a-z]/.test(prev) && /[^a-z]/.test(next);
      if (isBoundary && !overlaps(idx, end)) {
        // Bathroom sink → Vanity / Basin
        let can = canonical;
        if (alias === "sink" && isBathroom) can = "Vanity / Basin";
        if (alias === "hood" && !isKitchen) { from = end; continue; }
        if (!seenCanonical.has(can)) {
          hits.push({ canonical: can, index: idx, matchLen: alias.length });
          seenCanonical.add(can);
        }
        claimed.push([idx, end]);
      }
      from = end;
    }
  }
  if (hits.length === 0) return [];
  hits.sort((a, b) => a.index - b.index);

  // Shared/global condition — scanned across the entire transcript so a
  // phrase like "damage to the taps, cupboards and wall area" applies the
  // "damage" keyword to every item, not just the first.
  const globalCondition = detectConditionIn(text);
  const globalMaintenanceNote = detectMaintenanceNote(text);

  const items: ParsedItem[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const segment = text.slice(start, end).trim();

    const segmentCondition = detectConditionIn(segment);
    const condition: Condition = segmentCondition ?? globalCondition ?? "good";

    const maintenance_required = condition === "damaged" || condition === "poor";
    const maintenance_notes = maintenance_required
      ? (detectMaintenanceNote(segment) ?? globalMaintenanceNote)
      : null;

    // Trim a trailing shared-context tail (e.g. "taps to the") so per-item
    // description isn't misleading. Prefer segment when it has its own
    // condition keyword; otherwise leave description empty and rely on
    // maintenance_notes.
    const description = segmentCondition ? segment : "";

    items.push({
      item_name: hits[i].canonical,
      condition,
      description,
      maintenance_required,
      maintenance_notes,
    });
  }
  return items;
}