/*
 * Shared sports team registry. Add future NFL, NBA, NHL, and MLS teams here
 * so configuration and Control continue using one source of truth.
 */
const SPORTS_TEAM_REGISTRY = [
  ["ARI", "Arizona Diamondbacks", "Diamondbacks"],
  ["ATH", "Athletics", "Athletics"],
  ["ATL", "Atlanta Braves", "Braves"],
  ["BAL", "Baltimore Orioles", "Orioles"],
  ["BOS", "Boston Red Sox", "Red Sox"],
  ["CHC", "Chicago Cubs", "Cubs"],
  ["CWS", "Chicago White Sox", "White Sox"],
  ["CIN", "Cincinnati Reds", "Reds"],
  ["CLE", "Cleveland Guardians", "Guardians"],
  ["COL", "Colorado Rockies", "Rockies"],
  ["DET", "Detroit Tigers", "Tigers"],
  ["HOU", "Houston Astros", "Astros"],
  ["KC", "Kansas City Royals", "Royals"],
  ["LAA", "Los Angeles Angels", "Angels"],
  ["LAD", "Los Angeles Dodgers", "Dodgers"],
  ["MIA", "Miami Marlins", "Marlins"],
  ["MIL", "Milwaukee Brewers", "Brewers"],
  ["MIN", "Minnesota Twins", "Twins"],
  ["NYM", "New York Mets", "Mets"],
  ["NYY", "New York Yankees", "Yankees"],
  ["PHI", "Philadelphia Phillies", "Phillies"],
  ["PIT", "Pittsburgh Pirates", "Pirates"],
  ["SD", "San Diego Padres", "Padres"],
  ["SEA", "Seattle Mariners", "Mariners"],
  ["SF", "San Francisco Giants", "Giants"],
  ["STL", "St. Louis Cardinals", "Cardinals"],
  ["TB", "Tampa Bay Rays", "Rays"],
  ["TEX", "Texas Rangers", "Rangers"],
  ["TOR", "Toronto Blue Jays", "Blue Jays"],
  ["WSH", "Washington Nationals", "Nationals"]
].map(([id, name, shortName]) => ({
  id,
  name,
  shortName,
  league: "MLB",
  sport: "baseball",
  renderer: "baseball-gamecast"
}));

function getSportsTeam(teamId) {
  if (typeof teamId !== "string") return null;

  const normalizedId = teamId.trim().toUpperCase();

  return SPORTS_TEAM_REGISTRY.find(
    (team) => team.id === normalizedId
  ) || null;
}

module.exports = {
  SPORTS_TEAM_REGISTRY,
  getSportsTeam
};
