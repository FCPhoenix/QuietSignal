/**
 * Every ingestion mode (real Ring API, Ring simulator, or the synthetic
 * generator) produces this shape, so the baseline engine and break
 * detector never need to know which mode fed them.
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
 * A connectivity gap, recorded rather than silently treated as "no
 * activity" when a sensor drops offline.
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
