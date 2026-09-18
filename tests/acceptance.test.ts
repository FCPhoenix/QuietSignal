/**
 * Checks that a scripted 21-day history produces correct anchors and that
 * each of the three scripted break scenarios actually fires, against the
 * real baseline engine and break detector, not mocks.
 */

import { describe, it, expect } from "vitest";
import {
  generateSyntheticHistory,
  generateScriptedAbsenceIncident,
  generateScriptedNocturnalIncident,
  generateScriptedSequenceBreakIncident,
} from "@/lib/ingestion/syntheticGenerator";
import { buildBaseline } from "@/lib/baseline/engine";
import { evaluateEvents } from "@/lib/pipeline";
import type { QuietSignalConfig } from "@/lib/config";

const TEST_CONFIG: QuietSignalConfig = {
  ingestionMode: "synthetic",
  timezone: "UTC",
  rollingWindowDays: 21,
  confirmationPeriodMinutes: 20,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  tolerance: "balanced",
  demoMode: false,
};

const REFERENCE_DATE = new Date("2026-09-18T23:00:00.000Z"); // late in the day, past every anchor window
const END_OF_DAY = (d: Date) => {
  const end = new Date(d);
  end.setUTCHours(23, 0, 0, 0);
  return end;
};

describe("learning curve", () => {
  it("reaches high confidence for at least 3 household anchors after 21 days", () => {
    const history = generateSyntheticHistory({ days: 21, seed: 42, startDate: REFERENCE_DATE });
    const baseline = buildBaseline(history, 21);

    const highConfidenceHouseholdAnchors = baseline.anchors.filter(
      (a) => a.scope === "household" && a.confidence === "high-confidence",
    );
    expect(highConfidenceHouseholdAnchors.length).toBeGreaterThanOrEqual(3);

    const firstActivity = baseline.anchors.find((a) => a.label === "first-activity");
    expect(firstActivity?.confidence).toBe("high-confidence");
  });

  it("stays in learning mode with fewer than 7 days of history", () => {
    const history = generateSyntheticHistory({ days: 5, seed: 42, startDate: REFERENCE_DATE });
    const baseline = buildBaseline(history, 21);
    const firstActivity = baseline.anchors.find((a) => a.label === "first-activity");
    expect(firstActivity?.confidence).toBe("learning");
  });
});

describe("noise floor", () => {
  it("never alerts on an absence-shaped day while still in learning mode", () => {
    // 5 days of history, then a day with zero activity - looks exactly
    // like the absence-break scenario, but confidence hasn't been earned.
    const incident = generateScriptedAbsenceIncident(5, 42, REFERENCE_DATE);
    const { breaks } = evaluateEvents(incident, END_OF_DAY(REFERENCE_DATE), TEST_CONFIG);
    expect(breaks).toHaveLength(0);
  });
});

describe("precision on 10 scripted benign days", () => {
  const baselineHistory = generateSyntheticHistory({
    days: 21,
    seed: 42,
    startDate: new Date(REFERENCE_DATE.getTime() - 24 * 60 * 60 * 1000), // ends the day before the benign test days
  });

  for (let i = 0; i < 10; i++) {
    it(`benign day ${i + 1} produces zero break candidates`, () => {
      const testDay = new Date(REFERENCE_DATE.getTime() + i * 24 * 60 * 60 * 1000);
      const todayEvents = generateSyntheticHistory({ days: 1, seed: 1000 + i, startDate: testDay });
      const combined = [...baselineHistory, ...todayEvents];

      const { breaks } = evaluateEvents(combined, END_OF_DAY(testDay), TEST_CONFIG);
      expect(breaks).toHaveLength(0);
    });
  }
});

describe("recall on the 3 scripted break scenarios", () => {
  it("scenario 1: absence break escalates with evidence", () => {
    const incident = generateScriptedAbsenceIncident(21, 42, REFERENCE_DATE);
    const { breaks } = evaluateEvents(incident, END_OF_DAY(REFERENCE_DATE), TEST_CONFIG);

    const absence = breaks.find((b) => b.breakClass === "absence");
    expect(absence).toBeDefined();
    expect(absence!.reasons.length).toBeGreaterThan(0);
    expect(absence!.evidence.anchor).toBeDefined();
  });

  it("scenario 2: nocturnal anomaly escalates with evidence", () => {
    const incident = generateScriptedNocturnalIncident(21, 42, REFERENCE_DATE);
    const { breaks } = evaluateEvents(incident, END_OF_DAY(REFERENCE_DATE), TEST_CONFIG);

    const nocturnal = breaks.find((b) => b.breakClass === "nocturnal-anomaly");
    expect(nocturnal).toBeDefined();
    expect(nocturnal!.evidence.events?.length).toBeGreaterThanOrEqual(3);
  });

  it("scenario 3: sequence break escalates with evidence", () => {
    const incident = generateScriptedSequenceBreakIncident(21, 42, REFERENCE_DATE);
    const { breaks } = evaluateEvents(incident, END_OF_DAY(REFERENCE_DATE), TEST_CONFIG);

    const sequence = breaks.find((b) => b.breakClass === "sequence-break");
    expect(sequence).toBeDefined();
    expect(sequence!.evidence.events?.[0].eventType).toBe("open");
  });
});

describe("latency: hysteresis confirms at the confirmation window", () => {
  it("an absence break stays unconfirmed before the window, confirmed at/after it", () => {
    const incident = generateScriptedAbsenceIncident(21, 42, REFERENCE_DATE);
    const firstCheck = END_OF_DAY(REFERENCE_DATE);
    const first = evaluateEvents(incident, firstCheck, TEST_CONFIG);
    const absence = first.breaks.find((b) => b.breakClass === "absence");
    expect(absence?.confirmed).toBe(false);

    const laterCheck = new Date(firstCheck.getTime() + (TEST_CONFIG.confirmationPeriodMinutes + 1) * 60_000);
    const second = evaluateEvents(incident, laterCheck, TEST_CONFIG, first.breaks);
    const confirmedAbsence = second.breaks.find((b) => b.breakClass === "absence");
    expect(confirmedAbsence?.confirmed).toBe(true);
  });
});
