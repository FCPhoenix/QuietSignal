/**
 * Baseline engine (FR-2). Pure deterministic statistics — no LLM calls here
 * by design (§6 data flow principle: statistics decide *whether*, the LLM
 * only decides *how to say it*).
 *
 * Builds per-time-of-day anchor routines from raw events and scores how
 * confident we are in each one, which gates alerting (FR-2.3, FR-2.4).
 */

import type { SensorEvent } from "@/lib/events/types";

export type AnchorConfidence = "learning" | "stable" | "high-confidence";

export interface AnchorRoutine {
  label: string;
  /** "household" for whole-home anchors, or a sensorId for a per-sensor one. */
  scope: string;
  meanMinuteOfDay: number;
  stdDevMinutes: number;
  sampleDays: number;
  totalDaysObserved: number;
  confidence: AnchorConfidence;
}

export interface HouseholdBaseline {
  anchors: AnchorRoutine[];
  computedAt: string;
  windowDays: number;
}

const LEARNING_THRESHOLD_DAYS = 7;
const STABLE_THRESHOLD_DAYS = 14;

export function confidenceFromSampleDays(sampleDays: number): AnchorConfidence {
  if (sampleDays >= STABLE_THRESHOLD_DAYS) return "high-confidence";
  if (sampleDays >= LEARNING_THRESHOLD_DAYS) return "stable";
  return "learning";
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // UTC calendar day
}

function minuteOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function meanAndStdDev(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return { mean, stdDev: Math.sqrt(variance) };
}

function buildAnchor(label: string, scope: string, minutesByDay: number[], totalDaysObserved: number): AnchorRoutine {
  const { mean, stdDev } = meanAndStdDev(minutesByDay);
  return {
    label,
    scope,
    meanMinuteOfDay: Math.round(mean),
    stdDevMinutes: Math.round(stdDev),
    sampleDays: minutesByDay.length,
    totalDaysObserved,
    confidence: confidenceFromSampleDays(minutesByDay.length),
  };
}

const MEAL_WINDOWS: Array<{ label: string; startMinute: number; endMinute: number }> = [
  { label: "breakfast", startMinute: 6 * 60, endMinute: 11 * 60 },
  { label: "lunch", startMinute: 11 * 60, endMinute: 15 * 60 },
  { label: "dinner", startMinute: 17 * 60, endMinute: 21 * 60 },
];

/**
 * Builds household anchor routines (FR-2.2) from a rolling window of events
 * (FR-2.1). Anchors: first/last activity of the day (household-wide), meal
 * windows (from any "kitchen"-labeled sensor), and per-sensor first event of
 * day for every other sensor (captures door/delivery patterns generically).
 */
export function buildBaseline(events: SensorEvent[], windowDays: number): HouseholdBaseline {
  const byDay = new Map<string, SensorEvent[]>();
  for (const event of events) {
    const key = dayKey(event.timestamp);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(event);
  }
  const totalDaysObserved = byDay.size;

  const firstActivityMinutes: number[] = [];
  const lastActivityMinutes: number[] = [];
  const mealMinutes: Record<string, number[]> = { breakfast: [], lunch: [], dinner: [] };
  const perSensorFirstMinutes = new Map<string, number[]>();

  for (const dayEvents of byDay.values()) {
    const sorted = [...dayEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    if (sorted.length === 0) continue;

    firstActivityMinutes.push(minuteOfDay(sorted[0].timestamp));
    lastActivityMinutes.push(minuteOfDay(sorted[sorted.length - 1].timestamp));

    const kitchenEvents = sorted.filter((e) => e.locationLabel === "kitchen");
    for (const window of MEAL_WINDOWS) {
      const match = kitchenEvents.find((e) => {
        const m = minuteOfDay(e.timestamp);
        return m >= window.startMinute && m < window.endMinute;
      });
      if (match) mealMinutes[window.label].push(minuteOfDay(match.timestamp));
    }

    const seenSensors = new Set<string>();
    for (const event of sorted) {
      if (seenSensors.has(event.sensorId)) continue;
      seenSensors.add(event.sensorId);
      if (!perSensorFirstMinutes.has(event.sensorId)) perSensorFirstMinutes.set(event.sensorId, []);
      perSensorFirstMinutes.get(event.sensorId)!.push(minuteOfDay(event.timestamp));
    }
  }

  const anchors: AnchorRoutine[] = [
    buildAnchor("first-activity", "household", firstActivityMinutes, totalDaysObserved),
    buildAnchor("last-activity", "household", lastActivityMinutes, totalDaysObserved),
    ...Object.entries(mealMinutes).map(([label, minutes]) => buildAnchor(label, "household", minutes, totalDaysObserved)),
    ...Array.from(perSensorFirstMinutes.entries()).map(([sensorId, minutes]) =>
      buildAnchor("first-event", sensorId, minutes, totalDaysObserved),
    ),
  ];

  return { anchors, computedAt: new Date().toISOString(), windowDays };
}
