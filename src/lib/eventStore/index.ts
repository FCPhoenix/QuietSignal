/**
 * Append-only event store, plus gap intervals and acknowledged check-ins.
 * This in-memory implementation is enough to drive the baseline engine and
 * break detector; swap the `EventStore` interface for a DynamoDB-backed one
 * for a real deployment without touching any caller.
 */

import type { CheckIn, GapInterval, SensorEvent } from "@/lib/events/types";

export interface EventStore {
  append(events: SensorEvent[]): Promise<void>;
  query(sinceIso: string, untilIso?: string): Promise<SensorEvent[]>;
  recordGap(gap: GapInterval): Promise<void>;
  recordCheckIn(checkIn: CheckIn): Promise<void>;
  listGaps(sinceIso: string): Promise<GapInterval[]>;
  listCheckIns(sinceIso: string): Promise<CheckIn[]>;
}

export class InMemoryEventStore implements EventStore {
  private events: SensorEvent[] = [];
  private gaps: GapInterval[] = [];
  private checkIns: CheckIn[] = [];

  async append(events: SensorEvent[]): Promise<void> {
    this.events.push(...events);
    this.events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async query(sinceIso: string, untilIso?: string): Promise<SensorEvent[]> {
    return this.events.filter(
      (e) => e.timestamp >= sinceIso && (!untilIso || e.timestamp <= untilIso),
    );
  }

  async recordGap(gap: GapInterval): Promise<void> {
    this.gaps.push(gap);
  }

  async recordCheckIn(checkIn: CheckIn): Promise<void> {
    this.checkIns.push(checkIn);
  }

  async listGaps(sinceIso: string): Promise<GapInterval[]> {
    return this.gaps.filter((g) => g.startedAt >= sinceIso);
  }

  async listCheckIns(sinceIso: string): Promise<CheckIn[]> {
    return this.checkIns.filter((c) => c.acknowledgedAt >= sinceIso);
  }
}

let sharedStore: EventStore | null = null;

/** Process-wide singleton so API routes share one in-memory store in dev. */
export function getEventStore(): EventStore {
  if (!sharedStore) sharedStore = new InMemoryEventStore();
  return sharedStore;
}
