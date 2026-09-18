export type IngestionMode = "ring-api" | "ring-simulator" | "synthetic";

export interface QuietSignalConfig {
  ingestionMode: IngestionMode;
  timezone: string;
  rollingWindowDays: number;
  confirmationPeriodMinutes: number;
  quietHoursStart: string; // "HH:mm"
  quietHoursEnd: string;
  tolerance: "lenient" | "balanced" | "strict";
  demoMode: boolean;
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
