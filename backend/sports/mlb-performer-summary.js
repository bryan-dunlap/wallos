function number(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function normalizeBatters(players, team) {
  return Object.values(players || {}).flatMap((entry) => {
    const stats = entry?.stats?.batting;
    const name = entry?.person?.fullName;
    if (!stats || !name) return [];
    return [{
      id: entry.person.id ?? null,
      name,
      team,
      atBats: number(stats.atBats),
      hits: number(stats.hits),
      runs: number(stats.runs),
      doubles: number(stats.doubles),
      triples: number(stats.triples),
      homeRuns: number(stats.homeRuns),
      rbi: number(stats.rbi),
      walks: number(stats.baseOnBalls)
    }];
  });
}

function normalizePitchers(players, team) {
  return Object.values(players || {}).flatMap((entry) => {
    const stats = entry?.stats?.pitching;
    const name = entry?.person?.fullName;
    if (!stats || !name) return [];
    return [{
      id: entry.person.id ?? null,
      name,
      team,
      inningsPitched: stats.inningsPitched == null ? null : String(stats.inningsPitched),
      earnedRuns: number(stats.earnedRuns),
      strikeouts: number(stats.strikeOuts),
      hitsAllowed: number(stats.hits),
      walksAllowed: number(stats.baseOnBalls),
      decision: typeof stats.note === "string" ? stats.note : null
    }];
  });
}

function compareTuple(first, second, tuple) {
  for (const select of tuple) {
    const difference = select(second) - select(first);
    if (difference) return difference;
  }
  return String(first.name).localeCompare(String(second.name)) ||
    String(first.id ?? "").localeCompare(String(second.id ?? ""));
}

function selectTopBatter(players) {
  return [...players].sort((a, b) => compareTuple(a, b, [
    (p) => p.rbi ?? 0,
    (p) => p.homeRuns ?? 0,
    (p) => (p.doubles ?? 0) + 2 * (p.triples ?? 0),
    (p) => p.hits ?? 0,
    (p) => p.runs ?? 0,
    (p) => p.walks ?? 0
  ]))[0] || null;
}

function inningsToOuts(value) {
  const match = String(value ?? "").match(/^(\d+)\.(\d)$/);
  return match ? Number(match[1]) * 3 + Math.min(Number(match[2]), 2) : 0;
}

function selectTopPitcher(players) {
  return [...players].sort((a, b) => compareTuple(a, b, [
    (p) => inningsToOuts(p.inningsPitched),
    (p) => -(p.earnedRuns ?? 0),
    (p) => p.strikeouts ?? 0,
    (p) => -((p.hitsAllowed ?? 0) + (p.walksAllowed ?? 0))
  ]))[0] || null;
}

function formatBatter(player) {
  if (!player) return null;
  const line = [];
  if (player.hits !== null && player.atBats !== null) line.push(`${player.hits}–${player.atBats}`);
  if (player.homeRuns) line.push(player.homeRuns === 1 ? "HR" : `${player.homeRuns} HR`);
  if (player.triples) line.push(player.triples === 1 ? "3B" : `${player.triples} 3B`);
  if (player.doubles) line.push(player.doubles === 1 ? "2B" : `${player.doubles} 2B`);
  if (player.rbi) line.push(player.rbi === 1 ? "RBI" : `${player.rbi} RBI`);
  if (player.runs) line.push(player.runs === 1 ? "R" : `${player.runs} R`);
  if (player.walks) line.push(player.walks === 1 ? "BB" : `${player.walks} BB`);
  return { role: "Batter", name: player.name, summary: line.slice(0, 4).join(" · ") };
}

function formatPitcher(player) {
  if (!player) return null;
  const line = [];
  if (player.inningsPitched !== null) line.push(`${player.inningsPitched} IP`);
  if (player.earnedRuns !== null) line.push(`${player.earnedRuns} ER`);
  if (player.strikeouts !== null) line.push(`${player.strikeouts} K`);
  return { role: "Pitcher", name: player.name, summary: line.join(" · ") };
}

function createMlbFeaturedPerformers(feed, eventId, stale = false) {
  const teams = feed?.liveData?.boxscore?.teams || {};
  const normalizeTeam = (side) => {
    const group = teams[side] || {};
    const team = side;
    const entries = [
      formatBatter(selectTopBatter(normalizeBatters(group.players, team))),
      formatPitcher(selectTopPitcher(normalizePitchers(group.players, team)))
    ].filter((entry) => entry?.summary);
    return {
      association: side,
      name: group.team?.teamName || group.team?.name || side,
      entries
    };
  };
  return {
    schemaVersion: 1,
    league: "MLB",
    eventId: String(eventId),
    stale: stale === true,
    teams: { away: normalizeTeam("away"), home: normalizeTeam("home") }
  };
}

module.exports = {
  createMlbFeaturedPerformers,
  formatBatter,
  formatPitcher,
  inningsToOuts,
  normalizeBatters,
  normalizePitchers,
  selectTopBatter,
  selectTopPitcher
};
