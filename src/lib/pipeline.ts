/**
 * Wires ingestion -> baseline -> break detection into one call so the
 * Watcher UI (and, later, a scheduled job) doesn't reassemble it. Demo mode
 * (FR-6.2) replays a scripted absence-break day so the pipeline is visibly
 * exercised without waiting on real history.
 */

import { loadConfig } from "@/lib/config";
import { getRecentEvents, generateScriptedAbsenceIncident } from "@/lib/ingestion";
import { buildBaseline, type HouseholdBaseline } from "@/lib/baseline/engine";
import { detectBreaks, type BreakCandidate } from "@/lib/detector/breakDetector";
import type { SensorEvent } from "@/lib/events/types";

export interface HouseholdEvaluation {
  baseline: HouseholdBaseline;
  todayEvents: SensorEvent[];
  breaks: BreakCandidate[];
  evaluatedAt: string;
}

function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function evaluateHousehold(): Promise<HouseholdEvaluation> {
  const config = loadConfig();
  const now = new Date();

  const events = config.demoMode
    ? generateScriptedAbsenceIncident(config.rollingWindowDays)
    : await getRecentEvents();

  const key = todayKey(now);
  const historyEvents = events.filter((e) => e.timestamp.slice(0, 10) !== key);
  const todayEvents = events.filter((e) => e.timestamp.slice(0, 10) === key);

  const baseline = buildBaseline(historyEvents, config.rollingWindowDays);
  const breaks = detectBreaks(todayEvents, baseline, now, config);

  return { baseline, todayEvents, breaks, evaluatedAt: now.toISOString() };
}
