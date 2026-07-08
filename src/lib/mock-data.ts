export type Condition = "good" | "fair" | "poor" | "damaged";

export type PropertyType = "house" | "apartment" | "townhouse" | "unit";

export type InspectionType = "entry" | "routine" | "exit";

export interface Property {
  id: string;
  address: string;
  suburb: string;
  postcode: string;
  type: PropertyType;
  beds: number;
  baths: number;
  lastInspection?: {
    date: string; // ISO
    type: InspectionType;
  };
}

export const mockProperties: Property[] = [
  {
    id: "prop-1",
    address: "42 Bell Street",
    suburb: "New Plymouth",
    postcode: "4312",
    type: "house",
    beds: 3,
    baths: 1,
    lastInspection: { date: "2026-05-14", type: "routine" },
  },
  {
    id: "prop-2",
    address: "7/15 Devon Street East",
    suburb: "New Plymouth Central",
    postcode: "4310",
    type: "apartment",
    beds: 2,
    baths: 1,
    lastInspection: { date: "2026-02-03", type: "entry" },
  },
];