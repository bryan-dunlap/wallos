const { getSportsTeam } = require("../sports-team-registry");
const {
  fetchScoreboard,
  toNullableNumber
} = require("./espn-client");

const MLB_LIVE_CACHE_MS = 4 * 1000;
const MLB_SCHEDULED_CACHE_MS = 5 * 60 * 1000;
const MLB_FINAL_CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DISPLAY_TIME_ZONE = "America/Los_Angeles";

const mlbDailyScheduleCache = new Map();

function formatMlbScheduledTime(
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

function normalizeMlbStatus(status = {}) {
  const providerState = String(status?.type?.state || "")
    .trim()
    .toLowerCase();

  if (providerState === "in") return "Live";
  if (providerState === "post") return "Final";
  if (providerState === "pre") return "Preview";

  return "Preview";
}

function getMlbStatusDetail(status = {}, normalizedStatus) {
  return status?.type?.shortDetail ||
    status?.type?.detail ||
    status?.type?.description ||
    normalizedStatus;
}

function parseMlbRecord(competitor = {}) {
  const records = Array.isArray(competitor.records)
    ? competitor.records
    : [];
  const summary = String(
    records.find((record) => record?.type === "total")?.summary ||
    records[0]?.summary ||
    ""
  );
  const values = summary.match(/^(\d+)-(\d+)(?:-(\d+))?$/);

  return values
    ? {
        wins: Number(values[1]),
        losses: Number(values[2]),
        ties: values[3] ? Number(values[3]) : 0
      }
    : {
        wins: null,
        losses: null,
        ties: null
      };
}

function getMlbStatistic(competitor, name) {
  const statistic = (Array.isArray(competitor?.statistics)
    ? competitor.statistics
    : []).find((entry) => entry?.name === name);

  return toNullableNumber(statistic?.value ?? statistic?.displayValue);
}

function normalizeMlbTeam(competitor, normalizedStatus) {
  const team = competitor?.team || {};
  const abbreviation = String(team.abbreviation || "")
    .trim()
    .toUpperCase();
  const registryTeam = getSportsTeam(abbreviation);
  const score = normalizedStatus === "Preview"
    ? null
    : toNullableNumber(competitor?.score);

  return {
    id: registryTeam?.providerId ?? null,
    abbreviation,
    name: team.displayName || team.name || "Team TBD",
    shortName:
      team.shortDisplayName ||
      team.name ||
      registryTeam?.shortName ||
      "Team TBD",
    providerId: registryTeam?.providerId ?? null,
    espnProviderId: team.id ?? null,
    logo: team.logo || null,
    record: parseMlbRecord(competitor),
    score,
    runs: score,
    hits: toNullableNumber(competitor?.hits) ??
      getMlbStatistic(competitor, "hits"),
    errors: toNullableNumber(competitor?.errors) ??
      getMlbStatistic(competitor, "errors")
  };
}

function normalizeInningHalf(competition, status) {
  const value = String(
    competition?.situation?.lastPlay?.period?.type ||
    competition?.situation?.period?.type ||
    status?.periodPrefix ||
    ""
  ).trim().toLowerCase();

  if (value === "top") return "Top";
  if (value === "bottom") return "Bottom";
  return null;
}

function getInningScores(competitor) {
  const scores = new Map();

  for (const lineScore of Array.isArray(competitor?.linescores)
    ? competitor.linescores
    : []) {
    const inning = Number(lineScore?.period);

    if (Number.isInteger(inning) && inning > 0) {
      scores.set(
        inning,
        toNullableNumber(lineScore?.value ?? lineScore?.displayValue)
      );
    }
  }

  return scores;
}

function normalizeMlbLineScore(competition, away, home, status) {
  const awayScores = getInningScores(away);
  const homeScores = getInningScores(home);
  const innings = [...new Set([
    ...awayScores.keys(),
    ...homeScores.keys()
  ])].sort((first, second) => first - second);
  const statusPeriod = toNullableNumber(status?.period);
  const inningNumber = Number.isInteger(statusPeriod) && statusPeriod > 0
    ? statusPeriod
    : innings.at(-1) ?? null;

  if (
    inningNumber === null &&
    innings.length === 0 &&
    !competition?.situation
  ) {
    return null;
  }

  return {
    innings: innings.map((number) => ({
      number,
      away: awayScores.get(number) ?? null,
      home: homeScores.get(number) ?? null
    })),
    inning: {
      number: inningNumber,
      half: normalizeInningHalf(competition, status)
    },
    outs: null,
    count: { balls: null, strikes: null },
    bases: {
      first: { occupied: false, runner: null },
      second: { occupied: false, runner: null },
      third: { occupied: false, runner: null }
    },
    batter: null,
    pitcher: null
  };
}

function normalizeMlbGame(
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
  const normalizedStatus = normalizeMlbStatus(status);
  const scheduledAt = competition.date || event?.date || null;

  return {
    eventId: event?.id ?? competition?.id ?? null,
    espnEventId: event?.id ?? competition?.id ?? null,
    sport: "MLB",
    date: requestedDate,
    scheduledAt,
    scheduledTime: formatMlbScheduledTime(scheduledAt, timeZone),
    status: {
      state: normalizedStatus,
      detail: getMlbStatusDetail(status, normalizedStatus)
    },
    awayTeam: normalizeMlbTeam(away, normalizedStatus),
    homeTeam: normalizeMlbTeam(home, normalizedStatus),
    linescore: normalizeMlbLineScore(
      competition,
      away,
      home,
      status
    ),
    venue: {
      id: competition?.venue?.id ?? null,
      name: competition?.venue?.fullName || ""
    }
  };
}

function getMlbScheduleCacheTtl(sportsEvents) {
  const hasLiveGame = sportsEvents.some(
    (event) => event.status.state === "Live"
  );

  if (hasLiveGame) return MLB_LIVE_CACHE_MS;

  const allGamesFinal = sportsEvents.length > 0 && sportsEvents.every(
    (event) => event.status.state === "Final"
  );

  return allGamesFinal
    ? MLB_FINAL_CACHE_MS
    : MLB_SCHEDULED_CACHE_MS;
}

async function acquireMlbDailySchedule(requestedDate, options = {}) {
  const cache = options.cache || mlbDailyScheduleCache;
  const now = options.now || Date.now;
  const cachedSchedule = cache.get(requestedDate);

  try {
    if (
      cachedSchedule &&
      now() - cachedSchedule.timestamp < cachedSchedule.ttl
    ) {
      return cachedSchedule.data;
    }

    const payload = await fetchScoreboard({
      sport: "baseball",
      league: "mlb",
      date: requestedDate,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.timeoutMs,
      signal: options.signal
    });
    const sportsEvents = (Array.isArray(payload?.events)
      ? payload.events
      : [])
      .map((event) =>
        normalizeMlbGame(event, requestedDate, options.timeZone)
      )
      .sort(
        (firstEvent, secondEvent) =>
          new Date(firstEvent.scheduledAt || 0) -
          new Date(secondEvent.scheduledAt || 0)
      );
    const responseData = {
      sport: "MLB",
      date: requestedDate,
      sportsEvents,
      updatedAt: new Date(now()).toISOString()
    };

    cache.set(requestedDate, {
      timestamp: now(),
      ttl: getMlbScheduleCacheTtl(sportsEvents),
      data: responseData
    });

    return responseData;
  } catch (error) {
    console.error("MLB daily schedule API error:", error);

    if (cachedSchedule?.data) {
      return { ...cachedSchedule.data, stale: true };
    }

    throw error;
  }
}

module.exports = {
  acquireMlbDailySchedule,
  formatMlbScheduledTime,
  getMlbScheduleCacheTtl,
  mlbDailyScheduleCache,
  normalizeMlbGame,
  normalizeMlbStatus,
  MLB_FINAL_CACHE_MS,
  MLB_LIVE_CACHE_MS,
  MLB_SCHEDULED_CACHE_MS
};
