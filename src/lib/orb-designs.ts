export const ORB_DESIGNS = [
  { key: "liquid", name: "Liquid", description: "A quiet, flowing core." },
  { key: "halo", name: "Halo", description: "A core in a precision dial." },
  { key: "eclipse", name: "Eclipse", description: "Light along a lunar edge." },
  { key: "orbit", name: "Orbit", description: "A core with a satellite trace." },
] as const;

export type OrbDesign = (typeof ORB_DESIGNS)[number]["key"];
export const DEFAULT_ORB_DESIGN: OrbDesign = "halo";
export function isOrbDesign(value: unknown): value is OrbDesign {
  return ORB_DESIGNS.some((design) => design.key === value);
}
