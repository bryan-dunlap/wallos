/*
 * Shared sports team registry. Add future NFL, NBA, NHL, and MLS teams here
 * so configuration and Control continue using one source of truth.
 */
const SPORTS_TEAM_REGISTRY = [
  ["ARI", "Arizona Diamondbacks", "Diamondbacks", 109],
  ["ATH", "Athletics", "Athletics", 133],
  ["ATL", "Atlanta Braves", "Braves", 144],
  ["BAL", "Baltimore Orioles", "Orioles", 110],
  ["BOS", "Boston Red Sox", "Red Sox", 111],
  ["CHC", "Chicago Cubs", "Cubs", 112],
  ["CWS", "Chicago White Sox", "White Sox", 145],
  ["CIN", "Cincinnati Reds", "Reds", 113],
  ["CLE", "Cleveland Guardians", "Guardians", 114],
  ["COL", "Colorado Rockies", "Rockies", 115],
  ["DET", "Detroit Tigers", "Tigers", 116],
  ["HOU", "Houston Astros", "Astros", 117],
  ["KC", "Kansas City Royals", "Royals", 118],
  ["LAA", "Los Angeles Angels", "Angels", 108],
  ["LAD", "Los Angeles Dodgers", "Dodgers", 119],
  ["MIA", "Miami Marlins", "Marlins", 146],
  ["MIL", "Milwaukee Brewers", "Brewers", 158],
  ["MIN", "Minnesota Twins", "Twins", 142],
  ["NYM", "New York Mets", "Mets", 121],
  ["NYY", "New York Yankees", "Yankees", 147],
  ["PHI", "Philadelphia Phillies", "Phillies", 143],
  ["PIT", "Pittsburgh Pirates", "Pirates", 134],
  ["SD", "San Diego Padres", "Padres", 135],
  ["SEA", "Seattle Mariners", "Mariners", 136],
  ["SF", "San Francisco Giants", "Giants", 137],
  ["STL", "St. Louis Cardinals", "Cardinals", 138],
  ["TB", "Tampa Bay Rays", "Rays", 139],
  ["TEX", "Texas Rangers", "Rangers", 140],
  ["TOR", "Toronto Blue Jays", "Blue Jays", 141],
  ["WSH", "Washington Nationals", "Nationals", 120]
].map(([id, name, shortName, providerId]) => ({
  id,
  name,
  shortName,
  league: "MLB",
  sport: "baseball",
  renderer: "baseball-gamecast",
  providerId,
  logo: `https://www.mlbstatic.com/team-logos/${providerId}.svg`
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
