const {
  fetchScoreboard,
  fetchSummary,
  toNullableNumber
} = require("./espn-client");

function clampFieldCoordinate(value) {
  const number = toNullableNumber(value);

  return number === null ? null : Math.min(100, Math.max(0, number));
}

function toCanonicalFieldCoordinate(espnYardLine) {
  const yardLine = toNullableNumber(espnYardLine);

  return yardLine === null
    ? null
    : clampFieldCoordinate(100 - yardLine);
}

function normalizeStatus(status = {}) {
  const state = String(status?.type?.state || "").toLowerCase();

  if (state === "in") return "live";
  if (state === "post") return "final";
  if (state === "pre") return "scheduled";
  return "unknown";
}

function getTeamLogo(team = {}) {
  if (team.logo) return team.logo;

  const logos = Array.isArray(team.logos) ? team.logos : [];
  const defaultLogo = logos.find(
    (logo) => Array.isArray(logo?.rel) && logo.rel.includes("default")
  );

  return defaultLogo?.href || logos[0]?.href || null;
}

function normalizeTeam(competitor = {}) {
  const team = competitor.team || {};
  const abbreviation = String(team.abbreviation || "")
    .trim()
    .toUpperCase();

  return {
    id: abbreviation ? `NFL:${abbreviation}` : null,
    providerId: team.id == null ? null : String(team.id),
    abbreviation,
    name: team.displayName || team.name || null,
    shortName:
      team.shortDisplayName || team.nickname || team.name || null,
    logo: getTeamLogo(team)
  };
}

function getCompetition(payload) {
  return payload?.competitions?.[0] ||
    payload?.header?.competitions?.[0] ||
    null;
}

function getCompetitor(competition, homeAway) {
  return (Array.isArray(competition?.competitors)
    ? competition.competitors
    : []).find((competitor) => competitor?.homeAway === homeAway) || null;
}

function chooseCompetitor(scoreboardCompetition, summaryCompetition, side) {
  return getCompetitor(scoreboardCompetition, side) ||
    getCompetitor(summaryCompetition, side) ||
    {};
}

function getSelectedDrive(summary = {}) {
  if (summary?.drives?.current) return summary.drives.current;

  const previous = Array.isArray(summary?.drives?.previous)
    ? summary.drives.previous
    : [];

  return previous.length > 0 ? previous.at(-1) : null;
}

function getLastPlay(situation, drive) {
  if (situation?.lastPlay?.text) return situation.lastPlay;

  const plays = Array.isArray(drive?.plays) ? drive.plays : [];

  return [...plays].reverse().find((play) => play?.text) || null;
}

function matchTeamSide(providerId, teams) {
  if (providerId === null || providerId === undefined) return null;

  const normalizedId = String(providerId);

  if (teams.away.providerId === normalizedId) return "away";
  if (teams.home.providerId === normalizedId) return "home";
  return null;
}

function normalizeFieldPoint(point) {
  if (!point) return null;

  return {
    yardLine: toCanonicalFieldCoordinate(point.yardLine),
    yardsToEndzone: toNullableNumber(point.yardsToEndzone),
    fieldPositionText:
      point.possessionText || point.text || null,
    down: toNullableNumber(point.down),
    distance: toNullableNumber(point.distance)
  };
}

function deriveFirstDownYardLine(yardLine, distance, possessionTeam) {
  if (
    yardLine === null ||
    distance === null ||
    !["away", "home"].includes(possessionTeam)
  ) {
    return null;
  }

  const direction = possessionTeam === "away" ? 1 : -1;
  return clampFieldCoordinate(yardLine + direction * distance);
}

function normalizeSituation(situation, lastPlay, drive, teams) {
  const fallbackPoint = lastPlay?.end || drive?.end || null;
  const providerTeamId = situation?.possession ??
    fallbackPoint?.team?.id ??
    drive?.team?.id ??
    null;
  const team = matchTeamSide(providerTeamId, teams);
  const yardLine = toCanonicalFieldCoordinate(
    situation?.yardLine ?? fallbackPoint?.yardLine
  );
  const distance = toNullableNumber(
    situation?.distance ?? fallbackPoint?.distance
  );

  return {
    possession: {
      team,
      providerTeamId: providerTeamId == null
        ? null
        : String(providerTeamId)
    },
    situation: {
      down: toNullableNumber(situation?.down ?? fallbackPoint?.down),
      distance,
      shortText:
        situation?.shortDownDistanceText ||
        fallbackPoint?.shortDownDistanceText ||
        null,
      fieldPositionText:
        situation?.possessionText ||
        fallbackPoint?.possessionText ||
        fallbackPoint?.text ||
        null,
      yardLine,
      yardsToEndzone: toNullableNumber(
        situation?.yardsToEndzone ?? fallbackPoint?.yardsToEndzone
      ),
      firstDownYardLine: deriveFirstDownYardLine(
        yardLine,
        distance,
        team
      ),
      redZone: typeof situation?.isRedZone === "boolean"
        ? situation.isRedZone
        : null
    }
  };
}

function normalizeDrive(drive, teams) {
  if (!drive) return null;

  return {
    team: matchTeamSide(drive.team?.id, teams),
    plays: toNullableNumber(drive.offensivePlays),
    yards: toNullableNumber(drive.yards),
    elapsed: drive.timeElapsed?.displayValue || null,
    result: drive.result || null,
    start: normalizeFieldPoint(drive.start),
    end: normalizeFieldPoint(drive.end)
  };
}

function normalizePlay(play) {
  if (!play?.text) return null;

  return {
    description: play.text,
    type: play.type?.text || null,
    quarter: toNullableNumber(play.period?.number),
    clock: play.clock?.displayValue || null,
    start: normalizeFieldPoint(play.start),
    end: normalizeFieldPoint(play.end)
  };
}

function getPeriodScores(competitor = {}) {
  const scores = new Map();
  const linescores = Array.isArray(competitor.linescores)
    ? competitor.linescores
    : [];

  linescores.forEach((lineScore, index) => {
    const period = toNullableNumber(lineScore?.period) ?? index + 1;

    if (Number.isInteger(period) && period > 0) {
      scores.set(
        period,
        toNullableNumber(lineScore?.value ?? lineScore?.displayValue)
      );
    }
  });

  return scores;
}

function sumOvertime(scores) {
  const overtime = [...scores.entries()]
    .filter(([period]) => period > 4)
    .map(([, score]) => score)
    .filter((score) => score !== null);

  return overtime.length > 0
    ? overtime.reduce((sum, score) => sum + score, 0)
    : null;
}

function normalizeLineScore(awayCompetitor, homeCompetitor) {
  const awayScores = getPeriodScores(awayCompetitor);
  const homeScores = getPeriodScores(homeCompetitor);
  const maxPeriod = Math.max(
    4,
    ...awayScores.keys(),
    ...homeScores.keys()
  );
  const periods = Array.from(
    { length: maxPeriod },
    (_, index) => index + 1
  );

  return {
    periods,
    away: periods.map((period) => awayScores.get(period) ?? null),
    home: periods.map((period) => homeScores.get(period) ?? null),
    overtime: {
      away: sumOvertime(awayScores),
      home: sumOvertime(homeScores)
    }
  };
}

function getPhase(status, quarter) {
  const name = String(status?.type?.name || "").toUpperCase();

  if (normalizeStatus(status) === "final") return "final";
  if (name.includes("HALFTIME")) return "halftime";
  if (quarter > 4 || name.includes("OVERTIME")) return "overtime";
  return normalizeStatus(status) === "live" ? "regulation" : null;
}

function normalizeNflGamecast(scoreboardEvent, summary = {}) {
  const scoreboardCompetition = getCompetition(scoreboardEvent);
  const summaryCompetition = getCompetition(summary);
  const awayCompetitor = chooseCompetitor(
    scoreboardCompetition,
    summaryCompetition,
    "away"
  );
  const homeCompetitor = chooseCompetitor(
    scoreboardCompetition,
    summaryCompetition,
    "home"
  );
  const teams = {
    away: normalizeTeam(awayCompetitor),
    home: normalizeTeam(homeCompetitor)
  };
  const status = summaryCompetition?.status ||
    scoreboardCompetition?.status ||
    scoreboardEvent?.status ||
    {};
  const quarter = toNullableNumber(
    status.period ?? scoreboardEvent?.status?.period
  );
  const drive = getSelectedDrive(summary);
  const scoreboardSituation = scoreboardCompetition?.situation || null;
  const lastPlay = getLastPlay(scoreboardSituation, drive);
  const normalizedSituation = normalizeSituation(
    scoreboardSituation,
    lastPlay,
    drive,
    teams
  );

  return {
    status: normalizeStatus(status),
    eventId: String(
      scoreboardEvent?.id ?? summaryCompetition?.id ?? ""
    ) || null,
    teams,
    score: {
      away: toNullableNumber(awayCompetitor.score),
      home: toNullableNumber(homeCompetitor.score)
    },
    gameState: {
      quarter,
      clock: status.displayClock || null,
      phase: getPhase(status, quarter)
    },
    possession: normalizedSituation.possession,
    situation: normalizedSituation.situation,
    drive: normalizeDrive(drive, teams),
    lastPlay: normalizePlay(lastPlay),
    lineScore: normalizeLineScore(awayCompetitor, homeCompetitor)
  };
}

async function acquireNflGamecast(requestedDate, eventId, options = {}) {
  const requestOptions = {
    sport: "football",
    league: "nfl",
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    signal: options.signal
  };
  const [scoreboard, summary] = await Promise.all([
    fetchScoreboard({
      ...requestOptions,
      date: requestedDate
    }),
    fetchSummary({
      ...requestOptions,
      eventId
    })
  ]);
  const event = (Array.isArray(scoreboard?.events)
    ? scoreboard.events
    : []).find((candidate) => String(candidate?.id) === String(eventId));

  if (!event) {
    throw new Error(`NFL Gamecast event ${eventId} was not found.`);
  }

  return normalizeNflGamecast(event, summary);
}

module.exports = {
  acquireNflGamecast,
  clampFieldCoordinate,
  deriveFirstDownYardLine,
  normalizeNflGamecast,
  toCanonicalFieldCoordinate
};
