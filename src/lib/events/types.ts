/**
 * Normalized event schema (FR-1.2). Every ingestion mode (real Ring API,
 * Ring simulator, or the synthetic generator) must produce these shapes so
 * the baseline engine and break detector never know which mode fed them.
 */

export type SensorType = "motion" | "contact" | "doorbell";

export type ContactEventType = "open" | "close";
export type MotionEventType = "motion-detected";
export type DoorbellEventType = "press";

export type SensorEventType = ContactEventType | MotionEventType | DoorbellEventType;

export interface SensorEvent {
  sensorId: string;
  sensorType: SensorType;
  locationLabel: string; // e.g. "kitchen", "front-door" — Resident-visible, never a camera frame
  eventType: SensorEventType;
  timestamp: string; // ISO 8601, UTC
}

/**
 * Ingestion must record connectivity gaps rather than silently treating
 * "no events" as "no activity" (FR-1.3).
 */
export interface GapInterval {
  sensorId: string;
  startedAt: string;
  endedAt: string | null; // null while the gap is ongoing
  reason: "offline" | "unknown";
}

export interface CheckIn {
  breakId: string;
  acknowledgedAt: string;
  surface: "in-app" | "ring-alexa-prompt";
}
