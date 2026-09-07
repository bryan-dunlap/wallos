function qualifyTeamPaletteId(league, team = {}) {
  const normalizedLeague = normalizeLeague(league);
  if (!normalizedLeague) return null;

  const existingId = normalizeIdentityPart(team.id);
  if (existingId?.startsWith(`${normalizedLeague}:`)) return existingId;

  const localId = normalizeIdentityPart(team.abbreviation) || existingId;
  if (!localId || localId.includes(":")) return null;
  return `${normalizedLeague}:${localId}`;
}

function enqueueTeamPaletteResolution({
  resolver,
  league,
  team,
  logger = console
} = {}) {
  const teamId = qualifyTeamPaletteId(league, team);
  const logoUrl = typeof team?.logo === "string" ? team.logo.trim() : "";
  if (!resolver || !teamId || !logoUrl) return false;

  Promise.resolve()
    .then(() => resolver.resolve({ teamId, logoUrl }))
    .catch(() => {
      if (typeof logger?.warn === "function") {
        logger.warn(`Team palette pre-resolution failed for ${teamId}.`);
      }
    });
  return true;
}

function enqueueFavoriteTeamPalettes(resolver, favoriteTeams, options = {}) {
  return (Array.isArray(favoriteTeams) ? favoriteTeams : []).reduce(
    (count, team) => count + Number(enqueueTeamPaletteResolution({
      resolver,
      league: team?.league,
      team,
      logger: options.logger
    })),
    0
  );
}

function enqueueSportsEventPalettes(
  resolver,
  league,
  sportsEvents,
  options = {}
) {
  let count = 0;
  for (const event of Array.isArray(sportsEvents) ? sportsEvents : []) {
    const teams = event?.teams || {
      away: event?.awayTeam,
      home: event?.homeTeam
    };
    for (const team of [teams?.away, teams?.home]) {
      count += Number(enqueueTeamPaletteResolution({
        resolver,
        league,
        team,
        logger: options.logger
      }));
    }
  }
  return count;
}

function enqueueSportsSchedulePalettes(resolver, league, schedule, options = {}) {
  return enqueueSportsEventPalettes(
    resolver,
    league,
    schedule?.sportsEvents,
    options
  );
}

function enqueueAggregateSportsPalettes(resolver, acquisition, options = {}) {
  return (Array.isArray(acquisition?.leagues) ? acquisition.leagues : []).reduce(
    (count, result) => count + enqueueSportsEventPalettes(
      resolver,
      result?.league,
      result?.sportsEvents,
      options
    ),
    0
  );
}

function enqueueGamecastPalettes(resolver, league, result, options = {}) {
  const gamecast = result?.gamecast || result;
  if (!gamecast?.teams) return 0;

  return enqueueSportsEventPalettes(resolver, league, [{
    teams: gamecast.teams
  }], options);
}

function normalizeLeague(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]*$/.test(normalized) ? normalized : null;
}

function normalizeIdentityPart(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9:_-]*$/.test(normalized) ? normalized : null;
}

module.exports = {
  enqueueAggregateSportsPalettes,
  enqueueFavoriteTeamPalettes,
  enqueueGamecastPalettes,
  enqueueSportsEventPalettes,
  enqueueSportsSchedulePalettes,
  enqueueTeamPaletteResolution,
  qualifyTeamPaletteId
};
