const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createDisplayScheduleStatus,
  getDisplaySchedulePresentationGroups,
  resolveDisplayPowerScheduleUpdate
} = require("../../backend/server");

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "backend", "server.js"),
  "utf8"
);
const configuredSchedule = {
  enabled: true,
  timeZone: "America/Los_Angeles",
  days: {
    sunday: [],
    monday: [
      { start: "03:00", end: "05:30" },
      { start: "13:30", end: "21:00" }
    ],
    tuesday: [{ start: "22:00", end: "02:00" }],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: []
  }
};

test("Control renders the compact Display Schedule builder", () => {
  assert.match(serverSource, /data-settings-target="display-schedule"/);
  assert.match(serverSource, /data-settings-panel="display-schedule"/);
  assert.match(serverSource, /name="powerScheduleEnabled"/);
  assert.match(serverSource, /name="powerScheduleDraft"/);
  assert.match(serverSource, /id="display-schedule-day-group"/);
  assert.match(serverSource, /id="display-schedule-start"/);
  assert.match(serverSource, /id="display-schedule-end"/);
  assert.match(serverSource, /data-add-display-schedule-window>Add to schedule/);
  assert.match(serverSource, /data-display-schedule-summary/);
});

test("builder exposes every group and individual day option", () => {
  for (const [value, label] of [
    ["every-day", "Every Day"],
    ["weekdays", "Weekdays"],
    ["weekend", "Weekend"]
  ]) {
    assert.match(serverSource, new RegExp(`\\["${value}", "${label}"\\]`));
  }
  for (const [day, label] of [
    ["monday", "Monday"], ["tuesday", "Tuesday"],
    ["wednesday", "Wednesday"], ["thursday", "Thursday"],
    ["friday", "Friday"], ["saturday", "Saturday"],
    ["sunday", "Sunday"]
  ]) {
    assert.match(serverSource, new RegExp(`${day}: "${label}"`));
  }
});

test("time selectors use 15-minute HH:mm values with natural labels", () => {
  assert.match(serverSource, /Array\.from\(\{ length: 96 \}/);
  assert.match(serverSource, /\(index % 4\) \* 15/);
  assert.match(serverSource, /formatDisplayScheduleTime\(value\)/);
  assert.equal(serverSource.includes('type="time"'), false);
});

test("day groups expand into existing seven-day draft arrays", () => {
  assert.match(serverSource, /"every-day": allDays/);
  assert.match(serverSource, /weekdays,\s*weekend/);
  assert.match(serverSource, /dayGroups\[dayGroup\.value\] \|\| \[dayGroup\.value\]/);
  assert.match(serverSource, /getSelectedDays\(\)\.forEach\(\(day\) =>/);
  assert.match(serverSource, /draft\[day\]\.push\(\{ \.\.\.window \}\)/);
});

test("builder accepts cross-midnight values but prevents equal boundaries", () => {
  assert.match(serverSource, /startSelect\.value === endSelect\.value/);
  assert.match(serverSource, /Start and end times must be different/);
  const saved = resolveDisplayPowerScheduleUpdate(configuredSchedule, {
    enabled: true,
    daysDraft: JSON.stringify(configuredSchedule.days)
  });
  assert.deepEqual(saved.days.tuesday, [{ start: "22:00", end: "02:00" }]);
});

test("builder changes remain local until Save Changes", () => {
  assert.match(serverSource, /draftField\.value = JSON\.stringify\(draft\)/);
  assert.match(serverSource, /<form class="settings-form" method="post" action="\/control">/);
  assert.match(serverSource, /Save Changes/);
  assert.doesNotMatch(serverSource, /data-add-display-window/);
  assert.doesNotMatch(serverSource, /data-copy-display-windows/);
});

test("Display Schedule fields participate in Control dirty state", () => {
  assert.match(serverSource, /"powerScheduleEnabled"/);
  assert.match(serverSource, /"powerScheduleDraft"/);
  assert.match(serverSource, /draftField\.dispatchEvent\(new Event\("input"/);
});

test("save normalization persists and reloads weekday and cross-midnight windows", () => {
  const saved = resolveDisplayPowerScheduleUpdate(configuredSchedule, {
    enabled: true,
    daysDraft: JSON.stringify(configuredSchedule.days)
  });
  const reloaded = resolveDisplayPowerScheduleUpdate(saved, {
    enabled: saved.enabled,
    daysDraft: JSON.stringify(saved.days)
  });

  assert.deepEqual(reloaded, configuredSchedule);
  assert.equal(reloaded.days.monday.length, 2);
  assert.deepEqual(reloaded.days.tuesday, [
    { start: "22:00", end: "02:00" }
  ]);
});

function daysWith(assignments) {
  return Object.fromEntries([
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
  ].map((day) => [day, assignments[day] || []]));
}

const morning = [{ start: "08:00", end: "09:00" }];

test("identical seven-day schedules are presented as Every Day", () => {
  const groups = getDisplaySchedulePresentationGroups(daysWith(
    Object.fromEntries([
      "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
    ].map((day) => [day, morning]))
  ));
  assert.deepEqual(groups.map(({ label }) => label), ["Every Day"]);
  assert.equal(groups[0].days.length, 7);
});

test("identical weekday and weekend schedules group conservatively", () => {
  const days = daysWith({
    monday: morning,
    tuesday: morning,
    wednesday: morning,
    thursday: morning,
    friday: morning,
    saturday: [{ start: "10:00", end: "11:00" }],
    sunday: [{ start: "10:00", end: "11:00" }]
  });
  assert.deepEqual(
    getDisplaySchedulePresentationGroups(days).map(({ label }) => label),
    ["Weekdays", "Weekend"]
  );
});

test("non-identical schedules remain individual", () => {
  const groups = getDisplaySchedulePresentationGroups(daysWith({
    monday: morning,
    tuesday: [{ start: "09:00", end: "10:00" }],
    saturday: morning,
    sunday: [{ start: "10:00", end: "11:00" }]
  }));
  assert.deepEqual(
    groups.map(({ label }) => label),
    ["Monday", "Tuesday", "Saturday", "Sunday"]
  );
});

test("summary Remove targets every represented day or one individual day", () => {
  assert.match(serverSource, /row\.dataset\.days\.split\(","\)\.forEach\(\(day\) =>/);
  assert.match(serverSource, /group\.days\.join\(","\)/);
  assert.match(serverSource, /createGroup\(dayLabels\[day\], \[day\]\)/);
  assert.match(serverSource, /draft\[day\]\.splice\(index, 1\)/);
});

test("schedule summary groups flow compactly without implicit row stretching", () => {
  assert.match(
    serverSource,
    /\.schedule-summary \{[^}]*grid-auto-rows: max-content;[^}]*align-content: start;[^}]*gap: 20px;/
  );
  assert.match(
    serverSource,
    /\.schedule-summary-group \{[^}]*align-content: start;[^}]*gap: 8px;/
  );
  assert.doesNotMatch(serverSource, /grid-row: 1 \/ span 99/);
});

test("backend save validation rejects malformed and zero-length times", () => {
  assert.throws(() => resolveDisplayPowerScheduleUpdate(configuredSchedule, {
    enabled: true,
    daysDraft: JSON.stringify({
      ...configuredSchedule.days,
      monday: [{ start: "25:00", end: "09:00" }]
    })
  }), /time is invalid/);
  assert.throws(() => resolveDisplayPowerScheduleUpdate(configuredSchedule, {
    enabled: true,
    daysDraft: JSON.stringify({
      ...configuredSchedule.days,
      monday: [{ start: "09:00", end: "09:00" }]
    })
  }), /zero length/);
});

test("status copy covers disabled, empty, boundaries, and attention overrides", () => {
  assert.equal(createDisplayScheduleStatus({
    schedulingEnabled: false
  }), "Scheduling disabled — display stays on");
  assert.equal(createDisplayScheduleStatus({
    schedulingEnabled: true,
    scheduleEmpty: true
  }), "No windows configured — display stays on");
  assert.equal(createDisplayScheduleStatus({
    schedulingEnabled: true,
    scheduleEmpty: false,
    attentionOverrideActive: true,
    baselineDesiredState: "off"
  }), "Kept on by attention override");
  assert.equal(createDisplayScheduleStatus({
    schedulingEnabled: true,
    scheduleEmpty: false,
    attentionOverrideActive: false,
    baselineDesiredState: "off",
    nextBoundary: "2026-09-07T20:30:00.000Z",
    timeZone: "America/Los_Angeles"
  }), "Scheduled off now · turns on at 1:30 PM");
});

test("Control refreshes safe runtime status without expanding public config", () => {
  assert.match(serverSource, /app\.get\("\/api\/display-power\/status"/);
  assert.match(serverSource, /fetch\("\/api\/display-power\/status"\)/);
  assert.match(serverSource, /data-display-schedule-status/);
  assert.match(serverSource, /setInterval\(refreshStatus, 30 \* 1000\)/);
});

test("successful Control save updates the running scheduler after persistence", () => {
  assert.match(
    serverSource,
    /await writeConfig\(config\);\s*await displayPowerRuntime\.updateSchedule/
  );
});

test("Control contains no platform-specific display command configuration", () => {
  for (const command of ["xset", "xrandr", "vcgencmd", "cec-client", "dpms"]) {
    assert.equal(serverSource.toLowerCase().includes(command), false);
  }
});
