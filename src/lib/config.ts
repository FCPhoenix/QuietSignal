/**
 * Central runtime config (FR-6.1). All tunables come from env so the
 * hackathon demo and a real deployment share one code path.
 */

export type IngestionMode = "ring-api" | "ring-simulator" | "synthetic";

export interface QuietSignalConfig {
  ingestionMode: IngestionMode;
  timezone: string;
  rollingWindowDays: number; // FR-2.1, default 21, tunable 7-35
  confirmationPeriodMinutes: number; // FR-3.3, default 15-30
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string;
  tolerance: "lenient" | "balanced" | "strict";
  demoMode: boolean; // FR-6.2
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadConfig(): QuietSignalConfig {
  return {
    ingestionMode: (process.env.QS_INGESTION_MODE as IngestionMode) ?? "synthetic",
    timezone: process.env.QS_TIMEZONE ?? "America/New_York",
    rollingWindowDays: envInt("QS_ROLLING_WINDOW_DAYS", 21),
    confirmationPeriodMinutes: envInt("QS_CONFIRMATION_PERIOD_MINUTES", 20),
    quietHoursStart: process.env.QS_QUIET_HOURS_START ?? "22:00",
    quietHoursEnd: process.env.QS_QUIET_HOURS_END ?? "07:00",
    tolerance: (process.env.QS_TOLERANCE as QuietSignalConfig["tolerance"]) ?? "balanced",
    demoMode: process.env.QS_DEMO_MODE === "true",
  };
}
