import type { SensorEvent } from "@/lib/events/types";
import { loadConfig } from "@/lib/config";
import { generateSyntheticHistory } from "@/lib/ingestion/syntheticGenerator";
import { createRingClient } from "@/lib/ingestion/ringClient";
import { getRingAuthMode } from "@/lib/ingestion/ringAuth";

/**
 * Single entry point the rest of the app calls for events — it never needs
 * to know whether they came from Ring or the synthetic generator (FR-1.1).
 */
export async function getRecentEvents(): Promise<SensorEvent[]> {
  const config = loadConfig();

  switch (config.ingestionMode) {
    case "ring-api":
    case "ring-simulator": {
      if (!getRingAuthMode()) {
        // No credentials yet - fall back rather than block the rest of the
        // pipeline (PRD §9 risk mitigation: disclosed synthetic fallback).
        return generateSyntheticHistory({ days: config.rollingWindowDays });
      }
      const client = createRingClient();
      const sinceIso = new Date(Date.now() - config.rollingWindowDays * 24 * 60 * 60 * 1000).toISOString();
      return client.pollEvents(sinceIso);
    }
    case "synthetic":
    default:
      return generateSyntheticHistory({ days: config.rollingWindowDays });
  }
}

export * from "@/lib/ingestion/syntheticGenerator";
