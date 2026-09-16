/**
 * Ring API / simulator ingestion — Modes A & B (FR-1.1).
 *
 * NOT YET WIRED UP. This is intentionally a stub: the PRD's Days 1-3 spike
 * (docs/PRD.md §10) exists specifically to validate what the real Ring API
 * and simulator return before this gets built for real. Fill in against:
 *   - https://developer.amazon.com/docs/ring/api-documentation.html
 *   - https://github.com/AmazonAppDev/ring-api-helloworld
 *
 * Until then, `getIngestionSource()` in ./index.ts falls back to the
 * synthetic generator (Mode C), which is always available.
 */

import type { SensorEvent } from "@/lib/events/types";

export interface RingClientOptions {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

export interface RingIngestionSource {
  /** Poll or subscribe for new events since a cursor/timestamp. */
  pollEvents(sinceIso: string): Promise<SensorEvent[]>;
}

export function createRingClient(_options: RingClientOptions): RingIngestionSource {
  throw new Error(
    "Ring API client not implemented yet — complete the Days 1-3 spike " +
      "(docs/PRD.md §10) and wire real auth + event mapping here before use.",
  );
}
