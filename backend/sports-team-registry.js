/*
 * Shared sports team registry. MLB IDs remain unchanged for compatibility.
 * Other leagues use league-qualified IDs because abbreviations overlap across
 * sports; their normal provider-facing abbreviation remains available.
 */
const MLB_TEAMS = [
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
  abbreviation: id,
  name,
  shortName,
  league: "MLB",
  sport: "baseball",
  renderer: "baseball-gamecast",
  providerId,
  logo: `https://www.mlbstatic.com/team-logos/${providerId}.svg`
}));

const NFL_TEAMS = createLeagueTeams("NFL", "football", [
  ["ARI", "Arizona Cardinals", "Cardinals"],
  ["ATL", "Atlanta Falcons", "Falcons"],
  ["BAL", "Baltimore Ravens", "Ravens"],
  ["BUF", "Buffalo Bills", "Bills"],
  ["CAR", "Carolina Panthers", "Panthers"],
  ["CHI", "Chicago Bears", "Bears"],
  ["CIN", "Cincinnati Bengals", "Bengals"],
  ["CLE", "Cleveland Browns", "Browns"],
  ["DAL", "Dallas Cowboys", "Cowboys"],
  ["DEN", "Denver Broncos", "Broncos"],
  ["DET", "Detroit Lions", "Lions"],
  ["GB", "Green Bay Packers", "Packers"],
  ["HOU", "Houston Texans", "Texans"],
  ["IND", "Indianapolis Colts", "Colts"],
  ["JAX", "Jacksonville Jaguars", "Jaguars"],
  ["KC", "Kansas City Chiefs", "Chiefs"],
  ["LV", "Las Vegas Raiders", "Raiders"],
  ["LAC", "Los Angeles Chargers", "Chargers"],
  ["LAR", "Los Angeles Rams", "Rams"],
  ["MIA", "Miami Dolphins", "Dolphins"],
  ["MIN", "Minnesota Vikings", "Vikings"],
  ["NE", "New England Patriots", "Patriots"],
  ["NO", "New Orleans Saints", "Saints"],
  ["NYG", "New York Giants", "Giants"],
  ["NYJ", "New York Jets", "Jets"],
  ["PHI", "Philadelphia Eagles", "Eagles"],
  ["PIT", "Pittsburgh Steelers", "Steelers"],
  ["SF", "San Francisco 49ers", "49ers"],
  ["SEA", "Seattle Seahawks", "Seahawks"],
  ["TB", "Tampa Bay Buccaneers", "Buccaneers"],
  ["TEN", "Tennessee Titans", "Titans"],
  ["WAS", "Washington Commanders", "Commanders"]
]);

const NBA_TEAMS = createLeagueTeams("NBA", "basketball", [
  ["ATL", "Atlanta Hawks", "Hawks"],
  ["BOS", "Boston Celtics", "Celtics"],
  ["BKN", "Brooklyn Nets", "Nets"],
  ["CHA", "Charlotte Hornets", "Hornets"],
  ["CHI", "Chicago Bulls", "Bulls"],
  ["CLE", "Cleveland Cavaliers", "Cavaliers"],
  ["DAL", "Dallas Mavericks", "Mavericks"],
  ["DEN", "Denver Nuggets", "Nuggets"],
  ["DET", "Detroit Pistons", "Pistons"],
  ["GSW", "Golden State Warriors", "Warriors"],
  ["HOU", "Houston Rockets", "Rockets"],
  ["IND", "Indiana Pacers", "Pacers"],
  ["LAC", "Los Angeles Clippers", "Clippers"],
  ["LAL", "Los Angeles Lakers", "Lakers"],
  ["MEM", "Memphis Grizzlies", "Grizzlies"],
  ["MIA", "Miami Heat", "Heat"],
  ["MIL", "Milwaukee Bucks", "Bucks"],
  ["MIN", "Minnesota Timberwolves", "Timberwolves"],
  ["NOP", "New Orleans Pelicans", "Pelicans"],
  ["NYK", "New York Knicks", "Knicks"],
  ["OKC", "Oklahoma City Thunder", "Thunder"],
  ["ORL", "Orlando Magic", "Magic"],
  ["PHI", "Philadelphia 76ers", "76ers"],
  ["PHX", "Phoenix Suns", "Suns"],
  ["POR", "Portland Trail Blazers", "Trail Blazers"],
  ["SAC", "Sacramento Kings", "Kings"],
  ["SAS", "San Antonio Spurs", "Spurs"],
  ["TOR", "Toronto Raptors", "Raptors"],
  ["UTA", "Utah Jazz", "Jazz"],
  ["WAS", "Washington Wizards", "Wizards"]
]);

const NHL_TEAMS = createLeagueTeams("NHL", "hockey", [
  ["ANA", "Anaheim Ducks", "Ducks"],
  ["BOS", "Boston Bruins", "Bruins"],
  ["BUF", "Buffalo Sabres", "Sabres"],
  ["CGY", "Calgary Flames", "Flames"],
  ["CAR", "Carolina Hurricanes", "Hurricanes"],
  ["CHI", "Chicago Blackhawks", "Blackhawks"],
  ["COL", "Colorado Avalanche", "Avalanche"],
  ["CBJ", "Columbus Blue Jackets", "Blue Jackets"],
  ["DAL", "Dallas Stars", "Stars"],
  ["DET", "Detroit Red Wings", "Red Wings"],
  ["EDM", "Edmonton Oilers", "Oilers"],
  ["FLA", "Florida Panthers", "Panthers"],
  ["LAK", "Los Angeles Kings", "Kings"],
  ["MIN", "Minnesota Wild", "Wild"],
  ["MTL", "Montreal Canadiens", "Canadiens"],
  ["NSH", "Nashville Predators", "Predators"],
  ["NJD", "New Jersey Devils", "Devils"],
  ["NYI", "New York Islanders", "Islanders"],
  ["NYR", "New York Rangers", "Rangers"],
  ["OTT", "Ottawa Senators", "Senators"],
  ["PHI", "Philadelphia Flyers", "Flyers"],
  ["PIT", "Pittsburgh Penguins", "Penguins"],
  ["SJS", "San Jose Sharks", "Sharks"],
  ["SEA", "Seattle Kraken", "Kraken"],
  ["STL", "St. Louis Blues", "Blues"],
  ["TBL", "Tampa Bay Lightning", "Lightning"],
  ["TOR", "Toronto Maple Leafs", "Maple Leafs"],
  ["UTA", "Utah Mammoth", "Mammoth"],
  ["VAN", "Vancouver Canucks", "Canucks"],
  ["VGK", "Vegas Golden Knights", "Golden Knights"],
  ["WSH", "Washington Capitals", "Capitals"],
  ["WPG", "Winnipeg Jets", "Jets"]
]);

const SPORTS_TEAM_REGISTRY = [
  ...MLB_TEAMS,
  ...NFL_TEAMS,
  ...NBA_TEAMS,
  ...NHL_TEAMS
];

function createLeagueTeams(league, sport, teams) {
  return teams.map(([abbreviation, name, shortName]) => ({
    id: `${league}:${abbreviation}`,
    abbreviation,
    name,
    shortName,
    league,
    sport
  }));
}

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
