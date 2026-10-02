export interface PriceHistoryPoint {
  snapshotTime: string;
  lowestPrice: string | null;
  source: "official" | "local";
}

export function mergePriceHistory(official: Omit<PriceHistoryPoint, "source">[], local: Omit<PriceHistoryPoint, "source">[]): PriceHistoryPoint[] {
  const points = new Map<number, PriceHistoryPoint>();
  for (const point of local) {
    const timestamp = Date.parse(point.snapshotTime);
    if (Number.isFinite(timestamp)) points.set(timestamp, { ...point, source: "local" });
  }
  for (const point of official) {
    const timestamp = Date.parse(point.snapshotTime);
    if (Number.isFinite(timestamp)) points.set(timestamp, { ...point, source: "official" });
  }
  return [...points.entries()].sort(([a], [b]) => a - b).map(([, point]) => point);
}
