/**
 * Break detector (FR-3). Evaluates the current state against the household
 * baseline and emits scored break candidates with evidence. Never a naked
 * number (FR-3.2) — every candidate carries the anchor, the deviation, and
 * the confidence it was judged against.
 *
 * Hysteresis (FR-3.3): pass the previous evaluation's candidates back in via
 * `previousCandidates` so `firstDetectedAt` persists across calls and a
 * candidate only becomes `confirmed` once it has outlasted the confirmation
 * window. A single call with no history behaves as a fresh detection.
 */

import type { SensorEvent } from "@/lib/events/types";
import type { HouseholdBaseline, AnchorRoutine } from "@/lib/baseline/engine";
import type { QuietSignalConfig } from "@/lib/config";

export type BreakClass = "absence" | "nocturnal-anomaly" | "sequence-break" | "silence-after-anomaly";

export interface BreakCandidate {
  id: string;
  breakClass: BreakClass;
  riskScore: number; // 0-100, always accompanied by `reasons`
  reasons: string[];
  evidence: {
    anchor?: AnchorRoutine;
    observedMinuteOfDay?: number;
    events?: SensorEvent[];
  };
  firstDetectedAt: string;
  confirmed: boolean;
}

function minuteOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function toleranceMultiplier(tolerance: QuietSignalConfig["tolerance"]): number {
  switch (tolerance) {
    case "lenient":
      return 2.5;
    case "strict":
      return 1.25;
    case "balanced":
    default:
      return 1.75;
  }
}

function isQuietHours(minute: number, config: QuietSignalConfig): boolean {
  const [startH, startM] = config.quietHoursStart.split(":").map(Number);
  const [endH, endM] = config.quietHoursEnd.split(":").map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  if (start > end) return minute >= start || minute < end; // wraps midnight
  return minute >= start && minute < end;
}

function detectAbsenceBreak(
  todayEvents: SensorEvent[],
  baseline: HouseholdBaseline,
  now: Date,
  config: QuietSignalConfig,
): BreakCandidate | null {
  const anchor = baseline.anchors.find((a) => a.label === "first-activity" && a.scope === "household");
  if (!anchor || anchor.confidence === "learning") return null; // FR-2.4: never alert while learning

  const cutoff = anchor.meanMinuteOfDay + anchor.stdDevMinutes * toleranceMultiplier(config.tolerance);
  const nowMinute = minuteOfDay(now);
  const hasActivity = todayEvents.length > 0;

  if (!hasActivity && nowMinute > cutoff) {
    return {
      id: `absence-${now.toISOString().slice(0, 10)}`,
      breakClass: "absence",
      riskScore: Math.min(100, 40 + (nowMinute - cutoff)),
      reasons: [
        `No activity yet today; first activity is normally around ${formatMinute(anchor.meanMinuteOfDay)} (±${anchor.stdDevMinutes}m, ${anchor.confidence} confidence, ${anchor.sampleDays} days observed).`,
      ],
      evidence: { anchor, observedMinuteOfDay: nowMinute },
      firstDetectedAt: now.toISOString(),
      confirmed: false,
    };
  }
  return null;
}

function detectNocturnalAnomaly(
  todayEvents: SensorEvent[],
  now: Date,
  config: QuietSignalConfig,
): BreakCandidate | null {
  const nightEvents = todayEvents.filter((e) => isQuietHours(minuteOfDay(new Date(e.timestamp)), config));
  if (nightEvents.length < 3) return null;

  return {
    id: `nocturnal-${now.toISOString().slice(0, 10)}`,
    breakClass: "nocturnal-anomaly",
    riskScore: Math.min(100, 50 + nightEvents.length * 5),
    reasons: [
      `${nightEvents.length} sensor events during quiet hours (${config.quietHoursStart}-${config.quietHoursEnd}), when baseline activity is normally zero.`,
    ],
    evidence: { events: nightEvents },
    firstDetectedAt: now.toISOString(),
    confirmed: false,
  };
}

function detectSequenceBreak(todayEvents: SensorEvent[], now: Date): BreakCandidate | null {
  const doorOpens = todayEvents.filter((e) => e.sensorType === "contact" && e.eventType === "open");
  const FOLLOW_UP_WINDOW_MINUTES = 10;

  for (const doorOpen of doorOpens) {
    const openTime = new Date(doorOpen.timestamp).getTime();
    const followUpMotion = todayEvents.some(
      (e) =>
        e.sensorType === "motion" &&
        new Date(e.timestamp).getTime() > openTime &&
        new Date(e.timestamp).getTime() <= openTime + FOLLOW_UP_WINDOW_MINUTES * 60_000,
    );
    const windowHasElapsed = now.getTime() > openTime + FOLLOW_UP_WINDOW_MINUTES * 60_000;

    if (!followUpMotion && windowHasElapsed) {
      return {
        id: `sequence-${doorOpen.sensorId}-${doorOpen.timestamp}`,
        breakClass: "sequence-break",
        riskScore: 55,
        reasons: [
          `${doorOpen.locationLabel} opened at ${doorOpen.timestamp} with no interior motion in the following ${FOLLOW_UP_WINDOW_MINUTES} minutes.`,
        ],
        evidence: { events: [doorOpen] },
        firstDetectedAt: now.toISOString(),
        confirmed: false,
      };
    }
  }
  return null;
}

function detectSilenceAfterAnomaly(
  candidates: BreakCandidate[],
  todayEvents: SensorEvent[],
  now: Date,
): BreakCandidate | null {
  const anomaly = candidates.find((c) => c.breakClass === "nocturnal-anomaly" || c.breakClass === "sequence-break");
  if (!anomaly) return null;

  const anomalyTime = new Date(anomaly.firstDetectedAt).getTime();
  const SILENCE_WINDOW_MINUTES = 60;
  const hasFollowUpActivity = todayEvents.some(
    (e) => new Date(e.timestamp).getTime() > anomalyTime,
  );
  const windowElapsed = now.getTime() > anomalyTime + SILENCE_WINDOW_MINUTES * 60_000;

  if (!hasFollowUpActivity && windowElapsed) {
    return {
      id: `silence-after-${anomaly.id}`,
      breakClass: "silence-after-anomaly",
      riskScore: Math.min(100, anomaly.riskScore + 25),
      reasons: [
        `${anomaly.reasons[0]} Followed by total inactivity for over ${SILENCE_WINDOW_MINUTES} minutes — compounding risk.`,
      ],
      evidence: anomaly.evidence,
      firstDetectedAt: anomaly.firstDetectedAt,
      confirmed: false,
    };
  }
  return null;
}

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function detectBreaks(
  todayEvents: SensorEvent[],
  baseline: HouseholdBaseline,
  now: Date,
  config: QuietSignalConfig,
  previousCandidates: BreakCandidate[] = [],
): BreakCandidate[] {
  const fresh = [
    detectAbsenceBreak(todayEvents, baseline, now, config),
    detectNocturnalAnomaly(todayEvents, now, config),
    detectSequenceBreak(todayEvents, now),
  ].filter((c): c is BreakCandidate => c !== null);

  const silence = detectSilenceAfterAnomaly(fresh, todayEvents, now);
  if (silence) fresh.push(silence);

  // Carry forward firstDetectedAt from any matching previous candidate so
  // hysteresis (FR-3.3) works across repeated evaluations.
  const confirmationMs = config.confirmationPeriodMinutes * 60_000;
  return fresh.map((candidate) => {
    const prior = previousCandidates.find((p) => p.id === candidate.id);
    const firstDetectedAt = prior?.firstDetectedAt ?? candidate.firstDetectedAt;
    const persistedMs = now.getTime() - new Date(firstDetectedAt).getTime();
    return { ...candidate, firstDetectedAt, confirmed: persistedMs >= confirmationMs };
  });
}
