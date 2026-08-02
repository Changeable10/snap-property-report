// Decor8 AI's full room_type enum, verified against their HTTP, Python, and
// JS SDK docs (https://github.com/immex-tech/decor8ai-sdk — http/README.md
// and python/decor8ai/README.md both list all 31 values; the js README lists
// the first 26, a subset of the same list). Decor8 doesn't expose this as a
// live/introspectable endpoint, so if they add or rename room types this
// list needs a manual refresh.
export const DECOR8_ROOM_TYPES = [
  "livingroom",
  "kitchen",
  "diningroom",
  "bedroom",
  "bathroom",
  "kidsroom",
  "familyroom",
  "readingnook",
  "sunroom",
  "walkincloset",
  "mudroom",
  "toyroom",
  "office",
  "foyer",
  "powderroom",
  "laundryroom",
  "gym",
  "basement",
  "garage",
  "balcony",
  "cafe",
  "homebar",
  "study_room",
  "front_porch",
  "back_porch",
  "back_patio",
  "openplan",
  "boardroom",
  "meetingroom",
  "openworkspace",
  "privateoffice",
] as const;

export type Decor8RoomType = (typeof DECOR8_ROOM_TYPES)[number];

// Free-text Snapsure room name -> Decor8 room_type, most specific patterns
// first (e.g. "powder room" / "private office" must be checked before the
// generic "bathroom" / "office" patterns they'd otherwise also match).
const ROOM_NAME_MAP: Array<{ match: RegExp; type: Decor8RoomType }> = [
  { match: /toilet|\bwc\b|powder\s*room/i, type: "powderroom" },
  { match: /walk.?in.?(closet|wardrobe)/i, type: "walkincloset" },
  { match: /private\s*office/i, type: "privateoffice" },
  { match: /board\s*room/i, type: "boardroom" },
  { match: /meeting\s*room/i, type: "meetingroom" },
  { match: /open\s*workspace/i, type: "openworkspace" },
  { match: /open\s*plan/i, type: "openplan" },
  { match: /reading\s*nook/i, type: "readingnook" },
  { match: /sun\s*room|conservatory/i, type: "sunroom" },
  { match: /front\s*porch/i, type: "front_porch" },
  { match: /back\s*porch/i, type: "back_porch" },
  { match: /back\s*patio|\bpatio\b/i, type: "back_patio" },
  { match: /home\s*bar/i, type: "homebar" },
  { match: /mud\s*room/i, type: "mudroom" },
  { match: /toy\s*room|play\s*room/i, type: "toyroom" },
  { match: /kid|nursery/i, type: "kidsroom" },
  { match: /family\s*room/i, type: "familyroom" },
  { match: /laundry/i, type: "laundryroom" },
  { match: /living|lounge/i, type: "livingroom" },
  { match: /dining/i, type: "diningroom" },
  { match: /kitchen/i, type: "kitchen" },
  { match: /ensuite|bathroom/i, type: "bathroom" },
  { match: /bed\s*room|master/i, type: "bedroom" },
  { match: /study/i, type: "study_room" },
  { match: /office/i, type: "office" },
  { match: /gym/i, type: "gym" },
  { match: /basement|cellar/i, type: "basement" },
  { match: /garage/i, type: "garage" },
  { match: /balcony|deck/i, type: "balcony" },
  { match: /cafe/i, type: "cafe" },
  { match: /foyer|entry|entrance|hall(way)?/i, type: "foyer" },
];

export class UnmappedRoomTypeError extends Error {
  constructor(roomName: string | undefined | null) {
    super(
      roomName
        ? `Couldn't match room "${roomName}" to a Decor8 room type — rename the room (e.g. to "Bedroom" or "Living room") and try again.`
        : "This photo isn't assigned to a room, so a Decor8 room type can't be determined — assign it to a room first.",
    );
    this.name = "UnmappedRoomTypeError";
  }
}

/** Resolves a free-text Snapsure room name to a Decor8 room_type, or throws UnmappedRoomTypeError. */
export function resolveRoomType(roomName: string | undefined | null): Decor8RoomType {
  if (roomName) {
    for (const { match, type } of ROOM_NAME_MAP) {
      if (match.test(roomName)) return type;
    }
  }
  throw new UnmappedRoomTypeError(roomName);
}
