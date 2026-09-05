const DAYS = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
]);

const DEFAULT_DISPLAY_TIME_ZONE = "America/Los_Angeles";
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidTimeZone(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value.trim() });
    return true;
  } catch {
    return false;
  }
}

function createEmptyDays() {
  return Object.fromEntries(DAYS.map((day) => [day, []]));
}

function normalizeWindow(window) {
  const start = typeof window?.start === "string"
    ? window.start.trim()
    : "";
  const end = typeof window?.end === "string"
    ? window.end.trim()
    : "";

  if (
    !TIME_PATTERN.test(start) ||
    !TIME_PATTERN.test(end) ||
    start === end
  ) {
    return null;
  }

  return { start, end };
}

function normalizeDisplayPowerSchedule(
  schedule,
  { defaultTimeZone = DEFAULT_DISPLAY_TIME_ZONE } = {}
) {
  const fallbackTimeZone = isValidTimeZone(defaultTimeZone)
    ? defaultTimeZone.trim()
    : DEFAULT_DISPLAY_TIME_ZONE;
  const timeZone = isValidTimeZone(schedule?.timeZone)
    ? schedule.timeZone.trim()
    : fallbackTimeZone;
  const days = createEmptyDays();

  DAYS.forEach((day) => {
    const windows = Array.isArray(schedule?.days?.[day])
      ? schedule.days[day]
      : [];

    days[day] = windows
      .map(normalizeWindow)
      .filter(Boolean)
      .sort((first, second) =>
        first.start.localeCompare(second.start) ||
        first.end.localeCompare(second.end)
      );
  });

  return {
    enabled: typeof schedule?.enabled === "boolean"
      ? schedule.enabled
      : false,
    timeZone,
    days
  };
}

function validateDisplayPowerSchedule(
  schedule,
  { defaultTimeZone = DEFAULT_DISPLAY_TIME_ZONE } = {}
) {
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) {
    throw new Error("Display power schedule must be an object.");
  }

  if (typeof schedule.enabled !== "boolean") {
    throw new Error("Display power schedule enabled must be a boolean.");
  }

  if (!isValidTimeZone(schedule.timeZone)) {
    throw new Error("Display power schedule timezone is invalid.");
  }

  if (!schedule.days || typeof schedule.days !== "object") {
    throw new Error("Display power schedule days are invalid.");
  }

  for (const day of DAYS) {
    const windows = schedule.days[day];

    if (windows !== undefined && !Array.isArray(windows)) {
      throw new Error(`Display power schedule ${day} windows are invalid.`);
    }

    for (const window of windows || []) {
      const start = typeof window?.start === "string"
        ? window.start.trim()
        : "";
      const end = typeof window?.end === "string"
        ? window.end.trim()
        : "";

      if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end)) {
        throw new Error(`Display power schedule ${day} time is invalid.`);
      }

      if (start === end) {
        throw new Error(
          `Display power schedule ${day} window must not be zero length.`
        );
      }
    }
  }

  return normalizeDisplayPowerSchedule(schedule, { defaultTimeZone });
}

function hasConfiguredWindows(schedule) {
  return DAYS.some((day) => schedule.days[day].length > 0);
}

module.exports = {
  DAYS,
  DEFAULT_DISPLAY_TIME_ZONE,
  TIME_PATTERN,
  hasConfiguredWindows,
  isValidTimeZone,
  normalizeDisplayPowerSchedule,
  validateDisplayPowerSchedule
};
