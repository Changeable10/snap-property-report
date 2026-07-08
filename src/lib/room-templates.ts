import type { PropertyType } from "./property-types";

// Walkthrough order — lower first
// hallway, living, kitchen, dining, bedrooms, bathrooms, laundry, garage, outdoor
export function buildRoomTemplate(
  type: PropertyType,
  bedrooms: number,
  bathrooms: number,
): { name: string; sort_order: number }[] {
  const rooms: { name: string; sort_order: number }[] = [];
  let order = 0;
  const push = (name: string, band: number) => {
    rooms.push({ name, sort_order: band * 100 + order++ });
  };

  push("Entrance / Hallway", 0);

  if (type === "house" || type === "townhouse") {
    push("Living Room", 1);
  } else if (type === "apartment") {
    push("Living Area", 1);
  } else if (type === "unit") {
    push("Living Area", 1);
  }

  push("Kitchen", 2);

  if (type === "house" || type === "townhouse") {
    push("Dining Room", 3);
  }

  for (let i = 1; i <= bedrooms; i++) {
    push(i === 1 ? "Bedroom 1 (Main)" : `Bedroom ${i}`, 4);
  }

  for (let i = 1; i <= bathrooms; i++) {
    push(`Bathroom ${i}`, 5);
  }

  push(type === "apartment" ? "Laundry Cupboard" : "Laundry", 6);

  if (type === "house" || type === "townhouse") {
    push("Garage", 7);
  }

  if (type === "apartment") {
    push("Balcony / Deck", 8);
  } else if (type === "house" || type === "townhouse") {
    push("Outdoor Area", 8);
  }

  return rooms;
}