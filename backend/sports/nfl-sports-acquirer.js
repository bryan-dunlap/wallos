const {
  fetchScoreboard,
  toNullableNumber
} = require("./espn-client");

const NFL_LIVE_CACHE_MS = 15 * 1000;
const NFL_SCHEDULED_CACHE_MS = 5 * 60 * 1000;
const NFL_FINAL_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DISPLAY_TIME_ZONE = "America/Los_Angeles";

const nflDailyScheduleCache = new Map();

function normalizeNflStatus(status) {
  const state = String(status?.type?.state || status || "")
    .trim()
    .toLowerCase();
  const name = String(status?.type?.name || "")
    .trim()
    .toUpperCase();

  if (name.includes("POSTPONED")) return "postponed";
  if (name.includes("CANCELED") || name.includes("CANCELLED")) {
    return "canceled";
  }
  if (name.includes("DELAYED")) return "delayed";
  if (name.includes("SUSPENDED")) return "suspended";

  const statusMap = {
    pre: "scheduled",
    in: "live",
    post: "final",
    scheduled: "scheduled",
    in_progress: "live",
    final: "final"
  };

  return statusMap[state] || "unknown";
}

function formatNflScheduledTime(
  dateValue,
  timeZone = DEFAULT_DISPLAY_TIME_ZONE
) {
  if (!dateValue) return null;

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(date);
}

function normalizeNflTeam(competitor, statusState) {
  const team = competitor?.team || {};
  const abbreviation = String(team.abbreviation || "")
    .trim()
    .toUpperCase();
  const overallRecord = (Array.isArray(competitor?.records)
    ? competitor.records
    : []).find((record) => record?.type === "total") ||
    competitor?.records?.[0];

  return {
    id: abbreviation ? `NFL:${abbreviation}` : null,
    providerId: team.id ?? null,
    name: team.displayName || team.name || "",
    shortName: team.shortDisplayName || team.name || "",
    abbreviation,
    score: statusState === "scheduled"
      ? null
      : toNullableNumber(competitor?.score),
    logo: team.logo || null,
    record: overallRecord?.summary || null
  };
}

function getPeriodScores(competitor) {
  const scores = new Map();

  for (const lineScore of Array.isArray(competitor?.linescores)
    ? competitor.linescores
    : []) {
    const period = Number(lineScore?.period);

    if (Number.isInteger(period) && period > 0) {
      scores.set(period, toNullableNumber(lineScore?.value));
    }
  }

  return scores;
}

function getQuarterScores(competitor) {
  const scores = getPeriodScores(competitor);
  return [1, 2, 3, 4].map((period) => scores.get(period) ?? null);
}

function getOvertimeScore(competitor) {
  const scores = getPeriodScores(competitor);
  const overtimeValues = [...scores.entries()]
    .filter(([period]) => period > 4)
    .map(([, score]) => score)
    .filter((score) => score !== null);

  return overtimeValues.length > 0
    ? overtimeValues.reduce((total, score) => total + score, 0)
    : null;
}

function getStatusDetail(status, normalizedStatus) {
  return status?.type?.shortDetail ||
    status?.type?.detail ||
    status?.type?.description ||
    normalizedStatus;
}

function getGamePhase(status) {
  const name = String(status?.type?.name || "").toUpperCase();

  if (name.includes("HALFTIME")) return "halftime";
  if (Number(status?.period) > 4 || name.includes("OVERTIME")) {
    return "overtime";
  }

  return null;
}

function normalizeNflGame(
  event,
  requestedDate,
  timeZone = DEFAULT_DISPLAY_TIME_ZONE
) {
  const competition = event?.competitions?.[0] || {};
  const competitors = Array.isArray(competition.competitors)
    ? competition.competitors
    : [];
  const away = competitors.find(
    (competitor) => competitor?.homeAway === "away"
  );
  const home = competitors.find(
    (competitor) => competitor?.homeAway === "home"
  );
  const status = competition.status || event?.status || {};
  const normalizedStatus = normalizeNflStatus(status);
  const scheduledAt = competition.date || event?.date || null;

  return {
    eventId: event?.id ?? competition?.id ?? null,
    sport: "NFL",
    date: requestedDate,
    scheduledAt,
    scheduledTime: formatNflScheduledTime(scheduledAt, timeZone),
    status: {
      state: normalizedStatus,
      detail: getStatusDetail(status, normalizedStatus)
    },
    awayTeam: normalizeNflTeam(away, normalizedStatus),
    homeTeam: normalizeNflTeam(home, normalizedStatus),
    state: {
      period: toNullableNumber(status?.period),
      clock: status?.displayClock ||
        (status?.clock === null || status?.clock === undefined
          ? null
          : String(status.clock)),
      quarters: {
        away: getQuarterScores(away),
        home: getQuarterScores(home)
      },
      overtime: {
        away: getOvertimeScore(away),
        home: getOvertimeScore(home)
      },
      phase: getGamePhase(status)
    },
    venue: {
      id: competition?.venue?.id ?? null,
      name: competition?.venue?.fullName || ""
    }
  };
}

function getNflScheduleCacheTtl(sportsEvents) {
  const hasLiveGame = sportsEvents.some(
    (event) => event.status.state === "live"
  );

  if (hasLiveGame) return NFL_LIVE_CACHE_MS;

  const allGamesFinal =
    sportsEvents.length > 0 &&
    sportsEvents.every(
      (event) => event.status.state === "final"
    );

  return allGamesFinal
    ? NFL_FINAL_CACHE_MS
    : NFL_SCHEDULED_CACHE_MS;
}

async function acquireNflDailySchedule(
  requestedDate,
  options = {}
) {
  const cache = options.cache || nflDailyScheduleCache;
  const fetchImpl = options.fetchImpl || global.fetch;
  const now = options.now || Date.now;
  const timeZone = options.timeZone || DEFAULT_DISPLAY_TIME_ZONE;
  const cachedSchedule = cache.get(requestedDate);

  try {
    const cacheIsValid =
      cachedSchedule &&
      now() - cachedSchedule.timestamp < cachedSchedule.ttl;

    if (cacheIsValid) return cachedSchedule.data;

    const payload = await fetchScoreboard({
      sport: "football",
      league: "nfl",
      date: requestedDate,
      fetchImpl,
      timeoutMs: options.timeoutMs,
      signal: options.signal
    });
    const sportsEvents = (Array.isArray(payload?.events)
      ? payload.events
      : [])
      .map((event) =>
        normalizeNflGame(event, requestedDate, timeZone)
      )
      .sort(
        (firstEvent, secondEvent) =>
          new Date(firstEvent.scheduledAt || 0) -
          new Date(secondEvent.scheduledAt || 0)
      );
    const responseData = {
      sport: "NFL",
      date: requestedDate,
      sportsEvents,
      updatedAt: new Date(now()).toISOString()
    };

    cache.set(requestedDate, {
      timestamp: now(),
      ttl: getNflScheduleCacheTtl(sportsEvents),
      data: responseData
    });

    return responseData;
  } catch (error) {
    console.error("NFL daily schedule API error:", error);

    if (cachedSchedule?.data) {
      return {
        ...cachedSchedule.data,
        stale: true
      };
    }

    throw error;
  }
}

module.exports = {
  acquireNflDailySchedule,
  getNflScheduleCacheTtl,
  nflDailyScheduleCache,
  normalizeNflGame,
  normalizeNflStatus,
  NFL_FINAL_CACHE_MS,
  NFL_LIVE_CACHE_MS,
  NFL_SCHEDULED_CACHE_MS
};
