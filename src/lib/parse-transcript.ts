export type Condition = "good" | "fair" | "poor" | "damaged";

export const ITEM_NAMES = [
  "Walls","Ceiling","Floor","Carpet","Curtains","Blinds","Windows","Door",
  "Light fitting","Power points","Wardrobe","Smoke alarm","Shower","Bath",
  "Toilet","Vanity","Basin","Mirror","Tapware","Towel rail","Exhaust fan",
  "Benchtop","Sink","Oven","Cooktop","Rangehood","Dishwasher","Cupboards",
  "Drawers","Splashback","Heat pump","Heater","Fencing","Letterbox",
  "Driveway","Deck","Patio","Clothesline","Guttering","Garage door",
];

const CONDITION_KEYWORDS: Record<Condition, string[]> = {
  good: ["good condition", "fine", "clean", "no issues", "good", "great"],
  fair: ["bit of wear", "minor", "small mark", "slight", "some wear"],
  poor: ["needs attention", "worn", "stained", "not great", "poor"],
  damaged: ["broken", "cracked", "damaged", "not working", "smashed"],
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
}

export function parseTranscript(transcript: string): ParsedItem[] {
  const text = transcript.trim();
  if (!text) return [];
  const lower = text.toLowerCase();

  // Find item name occurrences (case-insensitive, partial/substring match)
  const hits: { name: string; index: number }[] = [];
  for (const name of ITEM_NAMES) {
    const needle = name.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx !== -1) hits.push({ name, index: idx });
  }
  if (hits.length === 0) return [];
  hits.sort((a, b) => a.index - b.index);

  const items: ParsedItem[] = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index;
    const end = i + 1 < hits.length ? hits[i + 1].index : text.length;
    const segment = text.slice(start, end).trim();
    const segLower = segment.toLowerCase();

    let condition: Condition = "good";
    // Check higher-severity keywords first
    outer: for (const c of ["damaged", "poor", "fair", "good"] as Condition[]) {
      for (const kw of CONDITION_KEYWORDS[c]) {
        if (segLower.includes(kw)) {
          condition = c;
          break outer;
        }
      }
    }
    items.push({ item_name: hits[i].name, condition, description: segment });
  }
  return items;
}