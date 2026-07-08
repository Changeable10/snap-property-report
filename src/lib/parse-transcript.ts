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

export interface ParsedItem {
  item_name: string;
  condition: Condition;
  description: string;
}

export function parseTranscript(transcript: string): ParsedItem[] {
  const text = transcript.trim();
  if (!text) return [];
  const lower = text.toLowerCase();

  // Find item name occurrences (by earliest index)
  const hits: { name: string; index: number }[] = [];
  for (const name of ITEM_NAMES) {
    const re = new RegExp(`\\b${name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    const m = lower.match(re);
    if (m && m.index !== undefined) hits.push({ name, index: m.index });
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