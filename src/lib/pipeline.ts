/**
 * Wires ingestion, baseline, and break detection into one call so the
 * Watcher UI (and, later, a scheduled job) doesn't reassemble it. Demo mode
 * replays a scripted absence-break day so the pipeline is visibly exercised
 * without waiting on real history.
 *
 * `evaluateEvents` is the pure half (no I/O, no clock) - it's what
 * tests/acceptance.test.ts drives directly against the real engine code.
 */

import { loadConfig, type QuietSignalConfig } from "@/lib/config";
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

export function evaluateEvents(
  events: SensorEvent[],
  now: Date,
  config: QuietSignalConfig,
  previousCandidates: BreakCandidate[] = [],
): HouseholdEvaluation {
  const key = todayKey(now);
  const historyEvents = events.filter((e) => e.timestamp.slice(0, 10) !== key);
  const todayEvents = events.filter((e) => e.timestamp.slice(0, 10) === key);

  const baseline = buildBaseline(historyEvents, config.rollingWindowDays);
  const breaks = detectBreaks(todayEvents, baseline, now, config, previousCandidates);

  return { baseline, todayEvents, breaks, evaluatedAt: now.toISOString() };
}

export async function evaluateHousehold(): Promise<HouseholdEvaluation> {
  const config = loadConfig();

  if (config.demoMode) {
    // Demo mode has to be reproducible regardless of what time of day
    // someone loads the page. Anchor "today" to the real calendar date (so
    // it still feels live), but evaluate as if it's late in the day, so
    // the scripted absence always shows, regardless of wall-clock time.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const demoNow = new Date(today);
    demoNow.setUTCHours(23, 0, 0, 0);

    const events = generateScriptedAbsenceIncident(config.rollingWindowDays, 42, today);
    return evaluateEvents(events, demoNow, config);
  }

  const now = new Date();
  const events = await getRecentEvents();
  return evaluateEvents(events, now, config);
}
