const {
  DAYS,
  hasConfiguredWindows,
  normalizeDisplayPowerSchedule
} = require("./display-schedule-config");

const formatterCache = new Map();

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
  }

  return formatterCache.get(timeZone);
}

function getZonedParts(instant, timeZone) {
  const parts = Object.fromEntries(
    getFormatter(timeZone)
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function dateKey(parts) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function addLocalDays(parts, amount) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getDayName(parts) {
  const dayIndex = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day)
  ).getUTCDay();

  return DAYS[dayIndex];
}

function compareLocal(first, second) {
  for (const key of ["year", "month", "day", "hour", "minute", "second"]) {
    const difference = (first[key] || 0) - (second[key] || 0);
    if (difference) return difference;
  }

  return 0;
}

function getPossibleInstants(local, timeZone) {
  const naive = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    0
  );
  const offsets = new Set();

  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = naive + hours * 60 * 60 * 1000;
    const parts = getZonedParts(sample, timeZone);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    offsets.add(representedAsUtc - sample);
  }

  return [...offsets]
    .map((offset) => naive - offset)
    .filter((instant) => compareLocal(
      getZonedParts(instant, timeZone),
      { ...local, second: 0 }
    ) === 0)
    .sort((first, second) => first - second);
}

function addLocalMinutes(local, amount) {
  const date = new Date(Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute + amount
  ));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function resolveLocalBoundary(local, timeZone, disambiguation) {
  const possible = getPossibleInstants(local, timeZone);

  if (possible.length > 0) {
    return disambiguation === "later"
      ? possible[possible.length - 1]
      : possible[0];
  }

  // A schedule has minute precision. For a nonexistent spring-forward time,
  // advance wall-clock minutes until the first representable local minute.
  for (let minutes = 1; minutes <= 24 * 60; minutes += 1) {
    const candidate = getPossibleInstants(
      addLocalMinutes(local, minutes),
      timeZone
    );

    if (candidate.length > 0) return candidate[0];
  }

  throw new Error("Unable to resolve display schedule boundary.");
}

function parseTime(value) {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function createIntervals(schedule, firstLocalDate, dayCount) {
  const intervals = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const startDate = addLocalDays(firstLocalDate, offset);
    const dayName = getDayName(startDate);

    for (const window of schedule.days[dayName]) {
      const startTime = parseTime(window.start);
      const endTime = parseTime(window.end);
      const crossesMidnight = window.end < window.start;
      const endDate = crossesMidnight
        ? addLocalDays(startDate, 1)
        : startDate;
      const start = resolveLocalBoundary(
        { ...startDate, ...startTime },
        schedule.timeZone,
        "earlier"
      );
      const end = resolveLocalBoundary(
        { ...endDate, ...endTime },
        schedule.timeZone,
        "later"
      );

      if (end > start) intervals.push({ start, end });
    }
  }

  intervals.sort((first, second) => first.start - second.start);

  return intervals.reduce((merged, interval) => {
    const previous = merged[merged.length - 1];

    if (previous && interval.start <= previous.end) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }

    return merged;
  }, []);
}

function evaluateDisplaySchedule(scheduleInput, instant = new Date()) {
  const schedule = normalizeDisplayPowerSchedule(scheduleInput);
  const now = new Date(instant).getTime();

  if (!Number.isFinite(now)) {
    throw new Error("Display schedule evaluation instant is invalid.");
  }

  if (!schedule.enabled) {
    return {
      baselineDesiredState: "on",
      reason: "schedule-disabled",
      nextBoundary: null,
      timeZone: schedule.timeZone
    };
  }

  if (!hasConfiguredWindows(schedule)) {
    return {
      baselineDesiredState: "on",
      reason: "schedule-empty",
      nextBoundary: null,
      timeZone: schedule.timeZone
    };
  }

  const currentLocalDate = getZonedParts(now, schedule.timeZone);
  const firstDate = addLocalDays(currentLocalDate, -1);
  const intervals = createIntervals(schedule, firstDate, 10);
  const active = intervals.find(
    (interval) => interval.start <= now && now < interval.end
  );
  const nextBoundaryMs = active
    ? active.end
    : intervals.find((interval) => interval.start > now)?.start;

  return {
    baselineDesiredState: active ? "on" : "off",
    reason: active ? "inside-on-window" : "outside-on-window",
    nextBoundary: Number.isFinite(nextBoundaryMs)
      ? new Date(nextBoundaryMs).toISOString()
      : null,
    timeZone: schedule.timeZone
  };
}

module.exports = {
  evaluateDisplaySchedule,
  getPossibleInstants,
  getZonedParts,
  resolveLocalBoundary
};
