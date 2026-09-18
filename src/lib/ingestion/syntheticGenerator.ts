/**
 * Synthetic event generator, the backbone of demo mode. Produces a
 * realistic, seeded household schedule so the baseline engine and break
 * detector can be built and demoed without waiting on real sensor history.
 * Also used as the fallback when Ring API/simulator access isn't set up.
 */

import type { SensorEvent, SensorType, SensorEventType } from "@/lib/events/types";

export interface HouseholdSensor {
  sensorId: string;
  sensorType: SensorType;
  locationLabel: string;
}

export const DEFAULT_HOUSEHOLD_SENSORS: HouseholdSensor[] = [
  { sensorId: "contact-front-door", sensorType: "contact", locationLabel: "front-door" },
  { sensorId: "contact-back-door", sensorType: "contact", locationLabel: "back-door" },
  { sensorId: "motion-kitchen", sensorType: "motion", locationLabel: "kitchen" },
  { sensorId: "motion-bedroom", sensorType: "motion", locationLabel: "bedroom" },
  { sensorId: "motion-living-room", sensorType: "motion", locationLabel: "living-room" },
];

/** Small deterministic PRNG so demo mode is reproducible run to run. */
function mulberry32(seed: number) {
  return function rand() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface RoutineAnchor {
  label: string;
  sensorId: string;
  eventType: SensorEventType;
  earliestMinute: number; // minutes after midnight
  latestMinute: number;
  weekendShiftMinutes: number; // routines drift later on weekends
}

const ANCHOR_ROUTINES: RoutineAnchor[] = [
  { label: "wake", sensorId: "motion-bedroom", eventType: "motion-detected", earliestMinute: 6 * 60 + 30, latestMinute: 7 * 60 + 45, weekendShiftMinutes: 45 },
  { label: "breakfast", sensorId: "motion-kitchen", eventType: "motion-detected", earliestMinute: 7 * 60, latestMinute: 8 * 60 + 30, weekendShiftMinutes: 45 },
  { label: "mail-or-delivery", sensorId: "contact-front-door", eventType: "open", earliestMinute: 11 * 60, latestMinute: 13 * 60, weekendShiftMinutes: 0 },
  { label: "lunch", sensorId: "motion-kitchen", eventType: "motion-detected", earliestMinute: 12 * 60, latestMinute: 13 * 60 + 30, weekendShiftMinutes: 30 },
  { label: "afternoon", sensorId: "motion-living-room", eventType: "motion-detected", earliestMinute: 15 * 60, latestMinute: 17 * 60, weekendShiftMinutes: 0 },
  { label: "dinner", sensorId: "motion-kitchen", eventType: "motion-detected", earliestMinute: 18 * 60, latestMinute: 19 * 60 + 30, weekendShiftMinutes: 0 },
  { label: "last-activity", sensorId: "motion-bedroom", eventType: "motion-detected", earliestMinute: 21 * 60 + 30, latestMinute: 22 * 60 + 45, weekendShiftMinutes: 30 },
];

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function atMinute(date: Date, minuteOfDay: number): Date {
  const d = new Date(date);
  d.setUTCHours(0, minuteOfDay, 0, 0);
  return d;
}

export interface GenerateHistoryOptions {
  days: number;
  startDate?: Date;
  seed?: number;
  sensors?: HouseholdSensor[];
  /** Omit specific anchor labels on specific 0-indexed days to script an incident. */
  suppressedAnchors?: Record<number, string[]>;
}

/**
 * Generates `days` of household activity ending at `startDate` (default:
 * today), day-of-week aware, with random jitter so the baseline engine has
 * real variance to learn from.
 */
export function generateSyntheticHistory(options: GenerateHistoryOptions): SensorEvent[] {
  const { days, startDate = new Date(), seed = 42, suppressedAnchors = {} } = options;
  const rand = mulberry32(seed);
  const events: SensorEvent[] = [];

  for (let dayOffset = 0; dayOffset < days; dayOffset++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() - (days - 1 - dayOffset));
    date.setUTCHours(0, 0, 0, 0);
    const weekend = isWeekend(date);
    const suppressed = new Set(suppressedAnchors[dayOffset] ?? []);

    for (const anchor of ANCHOR_ROUTINES) {
      if (suppressed.has(anchor.label)) continue;
      // Mail/delivery doesn't happen every day.
      if (anchor.label === "mail-or-delivery" && rand() < 0.35) continue;

      const shift = weekend ? anchor.weekendShiftMinutes : 0;
      const span = anchor.latestMinute - anchor.earliestMinute;
      const minute = anchor.earliestMinute + shift + Math.floor(rand() * span);
      const timestamp = atMinute(date, minute);

      events.push({
        sensorId: anchor.sensorId,
        sensorType: anchor.sensorId.startsWith("contact") ? "contact" : "motion",
        locationLabel: anchor.sensorId.replace(/^(contact|motion)-/, ""),
        eventType: anchor.eventType,
        timestamp: timestamp.toISOString(),
      });

      // A door-open is followed by a close a few minutes later, and by
      // someone walking back inside - without this, every ordinary
      // delivery would look like a "sequence break" (door opened, nobody
      // came in) to the detector, which is not a break, just a normal day.
      if (anchor.eventType === "open") {
        const closeTs = new Date(timestamp.getTime() + (2 + Math.floor(rand() * 6)) * 60_000);
        events.push({
          sensorId: anchor.sensorId,
          sensorType: "contact",
          locationLabel: anchor.sensorId.replace(/^contact-/, ""),
          eventType: "close",
          timestamp: closeTs.toISOString(),
        });

        const followUpMotionTs = new Date(timestamp.getTime() + (3 + Math.floor(rand() * 4)) * 60_000);
        events.push({
          sensorId: "motion-living-room",
          sensorType: "motion",
          locationLabel: "living-room",
          eventType: "motion-detected",
          timestamp: followUpMotionTs.toISOString(),
        });
      }
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Scripted incident: a normal history, then a final day with zero activity
 * past the household's usual first-activity time, the "absence break"
 * scenario. Suppresses every anchor on the final day.
 */
export function generateScriptedAbsenceIncident(historyDays = 21, seed = 42, startDate: Date = new Date()): SensorEvent[] {
  const suppressFrom = ["wake", "breakfast", "mail-or-delivery", "lunch", "afternoon", "dinner", "last-activity"];
  return generateSyntheticHistory({
    days: historyDays,
    seed,
    startDate,
    suppressedAnchors: { [historyDays - 1]: suppressFrom },
  });
}

/**
 * Scripted incident: front door opens repeatedly overnight with no baseline
 * for that hour, the "nocturnal anomaly" scenario.
 */
export function generateScriptedNocturnalIncident(historyDays = 21, seed = 42, startDate: Date = new Date()): SensorEvent[] {
  const base = generateSyntheticHistory({ days: historyDays, seed, startDate });
  const lastDay = new Date(startDate);
  lastDay.setUTCHours(0, 0, 0, 0);

  const nocturnalEvents: SensorEvent[] = [1, 2, 3].map((i) => ({
    sensorId: "contact-front-door",
    sensorType: "contact",
    locationLabel: "front-door",
    eventType: "open" as const,
    timestamp: atMinute(lastDay, 2 * 60 + i * 20).toISOString(),
  }));

  return [...base, ...nocturnalEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/**
 * Scripted incident: an otherwise normal day, but one front-door open with
 * no interior motion in the following 10 minutes, the "sequence break"
 * scenario. The injected door event sits at 09:30, clear of every anchor's
 * time window, so it cannot collide with a routine event that would mask
 * the break.
 */
export function generateScriptedSequenceBreakIncident(historyDays = 21, seed = 42, startDate: Date = new Date()): SensorEvent[] {
  const base = generateSyntheticHistory({ days: historyDays, seed, startDate });
  const lastDay = new Date(startDate);
  lastDay.setUTCHours(0, 0, 0, 0);
  const lastDayKey = lastDay.toISOString().slice(0, 10);

  const doorOpenTime = atMinute(lastDay, 9 * 60 + 30); // 09:30 - clear of every anchor window
  const windowEnd = new Date(doorOpenTime.getTime() + 10 * 60_000);

  // Guarantee the window is truly empty on this one day, even if a jittered
  // anchor happened to land nearby.
  const withoutCollisions = base.filter((event) => {
    if (event.timestamp.slice(0, 10) !== lastDayKey) return true;
    const t = new Date(event.timestamp);
    return t < doorOpenTime || t > windowEnd;
  });

  const doorEvents: SensorEvent[] = [
    {
      sensorId: "contact-front-door",
      sensorType: "contact",
      locationLabel: "front-door",
      eventType: "open",
      timestamp: doorOpenTime.toISOString(),
    },
    {
      sensorId: "contact-front-door",
      sensorType: "contact",
      locationLabel: "front-door",
      eventType: "close",
      timestamp: new Date(doorOpenTime.getTime() + 3 * 60_000).toISOString(),
    },
  ];

  return [...withoutCollisions, ...doorEvents].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
