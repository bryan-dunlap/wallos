const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  SPORTS_TEAM_REGISTRY,
  getSportsTeam
} = require("./sports-team-registry");
const {
  sportsSimulationProfileRegistry
} = require(
  "../frontend/providers/sports-simulation-profile-registry"
);
const CalendarProviderRegistry = require(
  "../frontend/providers/calendar-provider-registry"
);
const DemoCalendarDataProvider = require(
  "../frontend/providers/demo-calendar-data-provider"
);
const {
  IcalCalendarProvider
} = require("./calendar/ical-calendar-provider");
const {
  normalizeCalendarSources,
  createPublicCalendarConfig
} = require("./calendar/calendar-source-config");
const {
  LEGACY_REDDIT_FEED_URL,
  normalizeDiscoverySources,
  normalizeDiscoverySourceAddress,
  createPublicDiscoveryConfig
} = require("./discovery/discovery-source-config");
const {
  DiscoverySourceAdapterRegistry
} = require("./discovery/discovery-source-adapter-registry");
const {
  RssDiscoveryAdapter
} = require("./discovery/rss-discovery-adapter");
const {
  parseRedditFeed
} = require("./discovery/reddit-feed-parser");
const {
  DiscoveryAggregator
} = require("./discovery/discovery-aggregator");

const app = express();
const PORT = 3000;

const frontendPath = path.join(__dirname, "..", "frontend");
const configPath = path.join(__dirname, "..", "config.json");
const calendarProviderRegistry = new CalendarProviderRegistry();
calendarProviderRegistry.register(new DemoCalendarDataProvider());
const icalCalendarProvider = new IcalCalendarProvider();
calendarProviderRegistry.register(icalCalendarProvider);
const defaultCalendarProvider =
  calendarProviderRegistry.getDefault().id;
const sportsSimulationProfiles =
  sportsSimulationProfileRegistry.getMetadata();

/* ==========================
   Configuration
========================== */

const WEATHER_CACHE_MS = 30 * 60 * 1000;

const DEFAULT_CONFIG = {
  location: {
    query: "98402"
  },
  sports: {
    primaryLeague: "MLB",
    enabled: true,
    widget: {
      enabled: true,
      leagues: ["MLB"]
    },
    favoriteTeams: [
      {
        id: "SEA",
        name: "Seattle Mariners",
        league: "MLB",
        sport: "baseball",
        renderer: "baseball-gamecast",
        providerId: 136,
        logo: "https://www.mlbstatic.com/team-logos/136.svg"
      }
    ]
  },
  display: {
    theme: "mosaic"
  },
  profile: {
    name: ""
  },
  calendar: {
    enabled: true,
    provider: defaultCalendarProvider,
    sources: []
  },
  discovery: {
    enabled: true,
    sources: []
  }
};
const SUPPORTED_LEAGUES = ["MLB", "NFL", "NBA", "NHL"];
const SUPPORTED_THEMES = [
  "mosaic",
  "terminal",
  "retro-future",
  "light",
  "minimal",
  "90s-remix",
  "steampunk",
  "groovy",
  "yacht-rock"
];

const MARINERS_TEAM_ID = 136;
const SPORTS_CACHE_MS = 6 * 60 * 60 * 1000;
const MLB_LIVE_CACHE_MS = 4 * 1000;
const MLB_SCHEDULED_CACHE_MS = 5 * 60 * 1000;
const MLB_FINAL_CACHE_MS = 6 * 60 * 60 * 1000;
const MLB_PLAYER_SEASON_CACHE_MS = 30 * 60 * 1000;

const REDDIT_FEED_URL = LEGACY_REDDIT_FEED_URL;

const REDDIT_CACHE_MS = 15 * 60 * 1000;

const DISPLAY_TIME_ZONE = "America/Los_Angeles";

/* ==========================
   Caches
========================== */

let weatherCache = {
  timestamp: 0,
  locationQuery: null,
  data: null
};

let marinersCache = {
  timestamp: 0,
  data: null
};

const mlbDailyScheduleCache = new Map();
const mlbPlayerSeasonStatsCache = new Map();

let redditCache = {
  timestamp: 0,
  data: null
};

const discoverySourceAdapterRegistry =
  new DiscoverySourceAdapterRegistry();
discoverySourceAdapterRegistry.register(
  new RssDiscoveryAdapter()
);
const discoverySourceTypeMetadata =
  discoverySourceAdapterRegistry.getMetadata();
const discoveryAggregator = new DiscoveryAggregator(
  discoverySourceAdapterRegistry
);

/* ==========================
   Static Frontend
========================== */

app.use(express.static(frontendPath));
app.use(express.urlencoded({ extended: false }));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ==========================
   Mosaic Configuration
========================== */

function readConfig() {
  try {
    const savedConfig = JSON.parse(
      fs.readFileSync(configPath, "utf8")
    );
    const locationQuery = savedConfig?.location?.query;
    const primaryLeague = savedConfig?.sports?.primaryLeague;
    const sportsEnabled = savedConfig?.sports?.enabled;
    const sportsWidget = normalizeSportsWidget(
      savedConfig?.sports?.widget
    );
    const favoriteTeams = normalizeFavoriteTeams(
      savedConfig?.sports
    );
    const theme = savedConfig?.display?.theme;
    const profileName = savedConfig?.profile?.name;
    const calendarEnabled = savedConfig?.calendar?.enabled;
    const configuredCalendarProvider =
      savedConfig?.calendar?.provider;
    const calendarSources = normalizeCalendarSources(
      savedConfig?.calendar?.sources
    );
    const calendarProviderId =
      configuredCalendarProvider === defaultCalendarProvider &&
      calendarSources.length > 0
        ? icalCalendarProvider.id
        : configuredCalendarProvider;
    const calendarProvider = calendarProviderRegistry.get(
      calendarProviderId
    ) || calendarProviderRegistry.getDefault();
    const discoveryEnabled = savedConfig?.discovery?.enabled;
    const discoverySources = normalizeDiscoverySources(
      savedConfig?.discovery?.sources
    );

    return {
      location: {
        query:
          typeof locationQuery === "string" &&
          locationQuery.trim()
            ? locationQuery
            : DEFAULT_CONFIG.location.query
      },
      sports: {
        primaryLeague: SUPPORTED_LEAGUES.includes(primaryLeague)
          ? primaryLeague
          : DEFAULT_CONFIG.sports.primaryLeague,
        enabled: typeof sportsEnabled === "boolean"
          ? sportsEnabled
          : DEFAULT_CONFIG.sports.enabled,
        widget: sportsWidget,
        favoriteTeams
      },
      display: {
        theme: SUPPORTED_THEMES.includes(theme)
          ? theme
          : DEFAULT_CONFIG.display.theme
      },
      profile: {
        name: typeof profileName === "string"
          ? profileName
          : DEFAULT_CONFIG.profile.name
      },
      calendar: {
        enabled: typeof calendarEnabled === "boolean"
          ? calendarEnabled
          : DEFAULT_CONFIG.calendar.enabled,
        provider: calendarProvider.id,
        sources: calendarSources
      },
      discovery: {
        enabled: typeof discoveryEnabled === "boolean"
          ? discoveryEnabled
          : DEFAULT_CONFIG.discovery.enabled,
        sources: discoverySources
      }
    };
  } catch (error) {
    console.error("Unable to read config.json; using defaults:", error);
    return structuredClone(DEFAULT_CONFIG);
  }
}

function normalizeFavoriteTeams(sportsConfig) {
  const configuredTeams = Array.isArray(sportsConfig?.favoriteTeams)
    ? sportsConfig.favoriteTeams
    : typeof sportsConfig?.favoriteTeam === "string"
      ? [sportsConfig.favoriteTeam]
      : DEFAULT_CONFIG.sports.favoriteTeams;
  const seenTeamIds = new Set();

  return configuredTeams.reduce((favorites, configuredTeam) => {
    const teamId = typeof configuredTeam === "string"
      ? configuredTeam
      : configuredTeam?.id;
    const team = getSportsTeam(teamId);

    if (!team || seenTeamIds.has(team.id)) return favorites;

    seenTeamIds.add(team.id);
    favorites.push({
      id: team.id,
      name: team.name,
      league: team.league,
      sport: team.sport,
      ...(team.renderer ? { renderer: team.renderer } : {}),
      ...(Number.isFinite(team.providerId)
        ? { providerId: team.providerId }
        : {}),
      ...(team.logo ? { logo: team.logo } : {})
    });

    return favorites;
  }, []);
}

function normalizeSportsWidget(widgetConfig) {
  const configuredLeagues = Array.isArray(widgetConfig?.leagues)
    ? widgetConfig.leagues
    : DEFAULT_CONFIG.sports.widget.leagues;

  return {
    enabled: typeof widgetConfig?.enabled === "boolean"
      ? widgetConfig.enabled
      : DEFAULT_CONFIG.sports.widget.enabled,
    leagues: [
      ...new Set(
        configuredLeagues.filter((league) =>
          SUPPORTED_LEAGUES.includes(league)
        )
      )
    ]
  };
}

function resolveCalendarSourceDraft(value, configuredSources) {
  let draft = null;

  try {
    draft = JSON.parse(value);
  } catch (error) {
    throw new Error("Calendar sources are invalid.");
  }

  if (!Array.isArray(draft)) {
    throw new Error("Calendar sources are invalid.");
  }

  const configuredById = new Map(
    configuredSources.map((source) => [source.id, source])
  );
  const seenIds = new Set();
  const resolvedSources = draft.map((entry) => {
    const id = typeof entry?.id === "string"
      ? entry.id.trim()
      : "";

    if (!id || seenIds.has(id)) {
      throw new Error("Calendar sources are invalid.");
    }

    seenIds.add(id);
    const configuredSource = configuredById.get(id);

    if (configuredSource) {
      return {
        ...configuredSource,
        enabled: entry.enabled !== false
      };
    }

    const [newSource] = normalizeCalendarSources([entry]);

    if (!newSource) {
      throw new Error("Calendar sources are invalid.");
    }

    return newSource;
  });
  const sourceUrls = resolvedSources.map((source) => source.url);

  if (new Set(sourceUrls).size !== sourceUrls.length) {
    throw new Error("That Calendar source is already configured.");
  }

  return resolvedSources;
}

function resolveDiscoverySourceDraft(value, configuredSources) {
  let draft = null;

  try {
    draft = JSON.parse(value);
  } catch (error) {
    throw new Error("Discovery sources are invalid.");
  }

  if (!Array.isArray(draft)) {
    throw new Error("Discovery sources are invalid.");
  }

  const configuredById = new Map(
    configuredSources.map((source) => [source.id, source])
  );
  const seenIds = new Set();
  const resolvedSources = draft.map((entry) => {
    const id = typeof entry?.id === "string"
      ? entry.id.trim()
      : "";

    if (!id || seenIds.has(id)) {
      throw new Error("Discovery sources are invalid.");
    }

    seenIds.add(id);
    const configuredSource = configuredById.get(id);

    if (
      configuredSource &&
      (typeof entry?.name !== "string" || !entry?.config)
    ) {
      return {
        ...configuredSource,
        enabled: entry.enabled !== false
      };
    }

    const adapterMetadata = discoverySourceTypeMetadata.find(
      (metadata) =>
        metadata.type === entry?.type && metadata.userAddable
    );
    const normalizedSource = normalizeDiscoverySources([entry])
      .find((source) => source.id === id);

    if (!adapterMetadata || !normalizedSource) {
      throw new Error("Discovery sources are invalid.");
    }

    return normalizedSource;
  });
  const builtInSources = configuredSources.filter((source) => {
    const metadata = discoverySourceTypeMetadata.find(
      (candidate) => candidate.type === source.type
    );

    return metadata?.userAddable !== true;
  });

  builtInSources.forEach((source) => {
    if (!seenIds.has(source.id)) {
      resolvedSources.unshift(source);
      seenIds.add(source.id);
    }
  });

  const sourceKeys = resolvedSources
    .filter((source) => source.config?.url)
    .map((source) => `${source.type}:${source.config.url}`);

  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error("That Discovery source is already configured.");
  }

  return resolvedSources;
}

function validateConfigUpdate(
  locationQuery,
  primaryLeague,
  theme,
  profileName,
  calendarEnabled,
  calendarProvider,
  calendarSources,
  sportsEnabled,
  sportsWidgetEnabled,
  sportsWidgetLeagues,
  favoriteTeams,
  discoveryEnabled,
  discoverySources
) {
  if (
    typeof locationQuery !== "string" ||
    !locationQuery.trim()
  ) {
    throw new Error("Location must not be empty.");
  }

  if (!SUPPORTED_LEAGUES.includes(primaryLeague)) {
    throw new Error("League must be MLB, NFL, NBA, or NHL.");
  }

  if (!SUPPORTED_THEMES.includes(theme)) {
    throw new Error("Theme selection is invalid.");
  }

  if (typeof profileName !== "string") {
    throw new Error("Display name must be a string.");
  }

  if (typeof calendarEnabled !== "boolean") {
    throw new Error("Calendar enabled must be a boolean.");
  }

  if (!calendarProviderRegistry.get(calendarProvider)) {
    throw new Error("Calendar provider is invalid.");
  }

  if (typeof sportsEnabled !== "boolean") {
    throw new Error("Sports enabled must be a boolean.");
  }

  if (typeof sportsWidgetEnabled !== "boolean") {
    throw new Error("Sports Widget enabled must be a boolean.");
  }

  if (
    !Array.isArray(sportsWidgetLeagues) ||
    sportsWidgetLeagues.some(
      (league) => !SUPPORTED_LEAGUES.includes(league)
    )
  ) {
    throw new Error("Sports Widget leagues are invalid.");
  }

  if (!Array.isArray(favoriteTeams)) {
    throw new Error("Favorite teams must be an array.");
  }

  if (typeof discoveryEnabled !== "boolean") {
    throw new Error("Discovery enabled must be a boolean.");
  }

  if (!Array.isArray(discoverySources)) {
    throw new Error("Discovery sources must be an array.");
  }

  return {
    location: {
      query: locationQuery
    },
    sports: {
      primaryLeague,
      enabled: sportsEnabled,
      widget: normalizeSportsWidget({
        enabled: sportsWidgetEnabled,
        leagues: sportsWidgetLeagues
      }),
      favoriteTeams: normalizeFavoriteTeams({ favoriteTeams })
    },
    display: {
      theme
    },
    profile: {
      name: profileName
    },
    calendar: {
      enabled: calendarEnabled,
      provider: calendarProvider,
      sources: normalizeCalendarSources(calendarSources)
    },
    discovery: {
      enabled: discoveryEnabled,
      sources: normalizeDiscoverySources(discoverySources)
    }
  };
}

async function writeConfig(config) {
  const temporaryPath = `${configPath}.tmp-${process.pid}-${Date.now()}`;

  try {
    await fs.promises.writeFile(
      temporaryPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8"
    );
    await fs.promises.rename(temporaryPath, configPath);
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

app.get("/control", (req, res) => {
  const config = readConfig();
  const configurationSaved = req.query?.saved === "1";
  const leagueOptions = SUPPORTED_LEAGUES.map(
    (league) =>
      `<option value="${league}"${
        league === config.sports.primaryLeague ? " selected" : ""
      }>${league}</option>`
  ).join("");
  const selectedSportsWidgetLeagues = new Set(
    config.sports.widget.leagues
  );
  const sportsWidgetLeagueRows = config.sports.widget.leagues
    .map((league) => `
      <li class="item-row" data-sports-widget-league-row data-league="${league}">
        <span class="item-copy"><strong>${league}</strong></span>
        <button class="button button-quiet" type="button" data-remove-sports-widget-league>Remove</button>
        <input name="sportsWidgetLeagues" type="hidden" value="${league}">
      </li>`)
    .join("");
  const availableSportsWidgetLeagues = SUPPORTED_LEAGUES.filter(
    (league) => !selectedSportsWidgetLeagues.has(league)
  );
  const sportsWidgetLeagueOptions = availableSportsWidgetLeagues
    .map((league) => `<option value="${league}">${league}</option>`)
    .join("");
  const supportedSportsWidgetLeaguesJson = JSON.stringify(
    SUPPORTED_LEAGUES
  );
  const themeLabels = {
    mosaic: "Mosaic",
    terminal: "Terminal",
    "retro-future": "Retro Future",
    light: "Light",
    minimal: "Minimal",
    "90s-remix": "90s Remix",
    steampunk: "Steampunk",
    groovy: "Groovy",
    "yacht-rock": "Yacht Rock"
  };
  const themeOptions = SUPPORTED_THEMES.map(
    (theme) =>
      `<option value="${theme}"${
        theme === config.display.theme ? " selected" : ""
      }>${themeLabels[theme]}</option>`
  ).join("");
  const favoriteTeamIds = new Set(
    config.sports.favoriteTeams.map((team) => team.id)
  );
  const availableFavoriteTeams = SPORTS_TEAM_REGISTRY
    .filter((team) => !favoriteTeamIds.has(team.id));
  const teamOptions = availableFavoriteTeams
    .filter((team) => team.league === config.sports.primaryLeague)
    .map((team) =>
      `<option value="${team.id}">${escapeHtml(team.name)} (${team.league})</option>`
    )
    .join("");
  const favoriteTeamRegistryJson = JSON.stringify(
    SPORTS_TEAM_REGISTRY.map((team) => ({
      id: team.id,
      name: team.name,
      league: team.league
    }))
  ).replace(/</g, "\\u003c");
  const favoriteTeamRows = config.sports.favoriteTeams
    .map((team) => `
        <li class="item-row" data-favorite-team-row data-team-id="${escapeHtml(team.id)}">
          <span class="item-copy"><strong>${escapeHtml(team.name)}</strong><small>${team.league}</small></span>
          <button class="button button-quiet" type="button" data-remove-favorite-team>Remove</button>
          <input name="favoriteTeams" type="hidden" value="${escapeHtml(team.id)}">
        </li>`).join("");
  const sportsSimulationProfileOptions = sportsSimulationProfiles
    .map((profile) =>
      `<option value="${profile.id}">${escapeHtml(profile.name)}</option>`
    )
    .join("");
  const initialSportsSimulationScenarios =
    sportsSimulationProfiles[0]?.scenarios || [];
  const sportsSimulationScenarioOptions =
    initialSportsSimulationScenarios.map((scenario) =>
      `<option value="${scenario.id}">${escapeHtml(scenario.label)}</option>`
    ).join("");
  const sportsSimulationProfilesJson = JSON.stringify(
    sportsSimulationProfiles
  ).replace(/</g, "\\u003c");
  const calendarSourceDraft = JSON.stringify(
    config.calendar.sources.map((source) => ({
      id: source.id,
      enabled: source.enabled
    }))
  );
  const calendarSourceRows = config.calendar.sources
    .map((source) => `
        <li class="item-row" data-calendar-source-row data-source-id="${escapeHtml(source.id)}">
          <span class="item-copy"><strong><span class="status-dot${source.enabled ? " is-enabled" : ""}"></span>${escapeHtml(source.name)}</strong><small>${source.enabled ? "Enabled" : "Disabled"}</small></span>
          <span data-calendar-source-actions>
            <button class="button button-quiet" type="button" data-toggle-calendar-source>${source.enabled ? "Disable" : "Enable"}</button>
            <button class="button button-quiet" type="button" data-remove-calendar-source>Remove</button>
          </span>
          <div class="inline-confirmation" data-calendar-source-confirmation hidden>
            <strong>Remove ${escapeHtml(source.name)}?</strong>
            <p>This will stop Mosaic from displaying events from this calendar.</p>
            <div class="button-row">
              <button class="button button-quiet" type="button" data-cancel-calendar-source-removal>Cancel</button>
              <button class="button button-danger" type="button" data-confirm-calendar-source-removal>Remove Calendar</button>
            </div>
          </div>
        </li>`).join("");
  const discoveryTypeLabels = new Map(
    discoverySourceTypeMetadata.map((metadata) => [
      metadata.type,
      metadata.name
    ])
  );
  const discoverySourceDraft = JSON.stringify(
    config.discovery.sources
  );
  const discoverySourceRows = config.discovery.sources
    .map((source) => {
        const sourceMetadata = discoverySourceTypeMetadata.find(
          (metadata) => metadata.type === source.type
        );
        const canRemove = sourceMetadata?.userAddable === true;
        const sourceStatus = source.enabled ? "Enabled" : "Disabled";
        const sourceKind = escapeHtml(
          discoveryTypeLabels.get(source.type) || source.type
        );
        const sourceUrl = source.config?.url || "";

        return `
        <li class="item-row" data-discovery-source-row data-source-id="${escapeHtml(source.id)}" data-source-removable="${canRemove}">
          <span class="item-copy"><strong><span class="status-dot${source.enabled ? " is-enabled" : ""}"></span><span data-discovery-source-name>${escapeHtml(source.name)}</span></strong><small>${sourceKind} · ${sourceStatus}${canRemove ? "" : " · Built-in"}</small><span class="source-address">${escapeHtml(sourceUrl)}</span></span>
          <span data-discovery-source-actions>
            <button class="button button-quiet" type="button" data-toggle-discovery-source>${source.enabled ? "Disable" : "Enable"}</button>
            <button class="button button-quiet" type="button" data-edit-discovery-source>Edit</button>
            ${canRemove ? "<button class=\"button button-quiet\" type=\"button\" data-remove-discovery-source>Remove</button>" : ""}
          </span>
          ${canRemove ? `
          <div class="inline-confirmation" data-discovery-source-confirmation hidden>
            <strong>Remove ${escapeHtml(source.name)}?</strong>
            <p>This will stop Mosaic from displaying items from this source.</p>
            <div class="button-row">
              <button class="button button-quiet" type="button" data-cancel-discovery-source-removal>Cancel</button>
              <button class="button button-danger" type="button" data-confirm-discovery-source-removal>Remove Source</button>
            </div>
          </div>` : ""}
        </li>`;
      }).join("");

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mosaic Control</title>
  <style>
    :root {
      --control-selector-width: 360px;
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #18222f;
      background: #d8e1e9;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 10% 3%, rgba(218, 230, 239, .78), transparent 34%), radial-gradient(circle at 88% 16%, rgba(170, 193, 213, .42), transparent 36%), radial-gradient(circle at 46% 92%, rgba(194, 202, 218, .3), transparent 38%), linear-gradient(145deg, #dfe7ee 0%, #ced9e2 52%, #dae2e9 100%); background-attachment: fixed; }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    .control-shell { width: min(1380px, calc(100% - 32px)); margin: 0 auto; padding: 30px 0 24px; }
    .control-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
    .eyebrow { margin: 0 0 8px; color: #64748b; font-size: .75rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.04em; }
    .control-intro { max-width: 620px; margin: 10px 0 0; color: #64748b; line-height: 1.6; }
    .settings-form { display: grid; gap: 24px; }
    .settings-surface { display: grid; gap: 24px; padding: 28px; border: 1px solid rgba(241, 247, 251, .54); border-radius: 24px; background: linear-gradient(145deg, rgba(222, 233, 242, .78), rgba(202, 217, 229, .65)); box-shadow: 0 26px 70px rgba(43, 58, 76, .16), 0 3px 12px rgba(43, 58, 76, .08), inset 0 1px 0 rgba(246, 250, 253, .72), inset 0 -1px 0 rgba(73, 94, 116, .09); backdrop-filter: blur(24px) saturate(120%); }
    .section-heading { grid-column: 1 / -1; margin: 16px 0 -8px; padding-top: 24px; border-top: 1px solid rgba(100, 116, 139, .16); }
    .settings-surface > .section-heading:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
    .section-heading h2 { margin: 0; font-size: 1.25rem; }
    .section-heading p { margin: 5px 0 0; color: #64748b; }
    .card-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
    .settings-card { min-width: 0; padding: 24px; border: 1px solid rgba(235, 243, 248, .38); border-radius: 16px; background: linear-gradient(150deg, rgba(198, 213, 225, .82), rgba(178, 198, 214, .72)); box-shadow: 0 16px 40px 2px rgba(43, 58, 76, .17), 0 5px 14px rgba(43, 58, 76, .09), inset 0 1px 0 rgba(241, 247, 250, .5), inset 0 -1px 0 rgba(65, 85, 106, .1); backdrop-filter: blur(12px) saturate(112%); }
    .settings-card-wide { grid-column: 1 / -1; }
    .card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
    .card-header h3 { margin: 0; font-size: 1.08rem; }
    .card-description { margin: 5px 0 0; color: #64748b; font-size: .9rem; line-height: 1.45; }
    .settings-content { margin-top: 22px; padding-top: 20px; border-top: 1px solid #e5e9ef; }
    .field { display: grid; gap: 7px; }
    .field-full { grid-column: 1 / -1; }
    .field label { color: #334155; font-size: .84rem; font-weight: 650; }
    input[type="text"], input[type="url"], select { min-height: 44px; padding: 10px 12px; color: #172033; border: 1px solid rgba(91, 115, 139, .24); border-radius: 10px; background: rgba(229, 238, 245, .78); box-shadow: inset 0 1px 2px rgba(43, 58, 76, .065), 0 1px 0 rgba(246, 250, 253, .55); backdrop-filter: blur(8px); }
    input[type="text"], input[type="url"] { width: 100%; }
    select { width: min(100%, var(--control-selector-width)); max-width: 100%; }
    input:focus, select:focus, button:focus-visible { outline: 3px solid rgba(37, 99, 235, .16); outline-offset: 2px; border-color: rgba(37, 99, 235, .58); }
    .switch { position: relative; display: inline-flex; align-items: center; gap: 9px; color: #64748b; font-size: .78rem; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    .switch input { position: absolute; opacity: 0; pointer-events: none; }
    .switch-track { position: relative; width: 44px; height: 24px; border-radius: 999px; background: #cbd5e1; transition: background .18s ease; }
    .switch-track::after { content: ""; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #edf3f7; box-shadow: 0 2px 5px rgba(15, 23, 42, .22); transition: transform .18s ease; }
    .switch input:checked + .switch-track { background: #2563eb; }
    .switch input:checked + .switch-track::after { transform: translateX(20px); }
    .switch-state::before { content: "Off"; }
    .switch input:checked ~ .switch-state::before { content: "On"; color: #1d4ed8; }
    .subsection-title { margin: 22px 0 10px; font-size: .86rem; letter-spacing: .04em; text-transform: uppercase; color: #64748b; }
    .item-list { display: grid; gap: 9px; margin: 0; padding: 0; list-style: none; }
    .item-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 13px 14px; border: 1px solid rgba(239, 246, 250, .42); border-radius: 11px; background: rgba(203, 218, 230, .5); box-shadow: inset 0 1px 0 rgba(244, 249, 252, .46); }
    .item-copy { display: grid; gap: 3px; min-width: 0; }
    .item-copy strong { overflow: hidden; text-overflow: ellipsis; }
    .item-copy small { color: #64748b; }
    .source-address { min-width: 0; color: #526174; font-size: .78rem; line-height: 1.4; overflow-wrap: anywhere; }
    [data-calendar-source-actions], [data-discovery-source-actions] { display: flex; gap: 6px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #94a3b8; }
    .status-dot.is-enabled { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, .12); }
    .empty-state { padding: 16px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 11px; text-align: center; }
    .button-row { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; }
    .control-selection-row { display: grid; grid-template-columns: minmax(0, 1fr); gap: 7px; width: min(100%, var(--control-selector-width)); min-width: 0; }
    .control-selection-row + .control-selection-row { margin-top: 14px; }
    .control-selection-row-with-action { display: flex; align-items: flex-end; gap: 9px; width: fit-content; max-width: 100%; margin-top: 18px; }
    .control-selection-row select { width: var(--control-selector-width); max-width: 100%; min-width: 0; min-height: 44px; }
    .selection-control { display: grid; flex: 0 1 var(--control-selector-width); gap: 7px; width: var(--control-selector-width); min-width: 0; }
    .selection-control label { color: #334155; font-size: .84rem; font-weight: 650; }
    .control-selection-row-with-action .button { min-height: 44px; white-space: nowrap; }
    .button { min-height: 40px; padding: 9px 14px; border: 0; border-radius: 9px; font-weight: 700; }
    .button-primary { color: #fff; background: linear-gradient(145deg, #2b61d5, #1d4fc0); box-shadow: 0 5px 14px rgba(29, 78, 216, .2), inset 0 1px 0 rgba(255, 255, 255, .2); }
    .button-secondary { color: #1d4ed8; background: rgba(210, 224, 241, .78); box-shadow: inset 0 1px 0 rgba(243, 248, 252, .52); }
    .button-quiet { min-height: 34px; padding: 7px 10px; color: #475569; background: transparent; }
    .button-danger { color: #fff; background: #b42318; }
    .button:disabled { cursor: not-allowed; opacity: .5; }
    .inline-form { display: grid; grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr) auto; gap: 10px; align-items: end; }
    .discovery-source-form { grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr) auto; }
    .inline-confirmation { grid-column: 1 / -1; padding: 14px; border-left: 3px solid #b42318; border-radius: 8px; background: #fff1f0; }
    .inline-confirmation p { margin: 5px 0 12px; color: #7f1d1d; font-size: .88rem; }
    .developer-card { background: linear-gradient(150deg, rgba(193, 208, 220, .82), rgba(173, 193, 209, .72)); }
    .save-bar { position: sticky; bottom: 16px; z-index: 5; display: flex; justify-content: flex-end; padding: 12px; border: 1px solid rgba(236, 244, 249, .52); border-radius: 14px; background: rgba(219, 230, 238, .9); box-shadow: 0 10px 30px rgba(15, 23, 42, .12), inset 0 1px 0 rgba(246, 250, 253, .58); backdrop-filter: blur(14px); }
    .save-status { align-self: center; margin-right: auto; padding: 0 10px; color: #64748b; font-size: .86rem; font-weight: 650; }
    .control-header-copy { min-width: 0; }
    .command-trigger { display: inline-flex; align-items: center; gap: 10px; min-height: 42px; padding: 9px 13px; color: #475569; border: 1px solid rgba(235, 243, 248, .5); border-radius: 11px; background: rgba(214, 226, 235, .72); box-shadow: inset 0 1px 0 rgba(248, 251, 253, .58); }
    .command-trigger kbd { padding: 2px 6px; border-radius: 6px; color: #64748b; background: rgba(239, 245, 249, .62); font: inherit; font-size: .72rem; }
    .control-workspace { display: grid; grid-template-columns: minmax(210px, 22%) minmax(0, 1fr); gap: 18px; align-items: start; transition: grid-template-columns .18s ease; }
    .control-workspace.is-rail-collapsed { grid-template-columns: 72px minmax(0, 1fr); }
    .control-sidebar { position: sticky; top: 18px; min-height: 0; padding: 16px 12px; border: 1px solid rgba(241, 247, 251, .5); border-radius: 20px; background: linear-gradient(150deg, rgba(214, 227, 237, .78), rgba(193, 210, 223, .68)); box-shadow: 0 18px 48px rgba(43, 58, 76, .14), inset 0 1px 0 rgba(248, 251, 253, .66); backdrop-filter: blur(20px) saturate(116%); }
    .sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 4px 14px; }
    .sidebar-title { color: #334155; font-size: .82rem; font-weight: 750; }
    .rail-toggle { width: 34px; height: 34px; padding: 0; border: 0; border-radius: 9px; color: #475569; background: rgba(226, 235, 242, .64); }
    .control-nav-group + .control-nav-group { margin-top: 20px; }
    .control-nav-label { margin: 0 8px 7px; color: #738398; font-size: .65rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .control-nav { display: grid; gap: 4px; }
    .control-nav-button { position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 9px; width: 100%; min-height: 42px; padding: 8px 10px; color: #526174; border: 0; border-radius: 10px; background: transparent; text-align: left; transition: background .16s ease, color .16s ease, transform .16s ease; }
    .control-nav-button::before { content: ""; position: absolute; left: 0; width: 3px; height: 18px; border-radius: 99px; background: transparent; }
    .control-nav-button:hover { color: #253449; background: rgba(232, 239, 245, .48); }
    .control-nav-button[aria-current="page"] { color: #1f3f78; font-weight: 750; background: rgba(224, 235, 244, .82); box-shadow: inset 0 1px 0 rgba(249, 252, 254, .58); }
    .control-nav-button[aria-current="page"]::before { background: #4777cf; }
    .nav-glyph { width: 18px; color: #71839a; font-size: .72rem; font-weight: 800; text-align: center; }
    .nav-count { min-width: 22px; padding: 2px 6px; border-radius: 999px; color: #62748a; background: rgba(185, 204, 219, .46); font-size: .7rem; font-weight: 750; text-align: center; }
    .is-rail-collapsed .sidebar-title, .is-rail-collapsed .control-nav-label, .is-rail-collapsed .nav-text, .is-rail-collapsed .nav-count { display: none; }
    .is-rail-collapsed .sidebar-top { justify-content: center; }
    .is-rail-collapsed .control-nav-button { grid-template-columns: 1fr; justify-items: center; padding-inline: 6px; }
    .is-rail-collapsed .nav-glyph { font-size: .78rem; }
    .settings-form { min-width: 0; }
    .settings-surface { min-height: 0; }
    .control-panel { animation: panel-in .17s ease both; }
    .panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 22px; padding-bottom: 18px; border-bottom: 1px solid rgba(100, 116, 139, .14); }
    .panel-kicker { margin: 0 0 6px; color: #64748b; font-size: .7rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
    .panel-header h2 { margin: 0; font-size: clamp(1.55rem, 2.4vw, 2.15rem); letter-spacing: -.025em; }
    .panel-description { margin: 7px 0 0; color: #64748b; line-height: 1.5; }
    .panel-status { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; color: #64748b; font-size: .78rem; font-weight: 700; }
    .status-pill { padding: 6px 9px; border-radius: 999px; background: rgba(192, 208, 221, .5); }
    .status-pill.is-on { color: #15703b; background: rgba(91, 178, 126, .15); }
    .overview-section { display: grid; gap: 12px; }
    .overview-section + .overview-section { margin-top: 24px; }
    .overview-section-title { margin: 0; color: #334155; font-size: 1rem; }
    .overview-list { display: grid; gap: 8px; }
    .overview-link { display: grid; grid-template-columns: minmax(110px, .45fr) minmax(0, 1fr) auto; align-items: center; gap: 14px; width: 100%; padding: 13px 15px; color: #334155; border: 1px solid rgba(239, 246, 250, .4); border-radius: 11px; background: rgba(203, 218, 230, .48); text-align: left; }
    .overview-link strong { font-size: .88rem; }
    .overview-link span { color: #64748b; }
    .overview-arrow { font-size: 1.05rem; }
    .settings-category-layout { min-width: 0; }
    .settings-category-content { min-width: 0; }
    .settings-category-panel { display: grid; gap: 12px; animation: panel-in .17s ease both; }
    .advanced-section { margin-top: 18px; border-top: 1px solid rgba(100, 116, 139, .14); }
    .advanced-section summary { padding: 16px 2px 4px; color: #526174; cursor: pointer; font-weight: 700; }
    .advanced-section p { margin: 8px 2px 0; color: #64748b; font-size: .88rem; }
    .command-palette { position: fixed; inset: 0; z-index: 20; display: grid; place-items: start center; padding: min(14vh, 120px) 18px 18px; background: rgba(42, 55, 70, .22); backdrop-filter: blur(8px); }
    .command-palette-panel { width: min(620px, 100%); padding: 12px; border: 1px solid rgba(244, 249, 252, .66); border-radius: 18px; background: rgba(213, 226, 236, .95); box-shadow: 0 30px 90px rgba(31, 43, 58, .28), inset 0 1px 0 rgba(255, 255, 255, .72); }
    .command-search { width: 100%; min-height: 48px; }
    .command-results { display: grid; gap: 4px; max-height: min(54vh, 480px); margin-top: 10px; overflow-y: auto; }
    .command-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; width: 100%; padding: 11px 12px; color: #334155; border: 0; border-radius: 10px; background: transparent; text-align: left; }
    .command-item:hover, .command-item:focus-visible { background: rgba(235, 242, 247, .72); }
    .command-item small { color: #728196; }
    @keyframes panel-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    [hidden] { display: none !important; }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; } }
    @media (max-width: 920px) {
      .control-workspace { grid-template-columns: 76px minmax(0, 1fr); }
      .control-sidebar .sidebar-title, .control-sidebar .control-nav-label, .control-sidebar .nav-text, .control-sidebar .nav-count { display: none; }
      .control-sidebar .sidebar-top { justify-content: center; }
      .control-sidebar .control-nav-button { grid-template-columns: 1fr; justify-items: center; padding-inline: 6px; }
      .discovery-source-form { grid-template-columns: 1fr; }
    }
    @media (max-width: 760px) {
      .control-shell { width: min(100% - 20px, 620px); padding-top: 28px; }
      .control-header { align-items: flex-start; }
      .control-intro { display: none; }
      .command-trigger .command-label { display: none; }
      .control-workspace, .control-workspace.is-rail-collapsed { display: block; }
      .control-sidebar { position: relative; top: auto; min-height: 0; margin-bottom: 14px; padding: 10px; }
      .sidebar-top, .control-nav-label { display: none !important; }
      .control-nav-group + .control-nav-group { margin-top: 6px; }
      .control-nav { display: flex; gap: 5px; overflow-x: auto; }
      .control-sidebar .control-nav-button { flex: 0 0 auto; display: flex; width: auto; min-height: 38px; padding: 7px 10px; }
      .control-sidebar .nav-text { display: inline; }
      .control-sidebar .nav-count, .control-sidebar .nav-glyph { display: none; }
      .settings-surface { padding: 20px; border-radius: 18px; }
      .panel-header { display: block; }
      .panel-status { justify-content: flex-start; margin-top: 12px; }
      .card-grid { grid-template-columns: 1fr; }
      .settings-card-wide, .field-full { grid-column: auto; }
      .inline-form { grid-template-columns: 1fr; }
      .item-row { align-items: start; }
      .save-bar { bottom: 8px; }
    }
    @media (max-width: 460px) {
      .control-header { gap: 12px; }
      .settings-surface { padding: 14px; }
      .settings-card { padding: 18px; border-radius: 14px; }
      .card-header { gap: 12px; }
      .item-row { grid-template-columns: 1fr; }
      [data-calendar-source-actions], [data-discovery-source-actions] { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <main class="control-shell">
    <header class="control-header">
      <div class="control-header-copy">
        <p class="eyebrow">Mosaic</p>
        <h1>Control</h1>
        <p class="control-intro">Shape what Mosaic shows and how it supports your day.</p>
      </div>
      <button class="command-trigger" type="button" data-command-open aria-haspopup="true" aria-controls="control-command-palette"><span class="command-label">Search settings</span><kbd>⌘ K</kbd></button>
    </header>
    <div class="control-workspace" data-control-workspace>
      <aside class="control-sidebar" aria-label="Control sections">
        <div class="sidebar-top"><span class="sidebar-title">Settings</span><button class="rail-toggle" type="button" data-rail-toggle aria-label="Collapse navigation" aria-expanded="true">‹</button></div>
        <div class="control-nav-group">
          <nav class="control-nav">
            <button class="control-nav-button" type="button" data-control-nav="overview" title="Overview" aria-current="page"><span class="nav-glyph">OV</span><span class="nav-text">Overview</span></button>
          </nav>
        </div>
        <div class="control-nav-group">
          <p class="control-nav-label">Settings</p>
          <nav class="control-nav">
            <button class="control-nav-button" type="button" data-control-nav="settings" data-settings-target="personalization" title="Personalization"><span class="nav-glyph">PE</span><span class="nav-text">Personalization</span></button>
            <button class="control-nav-button" type="button" data-control-nav="settings" data-settings-target="appearance" title="Appearance"><span class="nav-glyph">AP</span><span class="nav-text">Appearance</span></button>
            <button class="control-nav-button" type="button" data-control-nav="settings" data-settings-target="sports" title="Sports"><span class="nav-glyph">SP</span><span class="nav-text">Sports</span></button>
            <button class="control-nav-button" type="button" data-control-nav="settings" data-settings-target="calendar" title="Calendar"><span class="nav-glyph">CA</span><span class="nav-text">Calendar</span></button>
            <button class="control-nav-button" type="button" data-control-nav="settings" data-settings-target="discovery" title="Discovery"><span class="nav-glyph">DI</span><span class="nav-text">Discovery</span></button>
          </nav>
        </div>
        <div class="control-nav-group">
          <p class="control-nav-label">System</p>
          <nav class="control-nav">
            <button class="control-nav-button" type="button" data-control-nav="developer" title="Developer Tools"><span class="nav-glyph">DV</span><span class="nav-text">Developer Tools</span></button>
          </nav>
        </div>
      </aside>

      <form class="settings-form" method="post" action="/control">
        <div class="settings-surface">
          <section class="control-panel" data-control-panel="overview">
            <header class="panel-header"><div><p class="panel-kicker">Overview</p><h2>Mosaic</h2><p class="panel-description">Your display configuration at a glance.</p></div><div class="panel-status"><span class="status-pill is-on">Display configured</span></div></header>
            <div class="overview-section">
              <h3 class="overview-section-title">Current Status</h3>
              <section class="settings-card settings-card-wide">
                <div class="overview-list">
                  <button class="overview-link" type="button" data-control-link="settings" data-control-focus="profile-name"><strong>Personalization</strong><span>${escapeHtml(config.profile.name || "No display name")} · ${escapeHtml(config.location.query)}</span><span class="overview-arrow">›</span></button>
                  <button class="overview-link" type="button" data-control-link="settings" data-control-focus="display-theme"><strong>Theme</strong><span>${escapeHtml(themeLabels[config.display.theme])}</span><span class="overview-arrow">›</span></button>
                  <button class="overview-link" type="button" data-control-link="settings" data-control-focus="calendar-enabled"><strong>Calendar</strong><span>${config.calendar.enabled ? "Enabled" : "Disabled"} · ${config.calendar.sources.length} sources</span><span class="overview-arrow">›</span></button>
                  <button class="overview-link" type="button" data-control-link="settings" data-control-focus="sports-enabled"><strong>Sports</strong><span>${config.sports.enabled ? "Enabled" : "Disabled"} · ${config.sports.favoriteTeams.length} favorite teams</span><span class="overview-arrow">›</span></button>
                  <button class="overview-link" type="button" data-control-link="settings" data-control-focus="discovery-enabled"><strong>Discovery</strong><span>${config.discovery.enabled ? "Enabled" : "Disabled"} · ${config.discovery.sources.length} sources</span><span class="overview-arrow">›</span></button>
                </div>
              </section>
            </div>
          </section>

          <section class="control-panel" data-control-panel="settings" hidden>
            <header class="panel-header"><div><p class="panel-kicker">Settings</p><h2>Display configuration</h2><p class="panel-description">Personalize Mosaic and manage its information sources.</p></div></header>
            <div class="settings-category-layout">
              <div class="settings-category-content">
            <section class="settings-category-panel" data-settings-panel="personalization">
              <h3 class="overview-section-title">Personalization</h3>
              <div class="card-grid">
                <section class="settings-card settings-card-wide"><div class="field"><label for="profile-name">Display name</label><input id="profile-name" name="profileName" type="text" value="${escapeHtml(config.profile.name)}" placeholder="Bryan"></div></section>
                <section class="settings-card settings-card-wide"><div class="field"><label for="location-query">City or ZIP code</label><input id="location-query" name="locationQuery" type="text" value="${escapeHtml(config.location.query)}" required></div></section>
              </div>
            </section>
            <section class="settings-category-panel" data-settings-panel="appearance" hidden>
              <h3 class="overview-section-title">Appearance</h3>
              <div class="card-grid"><section class="settings-card settings-card-wide"><div class="field control-selection-row"><label for="display-theme">Theme</label><select id="display-theme" name="theme">${themeOptions}</select></div></section></div>
            </section>

            <section class="settings-category-panel" data-settings-panel="calendar" hidden>
              <h3 class="overview-section-title">Calendar</h3>
            <div class="card-grid"><section class="settings-card settings-card-wide" data-feature-card>
          <div class="card-header">
            <div><h3>Calendar</h3><p class="card-description">Upcoming events and timely reminders.</p></div>
            <label class="switch"><input id="calendar-enabled" name="calendarEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Calendar" aria-controls="calendar-settings"${config.calendar.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="calendar-settings" data-feature-content${config.calendar.enabled ? "" : " hidden"}>
            <input id="calendar-provider" name="calendarProvider" type="hidden" value="${escapeHtml(config.calendar.provider)}">
            <h4 class="subsection-title">Add Calendar Source</h4>
            <div class="inline-form">
              <div class="field"><label for="calendar-source-name">Nickname</label><input id="calendar-source-name" name="calendarSourceName" type="text" placeholder="Personal"></div>
              <div class="field"><label for="calendar-source-url">iCal address</label><input id="calendar-source-url" name="calendarSourceUrl" type="url" placeholder="https://calendar.example.com/feed.ics"></div>
              <button class="button button-secondary" type="button" data-add-calendar-source>Add</button>
            </div>
            <h4 class="subsection-title">Configured Sources</h4>
            <ul class="item-list" data-calendar-source-list>
              ${calendarSourceRows}
              <li class="empty-state" data-calendar-source-empty${config.calendar.sources.length > 0 ? " hidden" : ""}>No Calendar sources configured.</li>
            </ul>
            <input name="calendarSourcesDraft" type="hidden" value="${escapeHtml(calendarSourceDraft)}">
          </div>
        </section></div>
            </section>

            <section class="settings-category-panel" data-settings-panel="sports" hidden>
              <h3 class="overview-section-title">Sports</h3>
            <div class="card-grid"><section class="settings-card settings-card-wide" data-feature-card>
          <div class="card-header">
            <div><h3>Favorite Sports</h3><p class="card-description">Favorite teams and game awareness.</p></div>
            <label class="switch"><input id="sports-enabled" name="sportsEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Sports" aria-controls="sports-settings"${config.sports.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="sports-settings" data-feature-content${config.sports.enabled ? "" : " hidden"}>
            <div class="field control-selection-row"><label for="primary-league">Primary league</label><select id="primary-league" name="primaryLeague">${leagueOptions}</select></div>
            <div class="control-selection-row control-selection-row-with-action">
              <div class="selection-control">
                <label for="favorite-team">Favorite team</label>
                <select id="favorite-team" name="addTeamId"${teamOptions ? "" : " disabled"}>${teamOptions || `<option value="">No available ${escapeHtml(config.sports.primaryLeague)} teams</option>`}</select>
              </div>
              <button class="button button-secondary" type="button" data-add-favorite-team${teamOptions ? "" : " disabled"}>Add team</button>
            </div>
            <h4 class="subsection-title">Selected teams</h4>
            <ul class="item-list" data-favorite-team-list>
              ${favoriteTeamRows}
              <li class="empty-state" data-favorite-team-empty${config.sports.favoriteTeams.length > 0 ? " hidden" : ""}>No favorite teams configured.</li>
            </ul>
          </div>
        </section>
        <section class="settings-card settings-card-wide">
          <div class="card-header">
            <div><h3>Sports Widget</h3><p class="card-description">Choose the professional leagues included in the universal Sports Widget feed.</p></div>
            <label class="switch"><input name="sportsWidgetEnabled" type="checkbox" value="true" aria-label="Enable Sports Widget"${config.sports.widget.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="control-selection-row control-selection-row-with-action">
            <div class="selection-control">
              <label for="sports-widget-league">Add league</label>
              <select id="sports-widget-league"${availableSportsWidgetLeagues.length > 0 ? "" : " disabled"}>${sportsWidgetLeagueOptions || "<option value=\"\">All leagues selected</option>"}</select>
            </div>
            <button class="button button-secondary" type="button" data-add-sports-widget-league${availableSportsWidgetLeagues.length > 0 ? "" : " disabled"}>Add</button>
          </div>
          <h4 class="subsection-title">Selected leagues</h4>
          <ul class="item-list" data-sports-widget-league-list>
            ${sportsWidgetLeagueRows}
            <li class="empty-state" data-sports-widget-league-empty${config.sports.widget.leagues.length > 0 ? " hidden" : ""}>No leagues selected.</li>
          </ul>
        </section></div>
            </section>

            <section class="settings-category-panel" data-settings-panel="discovery" hidden>
              <h3 class="overview-section-title">Discovery</h3>
            <div class="card-grid"><section class="settings-card settings-card-wide" data-feature-card>
          <div class="card-header">
            <div><h3>Discovery</h3><p class="card-description">Passive-interest stories, images, and feeds.</p></div>
            <label class="switch"><input id="discovery-enabled" name="discoveryEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Discovery" aria-controls="discovery-settings"${config.discovery.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="discovery-settings" data-feature-content${config.discovery.enabled ? "" : " hidden"}>
            <h4 class="subsection-title" data-discovery-source-editor-title>Add Source</h4>
            <div class="inline-form discovery-source-form">
              <div class="field"><label for="discovery-source-name">Nickname</label><input id="discovery-source-name" name="discoverySourceName" type="text" placeholder="Technology News"></div>
              <div class="field"><label for="discovery-source-url">Feed Address</label><input id="discovery-source-url" name="discoverySourceUrl" type="text" inputmode="url" placeholder="Feed URL or r/subreddit"></div>
              <div class="button-row"><button class="button button-secondary" type="button" data-add-discovery-source>Add</button><button class="button button-quiet" type="button" data-cancel-discovery-source-edit hidden>Cancel Edit</button></div>
            </div>
            <h4 class="subsection-title">Configured Sources</h4>
            <ul class="item-list" data-discovery-source-list>
              ${discoverySourceRows}
              <li class="empty-state" data-discovery-source-empty${config.discovery.sources.length > 0 ? " hidden" : ""}>No Discovery sources configured.</li>
            </ul>
            <input name="discoverySourcesDraft" type="hidden" value="${escapeHtml(discoverySourceDraft)}">
          </div>
        </section></div>
            </section>
              </div>
            </div>
          </section>

          <section class="control-panel" data-control-panel="developer" hidden>
            <header class="panel-header"><div><p class="panel-kicker">Developer Tools</p><h2>Simulation and diagnostics</h2><p class="panel-description">Temporary tools for exercising Mosaic experiences.</p></div><div class="panel-status"><span class="status-pill">Development only</span></div></header>
            <div class="card-grid"><section class="settings-card settings-card-wide developer-card" data-feature-card>
          <div class="card-header">
            <div><h3>Sports Simulator</h3><p class="card-description">Preview normalized game states on the running dashboard. Simulation state is never saved.</p></div>
            <label class="switch"><input id="sports-simulator-enabled" type="checkbox" data-feature-toggle aria-label="Enable Sports Simulator" aria-controls="sports-simulator-settings"><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="sports-simulator-settings" data-feature-content hidden>
            <div class="field control-selection-row">
              <label for="sports-simulation-profile">League / Profile</label>
              <select id="sports-simulation-profile">${sportsSimulationProfileOptions}</select>
            </div>
            <div class="field control-selection-row">
              <label for="sports-simulation-scenario">Scenario</label>
              <select id="sports-simulation-scenario">${sportsSimulationScenarioOptions}</select>
            </div>
            <div class="button-row">
              <button class="button button-secondary" type="button" data-sports-simulation-run>Run Simulation</button>
              <button class="button button-quiet" type="button" data-sports-simulation-clear>Clear</button>
            </div>
            <details class="advanced-section"><summary>Advanced</summary><p>Simulator state is temporary and is never written to Mosaic configuration.</p></details>
          </div>
        </section></div>
          </section>
        </div>

        <div class="save-bar" data-settings-save-bar hidden><span class="save-status" data-save-status role="status" aria-live="polite" hidden>Unsaved changes</span><button class="button button-primary" type="submit">Save Changes</button></div>
      </form>
    </div>
  </main>
  <div class="command-palette" id="control-command-palette" data-command-palette role="dialog" aria-modal="true" aria-label="Search Control" hidden>
    <div class="command-palette-panel" role="search" aria-label="Control commands">
      <input class="command-search" type="text" data-command-search placeholder="Search settings and actions" autocomplete="off">
      <div class="command-results" data-command-results>
        <button class="command-item" type="button" data-command-section="overview"><span>Open Overview</span><small>General</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="profile-name"><span>Open Personalization</span><small>Settings</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="display-theme"><span>Open Appearance</span><small>Settings</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="calendar-enabled"><span>Open Calendar</span><small>Settings</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="sports-enabled"><span>Open Sports</span><small>Settings</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="discovery-enabled"><span>Open Discovery</span><small>Settings</small></button>
        <button class="command-item" type="button" data-command-section="developer"><span>Open Developer Tools</span><small>System</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="favorite-team"><span>Add Favorite Team</span><small>Sports</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="calendar-source-name"><span>Add Calendar Source</span><small>Calendar</small></button>
        <button class="command-item" type="button" data-command-section="settings" data-command-focus="discovery-source-name"><span>Add Discovery Source</span><small>Discovery</small></button>
        <button class="command-item" type="button" data-command-section="developer" data-command-focus="sports-simulator-enabled"><span>Open Sports Simulator</span><small>Developer Tools</small></button>
      </div>
    </div>
  </div>
  <script>
    (() => {
      const sectionStorageKey = "mosaic-control-section";
      const settingsCategoryStorageKey =
        "mosaic-control-settings-category";
      const railStorageKey = "mosaic-control-rail-collapsed";
      const workspace = document.querySelector(
        "[data-control-workspace]"
      );
      const railToggle = document.querySelector("[data-rail-toggle]");
      const navButtons = [...document.querySelectorAll(
        "[data-control-nav]"
      )];
      const panels = [...document.querySelectorAll(
        "[data-control-panel]"
      )];
      const saveBar = document.querySelector(
        "[data-settings-save-bar]"
      );
      const settingsNavButtons = navButtons.filter(
        (button) => button.dataset.settingsTarget
      );
      const settingsPanels = [...document.querySelectorAll(
        "[data-settings-panel]"
      )];
      const settingsControlPanel = panels.find(
        (panel) => panel.dataset.controlPanel === "settings"
      );
      const validSections = new Set(
        panels.map((panel) => panel.dataset.controlPanel)
      );
      const validSettingsCategories = new Set(
        settingsPanels.map((panel) => panel.dataset.settingsPanel)
      );
      let selectedSettingsCategory = "personalization";

      try {
        selectedSettingsCategory =
          sessionStorage.getItem(settingsCategoryStorageKey) ||
          selectedSettingsCategory;
      } catch (error) {}

      const selectSettingsCategory = (category) => {
        const selected = validSettingsCategories.has(category)
          ? category
          : "personalization";

        settingsPanels.forEach((panel) => {
          panel.hidden = panel.dataset.settingsPanel !== selected;
        });
        selectedSettingsCategory = selected;

        if (settingsControlPanel && !settingsControlPanel.hidden) {
          settingsNavButtons.forEach((button) => {
            const isSelected =
              button.dataset.settingsTarget === selected;
            if (isSelected) {
              button.setAttribute("aria-current", "page");
            } else {
              button.removeAttribute("aria-current");
            }
          });
        }

        try {
          sessionStorage.setItem(settingsCategoryStorageKey, selected);
        } catch (error) {}
      };

      const selectSection = (
        section,
        focusId = null,
        settingsCategory = null
      ) => {
        const selected = validSections.has(section)
          ? section
          : "overview";

        panels.forEach((panel) => {
          panel.hidden = panel.dataset.controlPanel !== selected;
        });
        if (saveBar) saveBar.hidden = selected !== "settings";

        if (selected === "settings") {
          const focusedPanel = focusId
            ? document.getElementById(focusId)?.closest(
                "[data-settings-panel]"
              )
            : null;
          selectSettingsCategory(
            settingsCategory ||
              focusedPanel?.dataset.settingsPanel ||
              selectedSettingsCategory
          );
        }

        navButtons.forEach((button) => {
          const isSelected =
            button.dataset.controlNav === selected &&
            (
              selected !== "settings" ||
              button.dataset.settingsTarget ===
                selectedSettingsCategory
            );
          if (isSelected) {
            button.setAttribute("aria-current", "page");
          } else {
            button.removeAttribute("aria-current");
          }
        });

        try {
          sessionStorage.setItem(sectionStorageKey, selected);
        } catch (error) {}

        window.scrollTo({ top: 0, behavior: "auto" });

        if (focusId) {
          requestAnimationFrame(() => {
            document.getElementById(focusId)?.focus();
          });
        }
      };

      let initialSection = "overview";
      try {
        initialSection = sessionStorage.getItem(sectionStorageKey) ||
          initialSection;
      } catch (error) {}
      if ([
        "appearance",
        "calendar",
        "sports",
        "discovery"
      ].includes(initialSection)) {
        selectedSettingsCategory = initialSection;
        initialSection = "settings";
      }
      selectSection(initialSection);

      navButtons.forEach((button) => {
        button.addEventListener("click", () => {
          selectSection(
            button.dataset.controlNav,
            null,
            button.dataset.settingsTarget || null
          );
        });
      });
      document.querySelectorAll("[data-control-link]")
        .forEach((button) => {
          button.addEventListener("click", () => {
            selectSection(
              button.dataset.controlLink,
              button.dataset.controlFocus || null
            );
          });
        });

      const syncRail = (collapsed) => {
        workspace?.classList.toggle("is-rail-collapsed", collapsed);
        railToggle?.setAttribute("aria-expanded", String(!collapsed));
        if (railToggle) {
          railToggle.textContent = collapsed ? "›" : "‹";
          railToggle.setAttribute(
            "aria-label",
            collapsed ? "Expand navigation" : "Collapse navigation"
          );
        }
      };

      let railCollapsed = false;
      try {
        railCollapsed =
          sessionStorage.getItem(railStorageKey) === "true";
      } catch (error) {}
      syncRail(railCollapsed);

      railToggle?.addEventListener("click", () => {
        railCollapsed = !railCollapsed;
        syncRail(railCollapsed);
        try {
          sessionStorage.setItem(
            railStorageKey,
            String(railCollapsed)
          );
        } catch (error) {}
      });

      const palette = document.querySelector("[data-command-palette]");
      const paletteOpen = document.querySelector("[data-command-open]");
      const search = document.querySelector("[data-command-search]");
      const commands = [...document.querySelectorAll(
        "[data-command-section]"
      )];

      const closePalette = () => {
        if (!palette || palette.hidden) return;
        palette.hidden = true;
        paletteOpen?.setAttribute("aria-expanded", "false");
        search.value = "";
        commands.forEach((command) => command.hidden = false);
        paletteOpen?.focus();
      };

      const openPalette = () => {
        if (!palette) return;
        palette.hidden = false;
        paletteOpen?.setAttribute("aria-expanded", "true");
        requestAnimationFrame(() => search?.focus());
      };

      paletteOpen?.setAttribute("aria-expanded", "false");
      paletteOpen?.addEventListener("click", openPalette);
      palette?.addEventListener("click", (event) => {
        if (event.target === palette) closePalette();
      });
      search?.addEventListener("input", () => {
        const query = search.value.trim().toLowerCase();
        commands.forEach((command) => {
          command.hidden = !command.textContent
            .toLowerCase()
            .includes(query);
        });
      });
      search?.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
        const visible = commands.filter((command) => !command.hidden);
        if (visible.length === 0) return;
        event.preventDefault();
        (event.key === "ArrowDown" ? visible[0] : visible.at(-1))
          .focus();
      });
      commands.forEach((command, index) => {
        command.addEventListener("click", () => {
          const section = command.dataset.commandSection;
          const focusId = command.dataset.commandFocus || null;
          closePalette();
          selectSection(section, focusId);
        });
        command.addEventListener("keydown", (event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const visible = commands.filter((item) => !item.hidden);
          const currentIndex = visible.indexOf(command);
          const offset = event.key === "ArrowDown" ? 1 : -1;
          const next = visible[
            (currentIndex + offset + visible.length) % visible.length
          ];
          event.preventDefault();
          next?.focus();
        });
      });
      document.addEventListener("keydown", (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          palette?.hidden ? openPalette() : closePalette();
        }
        if (event.key === "Escape" && !palette?.hidden) {
          event.preventDefault();
          closePalette();
        }
      });

      window.mosaicControlSelectSection = selectSection;
      window.mosaicControlSelectSettingsCategory =
        selectSettingsCategory;
    })();

    (() => {
      const storageKey = "mosaic-control-scroll-position";

      document.addEventListener("submit", (event) => {
        const form = event.target;
        const submitter = event.submitter;
        const action = submitter?.formAction || form?.action;

        if (form?.method?.toLowerCase() !== "post" || !action) return;

        try {
          const actionUrl = new URL(action, window.location.href);

          if (
            actionUrl.origin !== window.location.origin ||
            (
              actionUrl.pathname !== "/control" &&
              !actionUrl.pathname.startsWith("/control/")
            )
          ) {
            return;
          }

          sessionStorage.setItem(storageKey, JSON.stringify({
            scrollY: window.scrollY,
            savedAt: Date.now()
          }));
        } catch (error) {}
      }, true);
    })();

    (() => {
      const storageKey = "mosaic-control-scroll-position";
      let savedPosition = null;

      try {
        savedPosition = JSON.parse(
          sessionStorage.getItem(storageKey)
        );
        sessionStorage.removeItem(storageKey);
      } catch (error) {
        return;
      }

      if (!savedPosition) return;

      const navigation = performance
        .getEntriesByType("navigation")[0];
      const isManualRefresh = navigation?.type === "reload";
      const isRecentControlAction =
        Number.isFinite(savedPosition.savedAt) &&
        Date.now() - savedPosition.savedAt < 30 * 1000;

      if (
        isManualRefresh ||
        !isRecentControlAction ||
        !Number.isFinite(savedPosition.scrollY)
      ) {
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const maximumScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
          );

          window.scrollTo(
            0,
            Math.min(savedPosition.scrollY, maximumScroll)
          );
        });
      });
    })();

    (() => {
      const form = document.querySelector(".settings-form");
      const status = document.querySelector("[data-save-status]");
      const savedFieldNames = new Set([
        "profileName",
        "locationQuery",
        "theme",
        "calendarEnabled",
        "calendarProvider",
        "calendarSourcesDraft",
        "discoveryEnabled",
        "discoverySourcesDraft",
        "sportsEnabled",
        "sportsWidgetEnabled",
        "sportsWidgetLeagues",
        "favoriteTeams",
        "primaryLeague"
      ]);

      const showPendingState = (event) => {
        if (!savedFieldNames.has(event.target.name)) return;

        status.hidden = false;
      };

      form.addEventListener("input", showPendingState);
      form.addEventListener("change", showPendingState);
      form.addEventListener("invalid", (event) => {
        const settingsPanel = event.target.closest(
          "[data-settings-panel]"
        );

        if (!settingsPanel) return;

        window.mosaicControlSelectSection?.("settings");
        window.mosaicControlSelectSettingsCategory?.(
          settingsPanel.dataset.settingsPanel
        );
      }, true);
    })();

    (() => {
      const list = document.querySelector(
        "[data-sports-widget-league-list]"
      );
      const emptyState = document.querySelector(
        "[data-sports-widget-league-empty]"
      );
      const select = document.getElementById(
        "sports-widget-league"
      );
      const addButton = document.querySelector(
        "[data-add-sports-widget-league]"
      );
      const saveStatus = document.querySelector(
        "[data-save-status]"
      );
      const supportedLeagues = ${supportedSportsWidgetLeaguesJson};

      if (!list || !emptyState || !select || !addButton) return;

      const getSelectedRows = () => [
        ...list.querySelectorAll(
          "[data-sports-widget-league-row]"
        )
      ];

      const markUnsaved = () => {
        if (saveStatus) saveStatus.hidden = false;
      };

      const syncControls = () => {
        const hasOptions = [...select.options].some(
          (option) => option.value
        );

        if (!hasOptions) {
          select.replaceChildren();
          const option = document.createElement("option");
          option.value = "";
          option.textContent = "All leagues selected";
          select.append(option);
        }

        select.disabled = !hasOptions;
        addButton.disabled = !hasOptions;
        emptyState.hidden = getSelectedRows().length > 0;
      };

      const addAvailableOption = (league) => {
        if ([...select.options].some(
          (option) => option.value === league
        )) return;

        const options = [...select.options]
          .filter((option) => option.value)
          .map((option) => option.value);
        options.push(league);
        options.sort(
          (first, second) =>
            supportedLeagues.indexOf(first) -
            supportedLeagues.indexOf(second)
        );
        select.replaceChildren();
        options.forEach((value) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          select.append(option);
        });
      };

      const createLeagueRow = (league) => {
        const row = document.createElement("li");
        row.className = "item-row";
        row.dataset.sportsWidgetLeagueRow = "";
        row.dataset.league = league;

        const copy = document.createElement("span");
        copy.className = "item-copy";
        const name = document.createElement("strong");
        name.textContent = league;
        copy.append(name);

        const removeButton = document.createElement("button");
        removeButton.className = "button button-quiet";
        removeButton.type = "button";
        removeButton.dataset.removeSportsWidgetLeague = "";
        removeButton.textContent = "Remove";

        const field = document.createElement("input");
        field.type = "hidden";
        field.name = "sportsWidgetLeagues";
        field.value = league;

        row.append(copy, removeButton, field);
        return row;
      };

      addButton.addEventListener("click", () => {
        const league = select.value;
        const duplicate = getSelectedRows().some(
          (row) => row.dataset.league === league
        );

        if (!league || duplicate) return;

        list.insertBefore(createLeagueRow(league), emptyState);
        select.selectedOptions[0]?.remove();
        syncControls();
        markUnsaved();
      });

      list.addEventListener("click", (event) => {
        const removeButton = event.target.closest(
          "[data-remove-sports-widget-league]"
        );

        if (!removeButton) return;

        const row = removeButton.closest(
          "[data-sports-widget-league-row]"
        );
        const league = row?.dataset.league;

        if (!row || !supportedLeagues.includes(league)) return;

        row.remove();
        addAvailableOption(league);
        syncControls();
        markUnsaved();
      });

      syncControls();
    })();

    (() => {
      const leagueSelect = document.getElementById("primary-league");
      const teamSelect = document.getElementById("favorite-team");
      const addButton = document.querySelector(
        "[data-add-favorite-team]"
      );
      const list = document.querySelector(
        "[data-favorite-team-list]"
      );
      const emptyState = document.querySelector(
        "[data-favorite-team-empty]"
      );
      const saveStatus = document.querySelector(
        "[data-save-status]"
      );
      const teams = ${favoriteTeamRegistryJson};

      if (
        !leagueSelect ||
        !teamSelect ||
        !addButton ||
        !list ||
        !emptyState
      ) return;

      const getSelectedRows = () => [
        ...list.querySelectorAll("[data-favorite-team-row]")
      ];

      const markUnsaved = () => {
        if (saveStatus) saveStatus.hidden = false;
      };

      const syncTeamOptions = () => {
        const selectedIds = new Set(
          getSelectedRows().map((row) => row.dataset.teamId)
        );
        const availableTeams = teams.filter(
          (team) =>
            team.league === leagueSelect.value &&
            !selectedIds.has(team.id)
        );

        teamSelect.replaceChildren();

        if (availableTeams.length === 0) {
          const option = document.createElement("option");
          option.value = "";
          option.textContent =
            "No available " + leagueSelect.value + " teams";
          teamSelect.append(option);
        } else {
          availableTeams.forEach((team) => {
            const option = document.createElement("option");
            option.value = team.id;
            option.textContent =
              team.name + " (" + team.league + ")";
            teamSelect.append(option);
          });
        }

        teamSelect.disabled = availableTeams.length === 0;
        addButton.disabled = availableTeams.length === 0;
        emptyState.hidden = getSelectedRows().length > 0;
      };

      const createTeamRow = (team) => {
        const row = document.createElement("li");
        row.className = "item-row";
        row.dataset.favoriteTeamRow = "";
        row.dataset.teamId = team.id;

        const copy = document.createElement("span");
        copy.className = "item-copy";
        const name = document.createElement("strong");
        name.textContent = team.name;
        const league = document.createElement("small");
        league.textContent = team.league;
        copy.append(name, league);

        const removeButton = document.createElement("button");
        removeButton.className = "button button-quiet";
        removeButton.type = "button";
        removeButton.dataset.removeFavoriteTeam = "";
        removeButton.textContent = "Remove";

        const field = document.createElement("input");
        field.type = "hidden";
        field.name = "favoriteTeams";
        field.value = team.id;

        row.append(copy, removeButton, field);
        return row;
      };

      addButton.addEventListener("click", () => {
        const team = teams.find(
          (candidate) => candidate.id === teamSelect.value
        );
        const duplicate = getSelectedRows().some(
          (row) => row.dataset.teamId === team?.id
        );

        if (!team || duplicate) return;

        list.insertBefore(createTeamRow(team), emptyState);
        syncTeamOptions();
        markUnsaved();
      });

      list.addEventListener("click", (event) => {
        const removeButton = event.target.closest(
          "[data-remove-favorite-team]"
        );

        if (!removeButton) return;

        const row = removeButton.closest(
          "[data-favorite-team-row]"
        );

        if (!row) return;

        row.remove();
        syncTeamOptions();
        markUnsaved();
      });

      leagueSelect.addEventListener("change", syncTeamOptions);
      syncTeamOptions();
    })();

    (() => {
      document.querySelectorAll("[data-feature-toggle]")
        .forEach((toggle) => {
          const content = document.getElementById(
            toggle.getAttribute("aria-controls")
          );

          if (!content) return;

          const syncDisclosure = () => {
            content.hidden = !toggle.checked;
            toggle.setAttribute(
              "aria-expanded",
              String(toggle.checked)
            );
          };

          toggle.addEventListener("change", syncDisclosure);
          syncDisclosure();
      });
    })();

    (() => {
      const configurationSaved = ${configurationSaved};
      const themeSelect = document.getElementById("display-theme");

      if (
        !configurationSaved ||
        !themeSelect ||
        typeof BroadcastChannel !== "function"
      ) return;

      const channel = new BroadcastChannel(
        "mosaic-theme-preview"
      );

      channel.postMessage({ theme: themeSelect.value });
      channel.close();
    })();

    (() => {
      const profileSelect = document.getElementById(
        "sports-simulation-profile"
      );
      const scenarioSelect = document.getElementById(
        "sports-simulation-scenario"
      );
      const runButton = document.querySelector(
        "[data-sports-simulation-run]"
      );
      const clearButton = document.querySelector(
        "[data-sports-simulation-clear]"
      );
      const profiles = ${sportsSimulationProfilesJson};
      const controls = [
        profileSelect,
        scenarioSelect,
        runButton,
        clearButton
      ].filter(Boolean);

      if (typeof BroadcastChannel !== "function") {
        controls.forEach((control) => {
          control.disabled = true;
          control.title =
            "Sports Simulator requires BroadcastChannel support.";
        });
        return;
      }

      if (
        !profileSelect ||
        !scenarioSelect ||
        !runButton ||
        !clearButton
      ) return;

      const channel = new BroadcastChannel(
        "mosaic-sports-demo"
      );

      const syncScenarios = () => {
        const profile = profiles.find(
          (item) => item.id === profileSelect.value
        );

        scenarioSelect.replaceChildren();
        (profile?.scenarios || []).forEach((scenario) => {
          const option = document.createElement("option");
          option.value = scenario.id;
          option.textContent = scenario.label;
          scenarioSelect.append(option);
        });
        runButton.disabled = scenarioSelect.options.length === 0;
      };

      profileSelect.addEventListener("change", syncScenarios);
      runButton.addEventListener("click", () => {
        channel.postMessage({
          action: "run",
          profileId: profileSelect.value,
          scenarioId: scenarioSelect.value
        });
      });
      clearButton.addEventListener("click", () => {
        channel.postMessage({ action: "clear" });
      });

      syncScenarios();

      window.addEventListener(
        "pagehide",
        () => channel.close(),
        { once: true }
      );
    })();

    (() => {
      const list = document.querySelector(
        "[data-calendar-source-list]"
      );
      const emptyState = document.querySelector(
        "[data-calendar-source-empty]"
      );
      const draftField = document.querySelector(
        "[name=calendarSourcesDraft]"
      );
      const nameInput = document.getElementById(
        "calendar-source-name"
      );
      const urlInput = document.getElementById(
        "calendar-source-url"
      );
      const providerField = document.getElementById(
        "calendar-provider"
      );
      const addButton = document.querySelector(
        "[data-add-calendar-source]"
      );
      const saveStatus = document.querySelector(
        "[data-save-status]"
      );
      let draft = [];

      if (
        !list ||
        !emptyState ||
        !draftField ||
        !nameInput ||
        !urlInput ||
        !addButton
      ) return;

      try {
        draft = JSON.parse(draftField.value);
      } catch (error) {
        draft = [];
      }

      const markUnsaved = () => {
        if (saveStatus) saveStatus.hidden = false;
      };

      const syncDraft = () => {
        draftField.value = JSON.stringify(draft);
        emptyState.hidden = draft.length > 0;
      };

      const createSourceId = () => {
        let id = "";

        do {
          const suffix = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : Date.now().toString(36) +
              Math.random().toString(36).slice(2);
          id = "calendar-" + suffix;
        } while (draft.some((source) => source.id === id));

        return id;
      };

      const createSourceRow = (source) => {
        const row = document.createElement("li");
        row.className = "item-row";
        row.dataset.calendarSourceRow = "";
        row.dataset.sourceId = source.id;

        const copy = document.createElement("span");
        copy.className = "item-copy";
        const name = document.createElement("strong");
        const dot = document.createElement("span");
        dot.className = "status-dot is-enabled";
        name.append(dot, document.createTextNode(source.name));
        const status = document.createElement("small");
        status.textContent = "Enabled";
        copy.append(name, status);

        const actions = document.createElement("span");
        actions.dataset.calendarSourceActions = "";
        const toggle = document.createElement("button");
        toggle.className = "button button-quiet";
        toggle.type = "button";
        toggle.dataset.toggleCalendarSource = "";
        toggle.textContent = "Disable";
        const remove = document.createElement("button");
        remove.className = "button button-quiet";
        remove.type = "button";
        remove.dataset.removeCalendarSource = "";
        remove.textContent = "Remove";
        actions.append(toggle, remove);

        const confirmation = document.createElement("div");
        confirmation.className = "inline-confirmation";
        confirmation.dataset.calendarSourceConfirmation = "";
        confirmation.hidden = true;
        const question = document.createElement("strong");
        question.textContent = "Remove " + source.name + "?";
        const explanation = document.createElement("p");
        explanation.textContent =
          "This will stop Mosaic from displaying events from this calendar.";
        const confirmationActions = document.createElement("div");
        confirmationActions.className = "button-row";
        const cancel = document.createElement("button");
        cancel.className = "button button-quiet";
        cancel.type = "button";
        cancel.dataset.cancelCalendarSourceRemoval = "";
        cancel.textContent = "Cancel";
        const confirm = document.createElement("button");
        confirm.className = "button button-danger";
        confirm.type = "button";
        confirm.dataset.confirmCalendarSourceRemoval = "";
        confirm.textContent = "Remove Calendar";
        confirmationActions.append(cancel, confirm);
        confirmation.append(
          question,
          explanation,
          confirmationActions
        );

        row.append(copy, actions, confirmation);
        return row;
      };

      const updateSourceRow = (row, enabled) => {
        row.querySelector(".status-dot")?.classList.toggle(
          "is-enabled",
          enabled
        );
        const status = row.querySelector(".item-copy small");
        const toggle = row.querySelector(
          "[data-toggle-calendar-source]"
        );

        if (status) status.textContent = enabled
          ? "Enabled"
          : "Disabled";
        if (toggle) toggle.textContent = enabled
          ? "Disable"
          : "Enable";
      };

      addButton.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const url = urlInput.value.trim();
        let parsedUrl = null;

        nameInput.setCustomValidity(
          name ? "" : "Calendar nickname must not be empty."
        );

        try {
          parsedUrl = new URL(url);
        } catch (error) {}

        const validUrl = parsedUrl &&
          ["https:", "http:", "webcal:"].includes(
            parsedUrl.protocol
          );
        const duplicateUrl = draft.some(
          (source) => source.url === url
        );
        urlInput.setCustomValidity(
          !url
            ? "iCalendar URL must not be empty."
            : !validUrl
              ? "iCalendar URL is invalid."
              : duplicateUrl
                ? "That Calendar source is already configured."
                : ""
        );

        if (!nameInput.reportValidity() || !urlInput.reportValidity()) {
          return;
        }

        const source = {
          id: createSourceId(),
          name,
          enabled: true,
          url
        };
        const hadSources = draft.length > 0;

        draft.push(source);
        list.insertBefore(createSourceRow(source), emptyState);
        nameInput.value = "";
        urlInput.value = "";

        if (!hadSources && providerField) {
          providerField.value = "ical";
        }

        syncDraft();
        markUnsaved();
      });

      list.addEventListener("click", (event) => {
        const row = event.target.closest(
          "[data-calendar-source-row]"
        );

        if (!row) return;

        const sourceIndex = draft.findIndex(
          (source) => source.id === row.dataset.sourceId
        );

        if (sourceIndex < 0) return;

        const actions = row.querySelector(
          "[data-calendar-source-actions]"
        );
        const confirmation = row.querySelector(
          "[data-calendar-source-confirmation]"
        );

        if (event.target.closest("[data-toggle-calendar-source]")) {
          draft[sourceIndex].enabled =
            draft[sourceIndex].enabled === false;
          updateSourceRow(row, draft[sourceIndex].enabled);
          syncDraft();
          markUnsaved();
        } else if (event.target.closest("[data-remove-calendar-source]")) {
          actions.hidden = true;
          confirmation.hidden = false;
        } else if (event.target.closest(
          "[data-cancel-calendar-source-removal]"
        )) {
          confirmation.hidden = true;
          actions.hidden = false;
        } else if (event.target.closest(
          "[data-confirm-calendar-source-removal]"
        )) {
          draft.splice(sourceIndex, 1);
          row.remove();
          syncDraft();
          markUnsaved();
        }
      });

      syncDraft();
    })();

    (() => {
      const list = document.querySelector(
        "[data-discovery-source-list]"
      );
      const emptyState = document.querySelector(
        "[data-discovery-source-empty]"
      );
      const draftField = document.querySelector(
        "[name=discoverySourcesDraft]"
      );
      const nameInput = document.getElementById(
        "discovery-source-name"
      );
      const urlInput = document.getElementById(
        "discovery-source-url"
      );
      const addButton = document.querySelector(
        "[data-add-discovery-source]"
      );
      const cancelEditButton = document.querySelector(
        "[data-cancel-discovery-source-edit]"
      );
      const editorTitle = document.querySelector(
        "[data-discovery-source-editor-title]"
      );
      const saveStatus = document.querySelector(
        "[data-save-status]"
      );
      let draft = [];
      let editingSourceId = null;

      if (
        !list ||
        !emptyState ||
        !draftField ||
        !nameInput ||
        !urlInput ||
        !addButton ||
        !cancelEditButton ||
        !editorTitle
      ) return;

      try {
        draft = JSON.parse(draftField.value);
      } catch (error) {
        draft = [];
      }

      const markUnsaved = () => {
        if (saveStatus) saveStatus.hidden = false;
      };

      const syncDraft = () => {
        draftField.value = JSON.stringify(draft);
        emptyState.hidden = draft.length > 0;
      };

      const resetEditor = () => {
        editingSourceId = null;
        nameInput.value = "";
        urlInput.value = "";
        nameInput.setCustomValidity("");
        urlInput.setCustomValidity("");
        editorTitle.textContent = "Add Source";
        addButton.textContent = "Add";
        cancelEditButton.hidden = true;
      };

      const beginEdit = (source) => {
        editingSourceId = source.id;
        nameInput.value = source.name;
        urlInput.value = source.config?.url || "";
        nameInput.setCustomValidity("");
        urlInput.setCustomValidity("");
        editorTitle.textContent = "Edit Source";
        addButton.textContent = "Update";
        cancelEditButton.hidden = false;
        nameInput.focus();
      };

      const createSourceId = () => {
        let id = "";

        do {
          const suffix = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : Date.now().toString(36) +
              Math.random().toString(36).slice(2);
          id = "discovery-" + suffix;
        } while (draft.some((source) => source.id === id));

        return id;
      };

      const canonicalizeRedditUrl = (value) => {
        const input = value.trim();
        const subredditMatch = input.match(
          /^(?:r\\/)?([A-Za-z0-9_+]+)\\/?$/i
        );

        if (subredditMatch) {
          return "https://www.reddit.com/r/" +
            subredditMatch[1].toLowerCase() + "/.rss";
        }

        try {
          const inputUrl = new URL(input);
          const hostname = inputUrl.hostname.toLowerCase();

          if (
            !["http:", "https:"].includes(inputUrl.protocol) ||
            (hostname !== "reddit.com" &&
              !hostname.endsWith(".reddit.com"))
          ) {
            return "";
          }

          const path = inputUrl.pathname
            .replace(/\\/+$/, "")
            .replace(/\\/\\.rss$/i, "")
            .replace(
              /^\\/r\\/([^/]+)/i,
              (match, subreddit) =>
                "/r/" + subreddit.toLowerCase()
            );

          if (!path || path === "/") return "";

          inputUrl.protocol = "https:";
          inputUrl.hostname = "www.reddit.com";
          inputUrl.port = "";
          inputUrl.pathname = path + "/.rss";
          inputUrl.hash = "";

          return inputUrl.href;
        } catch (error) {
          return "";
        }
      };

      const createSourceRow = (source) => {
        const row = document.createElement("li");
        row.className = "item-row";
        row.dataset.discoverySourceRow = "";
        row.dataset.sourceId = source.id;
        row.dataset.sourceRemovable = "true";

        const copy = document.createElement("span");
        copy.className = "item-copy";
        const name = document.createElement("strong");
        const dot = document.createElement("span");
        dot.className = "status-dot is-enabled";
        const nameText = document.createElement("span");
        nameText.dataset.discoverySourceName = "";
        nameText.textContent = source.name;
        name.append(dot, nameText);
        const status = document.createElement("small");
        status.textContent = "RSS / Atom · Enabled";
        const address = document.createElement("span");
        address.className = "source-address";
        address.textContent = source.config.url;
        copy.append(name, status, address);

        const actions = document.createElement("span");
        actions.dataset.discoverySourceActions = "";
        const toggle = document.createElement("button");
        toggle.className = "button button-quiet";
        toggle.type = "button";
        toggle.dataset.toggleDiscoverySource = "";
        toggle.textContent = "Disable";
        const edit = document.createElement("button");
        edit.className = "button button-quiet";
        edit.type = "button";
        edit.dataset.editDiscoverySource = "";
        edit.textContent = "Edit";
        const remove = document.createElement("button");
        remove.className = "button button-quiet";
        remove.type = "button";
        remove.dataset.removeDiscoverySource = "";
        remove.textContent = "Remove";
        actions.append(toggle, edit, remove);

        const confirmation = document.createElement("div");
        confirmation.className = "inline-confirmation";
        confirmation.dataset.discoverySourceConfirmation = "";
        confirmation.hidden = true;
        const question = document.createElement("strong");
        question.textContent = "Remove " + source.name + "?";
        const explanation = document.createElement("p");
        explanation.textContent =
          "This will stop Mosaic from displaying items from this source.";
        const confirmationActions = document.createElement("div");
        confirmationActions.className = "button-row";
        const cancel = document.createElement("button");
        cancel.className = "button button-quiet";
        cancel.type = "button";
        cancel.dataset.cancelDiscoverySourceRemoval = "";
        cancel.textContent = "Cancel";
        const confirm = document.createElement("button");
        confirm.className = "button button-danger";
        confirm.type = "button";
        confirm.dataset.confirmDiscoverySourceRemoval = "";
        confirm.textContent = "Remove Source";
        confirmationActions.append(cancel, confirm);
        confirmation.append(
          question,
          explanation,
          confirmationActions
        );

        row.append(copy, actions, confirmation);
        return row;
      };

      const updateSourceRow = (row, source) => {
        row.querySelector(".status-dot")?.classList.toggle(
          "is-enabled",
          source.enabled
        );
        const name = row.querySelector(
          "[data-discovery-source-name]"
        );
        const status = row.querySelector(".item-copy small");
        const address = row.querySelector(".source-address");
        const toggle = row.querySelector(
          "[data-toggle-discovery-source]"
        );

        if (name) name.textContent = source.name;
        if (status) {
          status.textContent = "RSS / Atom · " +
            (source.enabled ? "Enabled" : "Disabled") +
            (row.dataset.sourceRemovable === "true"
              ? ""
              : " · Built-in");
        }
        if (address) address.textContent = source.config.url;
        if (toggle) toggle.textContent = source.enabled
          ? "Disable"
          : "Enable";
        const confirmationName = row.querySelector(
          "[data-discovery-source-confirmation] strong"
        );
        if (confirmationName) {
          confirmationName.textContent = "Remove " + source.name + "?";
        }
      };

      addButton.addEventListener("click", () => {
        const name = nameInput.value.trim();
        const inputAddress = urlInput.value.trim();
        const url = canonicalizeRedditUrl(inputAddress) || inputAddress;
        const type = "rss";
        let parsedUrl = null;

        nameInput.setCustomValidity(
          name ? "" : "Discovery source nickname must not be empty."
        );

        try {
          parsedUrl = new URL(url);
        } catch (error) {}

        const validUrl = parsedUrl &&
          ["https:", "http:"].includes(parsedUrl.protocol);
        const duplicateUrl = draft.some(
          (source) =>
            source.id !== editingSourceId &&
            source.type === type &&
            source.config?.url === url
        );
        urlInput.setCustomValidity(
          !validUrl
            ? "Enter an HTTP(S) feed URL or Reddit source such as r/baseball."
            : duplicateUrl
              ? "That Discovery source is already configured."
              : ""
        );

        if (!nameInput.reportValidity() || !urlInput.reportValidity()) {
          return;
        }

        if (editingSourceId) {
          const sourceIndex = draft.findIndex(
            (source) => source.id === editingSourceId
          );

          if (sourceIndex < 0) {
            resetEditor();
            return;
          }

          const source = {
            ...draft[sourceIndex],
            name,
            type,
            config: { url }
          };
          draft[sourceIndex] = source;
          const row = Array.from(list.querySelectorAll(
            "[data-discovery-source-row]"
          )).find((candidate) =>
            candidate.dataset.sourceId === editingSourceId
          );

          if (row) updateSourceRow(row, source);
        } else {
          const source = {
            id: createSourceId(),
            name,
            type,
            enabled: true,
            config: { url }
          };

          draft.push(source);
          list.insertBefore(createSourceRow(source), emptyState);
        }

        resetEditor();
        syncDraft();
        markUnsaved();
      });

      cancelEditButton.addEventListener("click", resetEditor);

      list.addEventListener("click", (event) => {
        const row = event.target.closest(
          "[data-discovery-source-row]"
        );

        if (!row) return;

        const sourceIndex = draft.findIndex(
          (source) => source.id === row.dataset.sourceId
        );

        if (sourceIndex < 0) return;

        const actions = row.querySelector(
          "[data-discovery-source-actions]"
        );
        const confirmation = row.querySelector(
          "[data-discovery-source-confirmation]"
        );

        if (event.target.closest("[data-toggle-discovery-source]")) {
          draft[sourceIndex].enabled =
            draft[sourceIndex].enabled === false;
          updateSourceRow(row, draft[sourceIndex]);
          syncDraft();
          markUnsaved();
        } else if (event.target.closest(
          "[data-edit-discovery-source]"
        )) {
          beginEdit(draft[sourceIndex]);
        } else if (
          row.dataset.sourceRemovable === "true" &&
          event.target.closest("[data-remove-discovery-source]")
        ) {
          actions.hidden = true;
          confirmation.hidden = false;
        } else if (event.target.closest(
          "[data-cancel-discovery-source-removal]"
        )) {
          confirmation.hidden = true;
          actions.hidden = false;
        } else if (
          row.dataset.sourceRemovable === "true" &&
          event.target.closest(
            "[data-confirm-discovery-source-removal]"
          )
        ) {
          if (editingSourceId === draft[sourceIndex].id) {
            resetEditor();
          }
          draft.splice(sourceIndex, 1);
          row.remove();
          syncDraft();
          markUnsaved();
        }
      });

      syncDraft();
    })();
  </script>
</body>
</html>`);
});

app.post("/control", async (req, res) => {
  try {
    const currentConfig = readConfig();
    const config = validateConfigUpdate(
      req.body.locationQuery,
      req.body.primaryLeague,
      req.body.theme,
      req.body.profileName,
      req.body.calendarEnabled === "true",
      req.body.calendarProvider,
      resolveCalendarSourceDraft(
        req.body.calendarSourcesDraft,
        currentConfig.calendar.sources
      ),
      req.body.sportsEnabled === "true",
      req.body.sportsWidgetEnabled === "true",
      Array.isArray(req.body.sportsWidgetLeagues)
        ? req.body.sportsWidgetLeagues
        : typeof req.body.sportsWidgetLeagues === "string"
          ? [req.body.sportsWidgetLeagues]
          : [],
      Array.isArray(req.body.favoriteTeams)
        ? req.body.favoriteTeams
        : typeof req.body.favoriteTeams === "string"
          ? [req.body.favoriteTeams]
          : [],
      req.body.discoveryEnabled === "true",
      resolveDiscoverySourceDraft(
        req.body.discoverySourcesDraft,
        currentConfig.discovery.sources
      )
    );
    await writeConfig(config);
    res.redirect(303, "/control?saved=1");
  } catch (error) {
    const isValidationError = error instanceof Error &&
      (error.message === "Location must not be empty." ||
        error.message === "League must be MLB, NFL, NBA, or NHL." ||
        error.message === "Theme selection is invalid." ||
        error.message === "Display name must be a string." ||
        error.message === "Calendar enabled must be a boolean." ||
        error.message === "Calendar provider is invalid." ||
        error.message === "Calendar sources are invalid." ||
        error.message === "That Calendar source is already configured." ||
        error.message === "Sports enabled must be a boolean." ||
        error.message === "Sports Widget enabled must be a boolean." ||
        error.message === "Sports Widget leagues are invalid." ||
        error.message === "Favorite teams must be an array." ||
        error.message === "Discovery enabled must be a boolean." ||
        error.message === "Discovery sources must be an array." ||
        error.message === "Discovery sources are invalid." ||
        error.message === "That Discovery source is already configured.");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Unable to save configuration:", error);
    res.status(500).json({ error: "Configuration could not be saved." });
  }
});

app.post("/control/favorite-teams/add", async (req, res) => {
  try {
    const team = getSportsTeam(req.body.addTeamId);

    if (!team) {
      return res.status(400).json({ error: "Favorite team is invalid." });
    }

    const config = readConfig();
    const favoriteTeams = normalizeFavoriteTeams({
      favoriteTeams: [
        ...config.sports.favoriteTeams,
        team
      ]
    });

    await writeConfig({
      ...config,
      sports: {
        ...config.sports,
        favoriteTeams
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to add favorite team:", error);
    res.status(500).json({ error: "Favorite team could not be added." });
  }
});

app.post("/control/favorite-teams/remove", async (req, res) => {
  try {
    const config = readConfig();
    const teamId = typeof req.body.removeTeamId === "string"
      ? req.body.removeTeamId.trim().toUpperCase()
      : "";

    await writeConfig({
      ...config,
      sports: {
        ...config.sports,
        favoriteTeams: config.sports.favoriteTeams.filter(
          (team) => team.id !== teamId
        )
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to remove favorite team:", error);
    res.status(500).json({ error: "Favorite team could not be removed." });
  }
});

app.post("/control/calendar-sources/add", async (req, res) => {
  try {
    const name = typeof req.body.calendarSourceName === "string"
      ? req.body.calendarSourceName.trim()
      : "";
    const url = typeof req.body.calendarSourceUrl === "string"
      ? req.body.calendarSourceUrl.trim()
      : "";

    if (!name) {
      return res.status(400).json({
        error: "Calendar nickname must not be empty."
      });
    }

    if (!url) {
      return res.status(400).json({
        error: "iCalendar URL must not be empty."
      });
    }

    const source = normalizeCalendarSources([{
      id: `calendar-${randomUUID()}`,
      name,
      enabled: true,
      url
    }])[0];

    if (!source) {
      return res.status(400).json({
        error: "iCalendar URL is invalid."
      });
    }

    const config = readConfig();

    if (
      config.calendar.sources.some(
        (configuredSource) => configuredSource.url === source.url
      )
    ) {
      return res.status(400).json({
        error: "That Calendar source is already configured."
      });
    }

    await writeConfig({
      ...config,
      calendar: {
        ...config.calendar,
        provider: config.calendar.sources.length === 0
          ? icalCalendarProvider.id
          : config.calendar.provider,
        sources: [...config.calendar.sources, source]
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to add Calendar source.");
    res.status(500).json({
      error: "Calendar source could not be added."
    });
  }
});

app.post("/control/calendar-sources/toggle", async (req, res) => {
  try {
    const config = readConfig();
    const sourceId = normalizeCalendarSourceId(
      req.body.calendarSourceId
    );
    const sourceExists = config.calendar.sources.some(
      (source) => source.id === sourceId
    );

    if (!sourceExists) {
      return res.status(400).json({
        error: "Calendar source is invalid."
      });
    }

    await writeConfig({
      ...config,
      calendar: {
        ...config.calendar,
        sources: config.calendar.sources.map((source) =>
          source.id === sourceId
            ? { ...source, enabled: !source.enabled }
            : source
        )
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to update Calendar source.");
    res.status(500).json({
      error: "Calendar source could not be updated."
    });
  }
});

app.post("/control/calendar-sources/remove", async (req, res) => {
  try {
    const config = readConfig();
    const sourceId = normalizeCalendarSourceId(
      req.body.calendarSourceId
    );
    const sourceExists = config.calendar.sources.some(
      (source) => source.id === sourceId
    );

    if (!sourceExists) {
      return res.status(400).json({
        error: "Calendar source is invalid."
      });
    }

    await writeConfig({
      ...config,
      calendar: {
        ...config.calendar,
        sources: config.calendar.sources.filter(
          (source) => source.id !== sourceId
        )
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to remove Calendar source.");
    res.status(500).json({
      error: "Calendar source could not be removed."
    });
  }
});

function normalizeCalendarSourceId(value) {
  return typeof value === "string" ? value.trim() : "";
}

app.post("/control/discovery-sources/add", async (req, res) => {
  try {
    const name = typeof req.body.discoverySourceName === "string"
      ? req.body.discoverySourceName.trim()
      : "";
    const type = "rss";
    const url = normalizeDiscoverySourceAddress(
      req.body.discoverySourceUrl
    );
    const adapterMetadata = discoverySourceTypeMetadata.find(
      (metadata) => metadata.type === type && metadata.userAddable
    );

    if (!name) {
      return res.status(400).json({
        error: "Discovery source nickname must not be empty."
      });
    }

    if (
      !adapterMetadata ||
      !url
    ) {
      return res.status(400).json({
        error: "Discovery source configuration is invalid."
      });
    }

    const config = readConfig();

    if (config.discovery.sources.some(
      (source) => source.type === type && source.config.url === url
    )) {
      return res.status(400).json({
        error: "That Discovery source is already configured."
      });
    }

    const sources = normalizeDiscoverySources([
      ...config.discovery.sources,
      {
        id: `discovery-${randomUUID()}`,
        name,
        type,
        enabled: true,
        config: { url }
      }
    ]);

    await writeConfig({
      ...config,
      discovery: {
        ...config.discovery,
        sources
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to add Discovery source.");
    res.status(500).json({
      error: "Discovery source could not be added."
    });
  }
});

app.post("/control/discovery-sources/toggle", async (req, res) => {
  try {
    const config = readConfig();
    const sourceId = normalizeDiscoverySourceId(
      req.body.discoverySourceId
    );
    const sourceExists = config.discovery.sources.some(
      (source) => source.id === sourceId
    );

    if (!sourceExists) {
      return res.status(400).json({
        error: "Discovery source is invalid."
      });
    }

    await writeConfig({
      ...config,
      discovery: {
        ...config.discovery,
        sources: config.discovery.sources.map((source) =>
          source.id === sourceId
            ? { ...source, enabled: !source.enabled }
            : source
        )
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to update Discovery source.");
    res.status(500).json({
      error: "Discovery source could not be updated."
    });
  }
});

app.post("/control/discovery-sources/remove", async (req, res) => {
  try {
    const config = readConfig();
    const sourceId = normalizeDiscoverySourceId(
      req.body.discoverySourceId
    );
    const source = config.discovery.sources.find(
      (configuredSource) => configuredSource.id === sourceId
    );

    if (!source) {
      return res.status(400).json({
        error: "Discovery source is invalid."
      });
    }

    await writeConfig({
      ...config,
      discovery: {
        ...config.discovery,
        sources: config.discovery.sources.filter(
          (configuredSource) => configuredSource.id !== sourceId
        )
      }
    });
    res.redirect(303, "/control");
  } catch (error) {
    console.error("Unable to remove Discovery source.");
    res.status(500).json({
      error: "Discovery source could not be removed."
    });
  }
});

function normalizeDiscoverySourceId(value) {
  return typeof value === "string" ? value.trim() : "";
}

app.get("/api/config", (req, res) => {
  const config = readConfig();

  res.json({
    display: config.display,
    profile: config.profile,
    calendar: createPublicCalendarConfig(config.calendar),
    sports: config.sports,
    discovery: createPublicDiscoveryConfig(config.discovery)
  });
});

app.get("/api/calendar/events", async (req, res) => {
  const config = readConfig();

  if (!config.calendar.enabled) {
    return res.json({ events: [] });
  }

  if (config.calendar.provider !== icalCalendarProvider.id) {
    return res.status(409).json({
      error: "The configured Calendar provider is not iCalendar."
    });
  }

  const start = new Date(req.query.start);
  const end = new Date(req.query.end);

  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  ) {
    return res.status(400).json({
      error: "Calendar event range is invalid."
    });
  }

  try {
    const events = await icalCalendarProvider.getEvents({
      start,
      end,
      sources: config.calendar.sources
    });

    res.json({ events });
  } catch (error) {
    res.status(503).json({
      error: "Calendar events are temporarily unavailable."
    });
  }
});

/* ==========================
   General Helpers
========================== */

function formatLocalDate(dateValue) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(dateValue));
}

function formatLocalTime(dateValue) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(dateValue));
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] =
    value.split("-").map(Number);
  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function normalizeMlbTeam(teamData, linescoreData) {
  const teamId = teamData?.team?.id ?? null;
  const abbreviation = teamData?.team?.abbreviation || "";
  const registryTeam = getSportsTeam(abbreviation);
  const runs =
    linescoreData?.runs ??
    teamData?.score ??
    null;

  return {
    id: teamId,
    abbreviation,
    name: teamData?.team?.name || "Team TBD",
    shortName:
      registryTeam?.shortName ||
      teamData?.team?.teamName ||
      teamData?.team?.name ||
      "Team TBD",
    providerId: registryTeam?.providerId ?? teamId,
    logo:
      registryTeam?.logo ||
      (teamId
        ? `https://www.mlbstatic.com/team-logos/${teamId}.svg`
        : null),

    record: {
      wins: teamData?.leagueRecord?.wins ?? null,
      losses: teamData?.leagueRecord?.losses ?? null,
      ties: teamData?.leagueRecord?.ties ?? null,
      percentage:
        teamData?.leagueRecord?.pct ?? null
    },

    score: runs,
    runs,
    hits: linescoreData?.hits ?? null,
    errors: linescoreData?.errors ?? null
  };
}

function normalizeMlbRunner(runner) {
  if (!runner) {
    return {
      occupied: false,
      runner: null
    };
  }

  return {
    occupied: true,
    runner: {
      id: runner.id ?? null,
      name: runner.fullName || ""
    }
  };
}

function normalizeMlbPlayer(player, stats = {}) {
  if (!player?.fullName) return null;

  return {
    id: player.id ?? null,
    name: player.fullName,
    ...stats
  };
}

function getMlbBoxscorePlayer(boxscore, playerId) {
  if (!playerId) return null;

  const playerKey = `ID${playerId}`;

  return (
    boxscore?.teams?.away?.players?.[playerKey] ||
    boxscore?.teams?.home?.players?.[playerKey] ||
    null
  );
}

function getCachedMlbSeasonStat(playerId, statType, value) {
  const cacheKey = `${playerId}:${statType}`;
  const cachedStat = mlbPlayerSeasonStatsCache.get(cacheKey);

  if (
    cachedStat &&
    Date.now() - cachedStat.timestamp <
      MLB_PLAYER_SEASON_CACHE_MS
  ) {
    return cachedStat.value;
  }

  const normalizedValue = value ?? null;

  mlbPlayerSeasonStatsCache.set(cacheKey, {
    timestamp: Date.now(),
    value: normalizedValue
  });

  return normalizedValue;
}

async function getMlbLivePlayerStats(game) {
  if (game.status?.abstractGameState !== "Live") {
    return null;
  }

  const batterId = game.linescore?.offense?.batter?.id;
  const pitcherId = game.linescore?.defense?.pitcher?.id;

  if (!batterId && !pitcherId) return null;

  try {
    const response = await fetch(
      `https://statsapi.mlb.com/api/v1.1/game/${game.gamePk}/feed/live`
    );

    if (!response.ok) {
      throw new Error(
        `MLB live feed request failed: ${response.status}`
      );
    }

    const liveData = await response.json();
    const boxscore = liveData.liveData?.boxscore;
    const batter = getMlbBoxscorePlayer(boxscore, batterId);
    const pitcher = getMlbBoxscorePlayer(boxscore, pitcherId);

    return {
      batter: batter
        ? {
            hits: batter.stats?.batting?.hits ?? null,
            atBats: batter.stats?.batting?.atBats ?? null,
            seasonAVG: getCachedMlbSeasonStat(
              batterId,
              "batting-average",
              batter.seasonStats?.batting?.avg
            )
          }
        : null,
      pitcher: pitcher
        ? {
            pitches:
              pitcher.stats?.pitching?.numberOfPitches ??
              pitcher.stats?.pitching?.pitchesThrown ??
              null,
            strikes:
              pitcher.stats?.pitching?.strikes ?? null,
            seasonERA: getCachedMlbSeasonStat(
              pitcherId,
              "pitching-era",
              pitcher.seasonStats?.pitching?.era
            )
          }
        : null
    };
  } catch (error) {
    console.error(
      `Unable to enrich MLB game ${game.gamePk} players:`,
      error
    );
    return null;
  }
}

function normalizeMlbEvent(game, playerStats = {}) {
  const linescore = game.linescore;
  const currentInning =
    linescore?.currentInning ??
    linescore?.innings?.at(-1)?.num ??
    null;
  const inningHalf =
    linescore?.inningHalf ||
    linescore?.inningState ||
    (linescore?.isTopInning === true
      ? "Top"
      : linescore?.isTopInning === false
        ? "Bottom"
        : null);

  return {
    eventId: game.gamePk,
    sport: "MLB",
    date:
      game.officialDate ||
      formatLocalDate(game.gameDate),
    scheduledAt: game.gameDate,
    scheduledTime: formatLocalTime(game.gameDate),

    status: {
      state:
        game.status?.abstractGameState ||
        "Preview",
      detail:
        game.status?.detailedState ||
        game.status?.abstractGameState ||
        "Scheduled"
    },

    awayTeam: normalizeMlbTeam(
      game.teams?.away,
      linescore?.teams?.away
    ),
    homeTeam: normalizeMlbTeam(
      game.teams?.home,
      linescore?.teams?.home
    ),

    linescore: linescore
      ? {
          innings: (linescore.innings || []).map(
            (inning) => ({
              number: inning.num ?? null,
              away: inning.away?.runs ?? null,
              home: inning.home?.runs ?? null
            })
          ),
          inning: {
            number: currentInning,
            half: inningHalf
          },
          outs: linescore.outs ?? null,
          count: {
            balls: linescore.balls ?? null,
            strikes: linescore.strikes ?? null
          },
          bases: {
            first: normalizeMlbRunner(
              linescore.offense?.first
            ),
            second: normalizeMlbRunner(
              linescore.offense?.second
            ),
            third: normalizeMlbRunner(
              linescore.offense?.third
            )
          },
          batter: normalizeMlbPlayer(
            linescore.offense?.batter,
            playerStats?.batter || {
              hits: null,
              atBats: null,
              seasonAVG: null
            }
          ),
          pitcher: normalizeMlbPlayer(
            linescore.defense?.pitcher,
            playerStats?.pitcher || {
              pitches: null,
              strikes: null,
              seasonERA: null
            }
          )
        }
      : null,

    venue: {
      id: game.venue?.id ?? null,
      name: game.venue?.name || ""
    }
  };
}

function getMlbScheduleCacheTtl(sportsEvents) {
  const hasLiveGame = sportsEvents.some(
    (event) => event.status.state === "Live"
  );

  if (hasLiveGame) {
    return MLB_LIVE_CACHE_MS;
  }

  const allGamesFinal =
    sportsEvents.length > 0 &&
    sportsEvents.every(
      (event) => event.status.state === "Final"
    );

  return allGamesFinal
    ? MLB_FINAL_CACHE_MS
    : MLB_SCHEDULED_CACHE_MS;
}

/* ==========================
   Weather API
========================== */

app.get("/api/weather", async (req, res) => {
  const weatherLocation = readConfig().location.query;

  try {
    const cacheIsValid =
      weatherCache.data &&
      weatherCache.locationQuery === weatherLocation &&
      Date.now() - weatherCache.timestamp <
        WEATHER_CACHE_MS;

    if (cacheIsValid) {
      return res.json(weatherCache.data);
    }

    const locationParams = new URLSearchParams({
      name: weatherLocation,
      count: "1",
      language: "en",
      format: "json",
      countryCode: "US"
    });

    const locationResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${locationParams}`
    );

    if (!locationResponse.ok) {
      throw new Error(
        `Location lookup failed: ${locationResponse.status}`
      );
    }

    const locationData = await locationResponse.json();
    const location = locationData.results?.[0];

    if (!location) {
      throw new Error(
        `No location found for ${weatherLocation}`
      );
    }

    const forecastParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),

      current: [
        "temperature_2m",
        "apparent_temperature",
        "weather_code"
      ].join(","),

      hourly: [
        "temperature_2m",
        "apparent_temperature",
        "precipitation_probability",
        "weather_code"
      ].join(","),

      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_probability_max"
      ].join(","),

      temperature_unit: "fahrenheit",
      timezone: DISPLAY_TIME_ZONE,
      past_days: "3",
      forecast_days: "16"
    });

    const forecastResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?${forecastParams}`
    );

    if (!forecastResponse.ok) {
      throw new Error(
        `Weather request failed: ${forecastResponse.status}`
      );
    }

    const forecastData = await forecastResponse.json();

    const responseData = {
      location: {
        name: location.name,
        state: location.admin1,
        query: weatherLocation,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: forecastData.timezone
      },

      current: {
        temperature: Math.round(
          forecastData.current.temperature_2m
        ),
        apparentTemperature: Math.round(
          forecastData.current.apparent_temperature
        ),
        weatherCode:
          forecastData.current.weather_code
      },

      hourly: forecastData.hourly.time.map(
        (time, index) => ({
          time,
          temperature: Math.round(
            forecastData.hourly.temperature_2m[index]
          ),
          apparentTemperature: Math.round(
            forecastData.hourly.apparent_temperature[index]
          ),
          precipitationChance:
            forecastData.hourly
              .precipitation_probability[index],
          weatherCode:
            forecastData.hourly.weather_code[index]
        })
      ).filter((hour) =>
        hour.time.startsWith(formatLocalDate(new Date()))
      ),

      daily: forecastData.daily.time.map(
        (date, index) => ({
          date,
          weatherCode:
            forecastData.daily.weather_code[index],
          high: Math.round(
            forecastData.daily.temperature_2m_max[index]
          ),
          low: Math.round(
            forecastData.daily.temperature_2m_min[index]
          ),
          precipitationChance:
            forecastData.daily
              .precipitation_probability_max[index]
        })
      ),

      updatedAt: new Date().toISOString()
    };

    weatherCache = {
      timestamp: Date.now(),
      locationQuery: weatherLocation,
      data: responseData
    };

    res.json(responseData);
  } catch (error) {
    console.error("Weather API error:", error);

    if (
      weatherCache.data &&
      weatherCache.locationQuery === weatherLocation
    ) {
      return res.json({
        ...weatherCache.data,
        stale: true
      });
    }

    res.status(500).json({
      error:
        "Weather data is temporarily unavailable."
    });
  }
});

/* ==========================
   MLB Daily Schedule API
========================== */

async function acquireMlbDailySchedule(requestedDate) {
  const cachedSchedule =
    mlbDailyScheduleCache.get(requestedDate);

  try {
    const cacheIsValid =
      cachedSchedule &&
      Date.now() - cachedSchedule.timestamp <
        cachedSchedule.ttl;

    if (cacheIsValid) {
      return cachedSchedule.data;
    }

    const scheduleParams = new URLSearchParams({
      sportId: "1",
      date: requestedDate,
      gameType: "R",
      hydrate: "team,linescore"
    });

    const scheduleResponse = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?${scheduleParams}`
    );

    if (!scheduleResponse.ok) {
      throw new Error(
        `MLB daily schedule request failed: ${scheduleResponse.status}`
      );
    }

    const scheduleData = await scheduleResponse.json();
    const sportsEvents = [];

    for (const dateGroup of scheduleData.dates || []) {
      for (const game of dateGroup.games || []) {
        const playerStats = await getMlbLivePlayerStats(game);

        sportsEvents.push(
          normalizeMlbEvent(game, playerStats)
        );
      }
    }

    sportsEvents.sort(
      (firstEvent, secondEvent) =>
        new Date(firstEvent.scheduledAt) -
        new Date(secondEvent.scheduledAt)
    );

    const responseData = {
      sport: "MLB",
      date: requestedDate,
      sportsEvents,
      updatedAt: new Date().toISOString()
    };

    mlbDailyScheduleCache.set(requestedDate, {
      timestamp: Date.now(),
      ttl: getMlbScheduleCacheTtl(sportsEvents),
      data: responseData
    });

    return responseData;
  } catch (error) {
    console.error(
      "MLB daily schedule API error:",
      error
    );

    if (cachedSchedule?.data) {
      return {
        ...cachedSchedule.data,
        stale: true
      };
    }

    throw error;
  }
}

async function handleMlbDailySchedule(req, res) {
  const requestedDate = resolveSportsDate(req.query.date);

  if (!requestedDate) {
    return res.status(400).json({
      error: "Date must use YYYY-MM-DD format."
    });
  }

  try {
    res.json(await acquireMlbDailySchedule(requestedDate));
  } catch (error) {
    res.status(500).json({
      error:
        "MLB daily schedule is temporarily unavailable."
    });
  }
}

function resolveSportsDate(queryDate) {
  const requestedDate = typeof queryDate === "string"
    ? queryDate
    : formatLocalDate(new Date());

  return isValidDateKey(requestedDate)
    ? requestedDate
    : null;
}

const sportsWidgetAcquisitionRegistry = new Map([
  ["MLB", {
    id: "MLB",
    acquire: acquireMlbDailySchedule
  }]
]);

async function acquireSportsWidgetLeague(
  league,
  requestedDate,
  registry = sportsWidgetAcquisitionRegistry
) {
  const normalizedLeague = String(league || "")
    .trim()
    .toUpperCase();
  const provider = registry.get(normalizedLeague);

  if (!provider) {
    return {
      league: normalizedLeague,
      availability: "unsupported",
      sportsEvents: []
    };
  }

  try {
    const schedule = await provider.acquire(requestedDate);

    return {
      league: normalizedLeague,
      availability: "available",
      sportsEvents: Array.isArray(schedule.sportsEvents)
        ? schedule.sportsEvents
        : [],
      updatedAt: schedule.updatedAt,
      ...(schedule.stale === true ? { stale: true } : {})
    };
  } catch (error) {
    console.error(
      `${normalizedLeague} Sports Widget acquisition failed.`,
      error
    );

    return {
      league: normalizedLeague,
      availability: "unavailable",
      sportsEvents: []
    };
  }
}

async function acquireSportsWidgetLeagues(
  leagues,
  requestedDate,
  registry = sportsWidgetAcquisitionRegistry
) {
  const uniqueLeagues = [
    ...new Set(
      (Array.isArray(leagues) ? leagues : [])
        .filter((league) => typeof league === "string")
        .map((league) => league.trim().toUpperCase())
        .filter(Boolean)
    )
  ];

  return Promise.all(
    uniqueLeagues.map((league) =>
      acquireSportsWidgetLeague(
        league,
        requestedDate,
        registry
      )
    )
  );
}

async function buildSportsWidgetAcquisitionResponse(
  sportsConfig,
  requestedDate,
  registry = sportsWidgetAcquisitionRegistry
) {
  const widgetConfig = sportsConfig?.widget || {};
  const leagues = widgetConfig.enabled === false
    ? []
    : await acquireSportsWidgetLeagues(
        widgetConfig.leagues,
        requestedDate,
        registry
      );
  const compatibilityLeague = leagues.find(
    (league) => league.availability === "available"
  );

  return {
    date: requestedDate,
    leagues,
    sport: compatibilityLeague?.league || null,
    sportsEvents: compatibilityLeague?.sportsEvents || [],
    updatedAt:
      compatibilityLeague?.updatedAt || new Date().toISOString(),
    ...(compatibilityLeague?.stale === true
      ? { stale: true }
      : {})
  };
}

app.get("/api/sports", async (req, res) => {
  const requestedDate = resolveSportsDate(req.query.date);

  if (!requestedDate) {
    return res.status(400).json({
      error: "Date must use YYYY-MM-DD format."
    });
  }

  const config = readConfig();

  res.json(
    await buildSportsWidgetAcquisitionResponse(
      config.sports,
      requestedDate
    )
  );
});

app.get("/api/sports/mlb", handleMlbDailySchedule);

/* ==========================
   Mariners Schedule API
========================== */

app.get("/api/sports/mlb/sea", async (req, res) => {
  try {
    const cacheIsValid =
      marinersCache.data &&
      Date.now() - marinersCache.timestamp <
        SPORTS_CACHE_MS;

    if (cacheIsValid) {
      return res.json(marinersCache.data);
    }

    const currentYear = new Date().getFullYear();

    const scheduleParams = new URLSearchParams({
      sportId: "1",
      teamId: String(MARINERS_TEAM_ID),
      season: String(currentYear),
      gameType: "R"
    });

    const scheduleResponse = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?${scheduleParams}`
    );

    if (!scheduleResponse.ok) {
      throw new Error(
        `Mariners schedule request failed: ${scheduleResponse.status}`
      );
    }

    const scheduleData = await scheduleResponse.json();
    const games = [];

    for (const dateGroup of scheduleData.dates || []) {
      for (const game of dateGroup.games || []) {
        const isHome =
          game.teams?.home?.team?.id ===
          MARINERS_TEAM_ID;

        const opponentTeam = isHome
          ? game.teams?.away?.team
          : game.teams?.home?.team;
        const teamGameData = isHome
          ? game.teams?.home
          : game.teams?.away;
        const opponentGameData = isHome
          ? game.teams?.away
          : game.teams?.home;

        games.push({
          gameId: game.gamePk,
          date: formatLocalDate(game.gameDate),
          startTime: formatLocalTime(game.gameDate),

          opponent:
            opponentTeam?.name || "Opponent TBD",

          opponentAbbreviation:
            opponentTeam?.abbreviation ||
            opponentTeam?.teamCode ||
            "",

          location: isHome ? "home" : "away",
          matchupPrefix: isHome ? "vs" : "@",

          venue: game.venue?.name || "",

          status:
            game.status?.detailedState ||
            game.status?.abstractGameState ||
            "Scheduled",

          state:
            game.status?.abstractGameState ||
            "Preview",

          teamScore:
            teamGameData?.score ?? null,
          opponentScore:
            opponentGameData?.score ?? null,

          teamRecord: {
            wins:
              teamGameData?.leagueRecord?.wins ?? null,
            losses:
              teamGameData?.leagueRecord?.losses ?? null
          },
          opponentRecord: {
            wins:
              opponentGameData?.leagueRecord?.wins ?? null,
            losses:
              opponentGameData?.leagueRecord?.losses ?? null
          },

          gameDateTime: game.gameDate
        });
      }
    }

    const responseData = {
      team: {
        id: MARINERS_TEAM_ID,
        name: "Seattle Mariners",
        abbreviation: "SEA",
        league: "MLB"
      },

      season: currentYear,
      games,
      updatedAt: new Date().toISOString()
    };

    marinersCache = {
      timestamp: Date.now(),
      data: responseData
    };

    res.json(responseData);
  } catch (error) {
    console.error(
      "Mariners schedule API error:",
      error
    );

    if (marinersCache.data) {
      return res.json({
        ...marinersCache.data,
        stale: true
      });
    }

    res.status(500).json({
      error:
        "Mariners schedule is temporarily unavailable."
    });
  }
});

/* ==========================
   Reddit RSS API
========================== */

app.get("/api/reddit", async (req, res) => {
  try {
    await loadRedditPosts();
    res.json(redditCache.data);
  } catch (error) {
    console.error("Reddit RSS error:", error);

    if (redditCache.data) {
      return res.json({
        ...redditCache.data,
        stale: true
      });
    }

    res.status(500).json({
      error:
        "Reddit content is temporarily unavailable."
    });
  }
});

async function loadRedditPosts() {
  const cacheIsValid =
    redditCache.data &&
    Date.now() - redditCache.timestamp < REDDIT_CACHE_MS;

  if (cacheIsValid) {
    return redditCache.data.posts;
  }

  try {
    const redditResponse = await fetch(REDDIT_FEED_URL, {
      headers: {
        "User-Agent": "ProjectMosaic/0.1 RaspberryPiDashboard",
        Accept: "application/atom+xml, application/xml, text/xml"
      }
    });

    if (!redditResponse.ok) {
      throw new Error("Reddit RSS request failed.");
    }

    const xml = await redditResponse.text();
    const posts = parseRedditFeed(xml);

    if (posts.length === 0) {
      throw new Error("Reddit RSS feed returned no usable posts.");
    }

    redditCache = {
      timestamp: Date.now(),
      data: {
        feed: REDDIT_FEED_URL,
        posts,
        updatedAt: new Date().toISOString()
      }
    };

    return posts;
  } catch (error) {
    if (redditCache.data?.posts?.length) {
      return redditCache.data.posts;
    }

    throw error;
  }
}

/* ==========================
   Discovery Aggregation API
========================== */

app.get("/api/discovery", async (req, res) => {
  const config = readConfig();

  if (!config.discovery.enabled) {
    return res.json({
      status: "disabled",
      items: []
    });
  }

  const items = await discoveryAggregator.getItems(
    config.discovery.sources
  );

  if (items.length === 0) {
    return res.status(503).json({
      status: "unavailable",
      items: []
    });
  }

  res.json({
    status: "available",
    items,
    updatedAt: new Date().toISOString()
  });
});

/* ==========================
   Server Startup
========================== */

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `Project Mosaic running at http://localhost:${PORT}`
    );
  });
}

module.exports = {
  app,
  acquireMlbDailySchedule,
  acquireSportsWidgetLeague,
  acquireSportsWidgetLeagues,
  buildSportsWidgetAcquisitionResponse,
  mlbDailyScheduleCache,
  resolveDiscoverySourceDraft,
  resolveSportsDate,
  sportsWidgetAcquisitionRegistry
};
