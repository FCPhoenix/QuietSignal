import type { SensorEvent } from "@/lib/events/types";
import { loadConfig } from "@/lib/config";
import { generateSyntheticHistory } from "@/lib/ingestion/syntheticGenerator";

/**
 * Single entry point the rest of the app calls for events — it never needs
 * to know whether they came from Ring or the synthetic generator (FR-1.1).
 */
export async function getRecentEvents(): Promise<SensorEvent[]> {
  const config = loadConfig();

  switch (config.ingestionMode) {
    case "ring-api":
    case "ring-simulator":
      // TODO(Days 1-3 spike): wire src/lib/ingestion/ringClient.ts here
      // once Ring developer access is confirmed. Falling back to synthetic
      // for now so the rest of the pipeline is never blocked on it.
      return generateSyntheticHistory({ days: config.rollingWindowDays });
    case "synthetic":
    default:
      return generateSyntheticHistory({ days: config.rollingWindowDays });
  }
}

export * from "@/lib/ingestion/syntheticGenerator";
