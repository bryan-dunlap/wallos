const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAYS,
  normalizeDisplayPowerSchedule,
  validateDisplayPowerSchedule
} = require("../../backend/display-power/display-schedule-config");
const {
  evaluateDisplaySchedule
} = require("../../backend/display-power/display-schedule-evaluator");

const TIME_ZONE = "America/Los_Angeles";

function schedule(days = {}, enabled = true) {
  return {
    enabled,
    timeZone: TIME_ZONE,
    days: Object.fromEntries(DAYS.map((day) => [day, days[day] || []]))
  };
}

function evaluate(input, iso) {
  return evaluateDisplaySchedule(input, new Date(iso));
}

test("missing, disabled, and globally empty schedules preserve always-on behavior", () => {
  assert.equal(evaluate(undefined, "2026-09-07T16:00:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(schedule({}, false), "2026-09-07T16:00:00Z").reason, "schedule-disabled");
  assert.equal(evaluate(schedule(), "2026-09-07T16:00:00Z").reason, "schedule-empty");
});

test("normalization supplies seven days and the installation timezone", () => {
  const normalized = normalizeDisplayPowerSchedule({
    enabled: true,
    days: { monday: [{ start: "09:00", end: "10:00" }] }
  });

  assert.equal(normalized.timeZone, TIME_ZONE);
  assert.deepEqual(Object.keys(normalized.days), DAYS);
  assert.deepEqual(normalized.days.monday, [{ start: "09:00", end: "10:00" }]);
});

test("weekday-specific schedules and multiple windows use inclusive/exclusive boundaries", () => {
  const configured = schedule({
    monday: [
      { start: "03:00", end: "05:30" },
      { start: "13:30", end: "21:00" }
    ],
    tuesday: [{ start: "08:00", end: "09:00" }]
  });

  assert.equal(evaluate(configured, "2026-09-07T10:00:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-09-07T12:30:00Z").baselineDesiredState, "off");
  assert.equal(evaluate(configured, "2026-09-07T20:30:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-09-08T04:00:00Z").baselineDesiredState, "off");
  assert.equal(evaluate(configured, "2026-09-08T15:00:00Z").baselineDesiredState, "on");
});

test("cross-midnight windows include previous-day spillover", () => {
  const configured = schedule({
    monday: [{ start: "22:00", end: "02:00" }]
  });

  assert.equal(evaluate(configured, "2026-09-08T06:00:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-09-08T09:00:00Z").baselineDesiredState, "off");
});

test("Sunday cross-midnight windows wrap into Monday", () => {
  const configured = schedule({
    sunday: [{ start: "23:00", end: "01:00" }]
  });

  assert.equal(evaluate(configured, "2026-09-07T07:30:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-09-07T08:00:00Z").baselineDesiredState, "off");
});

test("overlapping and adjacent windows form one interval with one next boundary", () => {
  const configured = schedule({
    monday: [
      { start: "09:00", end: "10:00" },
      { start: "09:30", end: "10:30" },
      { start: "10:30", end: "11:00" }
    ]
  });
  const result = evaluate(configured, "2026-09-07T16:15:00Z");

  assert.equal(result.baselineDesiredState, "on");
  assert.equal(result.nextBoundary, "2026-09-07T18:00:00.000Z");
});

test("next boundary is the next union start while outside windows", () => {
  const configured = schedule({
    monday: [{ start: "13:30", end: "21:00" }]
  });
  const result = evaluate(configured, "2026-09-07T19:00:00Z");

  assert.equal(result.baselineDesiredState, "off");
  assert.equal(result.nextBoundary, "2026-09-07T20:30:00.000Z");
});

test("validation rejects invalid times, timezones, and zero-length windows", () => {
  assert.throws(() => validateDisplayPowerSchedule({
    ...schedule(),
    timeZone: "Mars/Olympus_Mons"
  }), /timezone is invalid/);
  assert.throws(() => validateDisplayPowerSchedule(schedule({
    monday: [{ start: "24:00", end: "01:00" }]
  })), /time is invalid/);
  assert.throws(() => validateDisplayPowerSchedule(schedule({
    monday: [{ start: "09:00", end: "09:00" }]
  })), /zero length/);
});

test("spring-forward boundaries advance to the first valid local minute", () => {
  const configured = schedule({
    sunday: [{ start: "02:30", end: "04:00" }]
  });
  const before = evaluate(configured, "2026-03-08T09:59:00Z");
  const atBoundary = evaluate(configured, "2026-03-08T10:00:00Z");

  assert.equal(before.baselineDesiredState, "off");
  assert.equal(before.nextBoundary, "2026-03-08T10:00:00.000Z");
  assert.equal(atBoundary.baselineDesiredState, "on");
  assert.equal(atBoundary.nextBoundary, "2026-03-08T11:00:00.000Z");
});

test("fall-back uses the earlier start and later end occurrences", () => {
  const configured = schedule({
    sunday: [{ start: "01:30", end: "01:45" }]
  });

  assert.equal(evaluate(configured, "2026-11-01T08:29:00Z").baselineDesiredState, "off");
  assert.equal(evaluate(configured, "2026-11-01T08:30:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-11-01T09:30:00Z").baselineDesiredState, "on");
  assert.equal(evaluate(configured, "2026-11-01T09:45:00Z").baselineDesiredState, "off");
});
