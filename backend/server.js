const express = require("express");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  SPORTS_TEAM_REGISTRY,
  getSportsTeam
} = require("./sports-team-registry");
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
  normalizeDiscoverySources,
  normalizeFeedUrl,
  createPublicDiscoveryConfig
} = require("./discovery/discovery-source-config");
const {
  DiscoverySourceAdapterRegistry
} = require("./discovery/discovery-source-adapter-registry");
const {
  RedditDiscoveryAdapter
} = require("./discovery/reddit-discovery-adapter");
const {
  RssDiscoveryAdapter
} = require("./discovery/rss-discovery-adapter");
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
const calendarProviderMetadata =
  calendarProviderRegistry.getMetadata();
const defaultCalendarProvider =
  calendarProviderRegistry.getDefault().id;

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
    sources: normalizeDiscoverySources()
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
const MLB_LIVE_CACHE_MS = 15 * 1000;
const MLB_SCHEDULED_CACHE_MS = 5 * 60 * 1000;
const MLB_FINAL_CACHE_MS = 6 * 60 * 60 * 1000;
const MLB_PLAYER_SEASON_CACHE_MS = 30 * 60 * 1000;

const REDDIT_FEED_URL =
  "https://www.reddit.com/r/news+nottheonion+WeirdNews+OutOFTheLoop+onthisday/.rss?sort=hot";

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
  new RedditDiscoveryAdapter({ loadPosts: loadRedditPosts })
);
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
      renderer: team.renderer,
      providerId: team.providerId,
      logo: team.logo
    });

    return favorites;
  }, []);
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
  const leagueOptions = SUPPORTED_LEAGUES.map(
    (league) =>
      `<option value="${league}"${
        league === config.sports.primaryLeague ? " selected" : ""
      }>${league}</option>`
  ).join("");
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
  const teamOptions = SPORTS_TEAM_REGISTRY
    .filter((team) => !favoriteTeamIds.has(team.id))
    .map((team) =>
      `<option value="${team.id}">${escapeHtml(team.name)} (${team.league})</option>`
    )
    .join("");
  const favoriteTeamRows = config.sports.favoriteTeams.length > 0
    ? config.sports.favoriteTeams.map((team) => `
        <li class="item-row">
          <span class="item-copy"><strong>${escapeHtml(team.name)}</strong><small>${team.league}</small></span>
          <button class="button button-quiet" type="submit" name="removeTeamId" value="${team.id}" formaction="/control/favorite-teams/remove" formmethod="post">Remove</button>
        </li>`).join("")
    : "<li class=\"empty-state\">No favorite teams configured.</li>";
  const calendarProviderOptions = calendarProviderMetadata.map(
    (provider) =>
      `<option value="${escapeHtml(provider.id)}"${
        provider.id === config.calendar.provider ? " selected" : ""
      }>${escapeHtml(provider.name)}</option>`
  ).join("");
  const calendarSourceRows = config.calendar.sources.length > 0
    ? config.calendar.sources.map((source) => `
        <li class="item-row">
          <span class="item-copy"><strong><span class="status-dot${source.enabled ? " is-enabled" : ""}"></span>${escapeHtml(source.name)}</strong><small>${source.enabled ? "Enabled" : "Disabled"}</small></span>
          <span data-calendar-source-actions>
            <button class="button button-quiet" type="submit" name="calendarSourceId" value="${escapeHtml(source.id)}" formaction="/control/calendar-sources/toggle" formmethod="post">${source.enabled ? "Disable" : "Enable"}</button>
            <button class="button button-quiet" type="button" data-remove-calendar-source>Remove</button>
          </span>
          <div class="inline-confirmation" data-calendar-source-confirmation hidden>
            <strong>Remove ${escapeHtml(source.name)}?</strong>
            <p>This will stop Mosaic from displaying events from this calendar.</p>
            <div class="button-row">
              <button class="button button-quiet" type="button" data-cancel-calendar-source-removal>Cancel</button>
              <button class="button button-danger" type="submit" name="calendarSourceId" value="${escapeHtml(source.id)}" formaction="/control/calendar-sources/remove" formmethod="post">Remove Calendar</button>
            </div>
          </div>
        </li>`).join("")
    : "<li class=\"empty-state\">No Calendar sources configured.</li>";
  const discoveryTypeLabels = new Map(
    discoverySourceTypeMetadata.map((metadata) => [
      metadata.type,
      metadata.name
    ])
  );
  const discoverySourceTypeOptions = discoverySourceTypeMetadata
    .filter((metadata) => metadata.userAddable)
    .map((metadata) =>
      `<option value="${escapeHtml(metadata.type)}">${escapeHtml(metadata.name)}</option>`
    )
    .join("");
  const discoverySourceRows = config.discovery.sources.length > 0
    ? config.discovery.sources.map((source) => {
        const canRemove = source.type !== "reddit";

        return `
        <li class="item-row">
          <span class="item-copy"><strong><span class="status-dot${source.enabled ? " is-enabled" : ""}"></span>${escapeHtml(source.name)}</strong><small>${escapeHtml(discoveryTypeLabels.get(source.type) || source.type)} · ${source.enabled ? "Enabled" : "Disabled"}</small></span>
          <span data-discovery-source-actions>
            <button class="button button-quiet" type="submit" name="discoverySourceId" value="${escapeHtml(source.id)}" formaction="/control/discovery-sources/toggle" formmethod="post">${source.enabled ? "Disable" : "Enable"}</button>
            ${canRemove ? "<button class=\"button button-quiet\" type=\"button\" data-remove-discovery-source>Remove</button>" : ""}
          </span>
          ${canRemove ? `
          <div class="inline-confirmation" data-discovery-source-confirmation hidden>
            <strong>Remove ${escapeHtml(source.name)}?</strong>
            <p>This will stop Mosaic from displaying items from this source.</p>
            <div class="button-row">
              <button class="button button-quiet" type="button" data-cancel-discovery-source-removal>Cancel</button>
              <button class="button button-danger" type="submit" name="discoverySourceId" value="${escapeHtml(source.id)}" formaction="/control/discovery-sources/remove" formmethod="post">Remove Source</button>
            </div>
          </div>` : ""}
        </li>`;
      }).join("")
    : "<li class=\"empty-state\">No Discovery sources configured.</li>";

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mosaic Control</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #18222f;
      background: #d8e1e9;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at 10% 3%, rgba(218, 230, 239, .78), transparent 34%), radial-gradient(circle at 88% 16%, rgba(170, 193, 213, .42), transparent 36%), radial-gradient(circle at 46% 92%, rgba(194, 202, 218, .3), transparent 38%), linear-gradient(145deg, #dfe7ee 0%, #ced9e2 52%, #dae2e9 100%); background-attachment: fixed; }
    button, input, select { font: inherit; }
    button { cursor: pointer; }
    .control-shell { width: min(1120px, calc(100% - 32px)); margin: 0 auto; padding: 48px 0 64px; }
    .control-header { margin-bottom: 32px; }
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
    input[type="text"], input[type="url"], select { width: 100%; min-height: 44px; padding: 10px 12px; color: #172033; border: 1px solid rgba(91, 115, 139, .24); border-radius: 10px; background: rgba(229, 238, 245, .78); box-shadow: inset 0 1px 2px rgba(43, 58, 76, .065), 0 1px 0 rgba(246, 250, 253, .55); backdrop-filter: blur(8px); }
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
    [data-calendar-source-actions], [data-discovery-source-actions] { display: flex; gap: 6px; }
    .status-dot { display: inline-block; width: 8px; height: 8px; margin-right: 8px; border-radius: 50%; background: #94a3b8; }
    .status-dot.is-enabled { background: #16a34a; box-shadow: 0 0 0 3px rgba(22, 163, 74, .12); }
    .empty-state { padding: 16px; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 11px; text-align: center; }
    .button-row { display: flex; flex-wrap: wrap; gap: 9px; align-items: center; }
    .add-team-row { margin-top: 14px; }
    .button { min-height: 40px; padding: 9px 14px; border: 0; border-radius: 9px; font-weight: 700; }
    .button-primary { color: #fff; background: linear-gradient(145deg, #2b61d5, #1d4fc0); box-shadow: 0 5px 14px rgba(29, 78, 216, .2), inset 0 1px 0 rgba(255, 255, 255, .2); }
    .button-secondary { color: #1d4ed8; background: rgba(210, 224, 241, .78); box-shadow: inset 0 1px 0 rgba(243, 248, 252, .52); }
    .button-quiet { min-height: 34px; padding: 7px 10px; color: #475569; background: transparent; }
    .button-danger { color: #fff; background: #b42318; }
    .button:disabled { cursor: not-allowed; opacity: .5; }
    .inline-form { display: grid; grid-template-columns: minmax(0, .7fr) minmax(0, 1.3fr) auto; gap: 10px; align-items: end; }
    .discovery-source-form { grid-template-columns: minmax(0, .65fr) minmax(150px, .45fr) minmax(0, 1.3fr) auto; }
    .inline-confirmation { grid-column: 1 / -1; padding: 14px; border-left: 3px solid #b42318; border-radius: 8px; background: #fff1f0; }
    .inline-confirmation p { margin: 5px 0 12px; color: #7f1d1d; font-size: .88rem; }
    .developer-card { background: linear-gradient(150deg, rgba(193, 208, 220, .82), rgba(173, 193, 209, .72)); }
    .save-bar { position: sticky; bottom: 16px; z-index: 5; display: flex; justify-content: flex-end; padding: 12px; border: 1px solid rgba(236, 244, 249, .52); border-radius: 14px; background: rgba(219, 230, 238, .9); box-shadow: 0 10px 30px rgba(15, 23, 42, .12), inset 0 1px 0 rgba(246, 250, 253, .58); backdrop-filter: blur(14px); }
    .save-status { align-self: center; margin-right: auto; padding: 0 10px; color: #64748b; font-size: .86rem; font-weight: 650; }
    [hidden] { display: none !important; }
    @media (max-width: 760px) {
      .control-shell { width: min(100% - 20px, 620px); padding-top: 28px; }
      .settings-surface { padding: 20px; border-radius: 18px; }
      .card-grid { grid-template-columns: 1fr; }
      .settings-card-wide, .field-full { grid-column: auto; }
      .inline-form { grid-template-columns: 1fr; }
      .item-row { align-items: start; }
      .save-bar { bottom: 8px; }
    }
    @media (max-width: 460px) {
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
      <p class="eyebrow">Mosaic</p>
      <h1>Control Center</h1>
      <p class="control-intro">Shape what Mosaic shows and how it supports your day.</p>
    </header>
    <form class="settings-form" method="post" action="/control">
      <div class="settings-surface">
      <div class="section-heading"><h2>Personalization</h2><p>Basic details Mosaic uses to make information relevant.</p></div>
      <div class="card-grid">
        <section class="settings-card">
          <div class="field"><label for="profile-name">Display name</label><input id="profile-name" name="profileName" type="text" value="${escapeHtml(config.profile.name)}" placeholder="Bryan"></div>
        </section>
        <section class="settings-card">
          <div class="field"><label for="location-query">City or ZIP code</label><input id="location-query" name="locationQuery" type="text" value="${escapeHtml(config.location.query)}" required></div>
        </section>
      </div>

      <div class="section-heading"><h2>Appearance</h2><p>Choose the visual character of your dashboard.</p></div>
      <div class="card-grid">
        <section class="settings-card settings-card-wide">
          <div class="field"><label for="display-theme">Theme</label><select id="display-theme" name="theme">${themeOptions}</select></div>
        </section>
      </div>

      <div class="section-heading"><h2>Information Sources</h2><p>Choose which parts of your life Mosaic keeps in view.</p></div>
      <div class="card-grid">
        <section class="settings-card" data-feature-card>
          <div class="card-header">
            <div><h3>Calendar</h3><p class="card-description">Upcoming events and timely reminders.</p></div>
            <label class="switch"><input name="calendarEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Calendar" aria-controls="calendar-settings"${config.calendar.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="calendar-settings" data-feature-content${config.calendar.enabled ? "" : " hidden"}>
            <div class="field"><label for="calendar-provider">Calendar service</label><select id="calendar-provider" name="calendarProvider">${calendarProviderOptions}</select></div>
            <h4 class="subsection-title">Your calendars</h4>
            <ul class="item-list">${calendarSourceRows}</ul>
            <h4 class="subsection-title">Add a calendar</h4>
            <div class="inline-form">
              <div class="field"><label for="calendar-source-name">Nickname</label><input id="calendar-source-name" name="calendarSourceName" type="text" placeholder="Personal"></div>
              <div class="field"><label for="calendar-source-url">iCal address</label><input id="calendar-source-url" name="calendarSourceUrl" type="url" placeholder="https://calendar.example.com/feed.ics"></div>
              <button class="button button-secondary" type="submit" formaction="/control/calendar-sources/add" formmethod="post">Add Calendar</button>
            </div>
          </div>
        </section>

        <section class="settings-card" data-feature-card>
          <div class="card-header">
            <div><h3>Discovery</h3><p class="card-description">Passive-interest stories, images, and feeds.</p></div>
            <label class="switch"><input name="discoveryEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Discovery" aria-controls="discovery-settings"${config.discovery.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="discovery-settings" data-feature-content${config.discovery.enabled ? "" : " hidden"}>
            <h4 class="subsection-title">Sources</h4>
            <ul class="item-list">${discoverySourceRows}</ul>
            <h4 class="subsection-title">Add a source</h4>
            <div class="inline-form discovery-source-form">
              <div class="field"><label for="discovery-source-name">Nickname</label><input id="discovery-source-name" name="discoverySourceName" type="text" placeholder="Technology News"></div>
              <div class="field"><label for="discovery-source-type">Source type</label><select id="discovery-source-type" name="discoverySourceType">${discoverySourceTypeOptions}</select></div>
              <div class="field"><label for="discovery-source-url">Feed address</label><input id="discovery-source-url" name="discoverySourceUrl" type="url" placeholder="https://example.com/feed.xml"></div>
              <button class="button button-secondary" type="submit" formaction="/control/discovery-sources/add" formmethod="post">Add Source</button>
            </div>
          </div>
        </section>

        <section class="settings-card" data-feature-card>
          <div class="card-header">
            <div><h3>Sports</h3><p class="card-description">Favorite teams and game awareness.</p></div>
            <label class="switch"><input name="sportsEnabled" type="checkbox" value="true" data-feature-toggle aria-label="Enable Sports" aria-controls="sports-settings"${config.sports.enabled ? " checked" : ""}><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="sports-settings" data-feature-content${config.sports.enabled ? "" : " hidden"}>
            <div class="field"><label for="primary-league">Primary league</label><select id="primary-league" name="primaryLeague">${leagueOptions}</select></div>
            <h4 class="subsection-title">Favorite teams</h4>
            <ul class="item-list">${favoriteTeamRows}</ul>
            <div class="button-row add-team-row">
              <select id="favorite-team" name="addTeamId" aria-label="Add favorite team"${teamOptions ? "" : " disabled"}>${teamOptions || "<option>All available teams added</option>"}</select>
              <button class="button button-secondary" type="submit" formaction="/control/favorite-teams/add" formmethod="post"${teamOptions ? "" : " disabled"}>Add team</button>
            </div>
          </div>
        </section>
      </div>

      <div class="section-heading"><h2>Developer Tools</h2><p>Optional controls for testing Mosaic experiences.</p></div>
      <div class="card-grid">
        <section class="settings-card settings-card-wide developer-card" data-feature-card>
          <div class="card-header">
            <div><h3>Sports Demo</h3><p class="card-description">Preview simulated game states on the running dashboard. Demo state is never saved.</p></div>
            <label class="switch"><input id="sports-demo-enabled" type="checkbox" data-feature-toggle aria-label="Enable Sports Demo" aria-controls="sports-demo-settings"><span class="switch-track"></span><span class="switch-state"></span></label>
          </div>
          <div class="settings-content" id="sports-demo-settings" data-feature-content hidden>
            <div class="button-row">
              <button class="button button-secondary" type="button" data-sports-demo-action="scheduled">Scheduled</button>
              <button class="button button-secondary" type="button" data-sports-demo-action="live">Live</button>
              <button class="button button-secondary" type="button" data-sports-demo-action="final">Final</button>
              <button class="button button-quiet" type="button" data-sports-demo-action="clear">Clear</button>
            </div>
          </div>
        </section>
      </div>
      </div>

      <div class="save-bar"><span class="save-status" data-save-status role="status" aria-live="polite" hidden>Unsaved changes</span><button class="button button-primary" type="submit">Save Changes</button></div>
    </form>
  </main>
  <script>
    (() => {
      const form = document.querySelector(".settings-form");
      const status = document.querySelector("[data-save-status]");
      const savedFieldNames = new Set([
        "profileName",
        "locationQuery",
        "theme",
        "calendarEnabled",
        "calendarProvider",
        "discoveryEnabled",
        "sportsEnabled",
        "primaryLeague"
      ]);

      const showPendingState = (event) => {
        if (!savedFieldNames.has(event.target.name)) return;

        status.hidden = false;
      };

      form.addEventListener("input", showPendingState);
      form.addEventListener("change", showPendingState);
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
      const themeSelect = document.getElementById("display-theme");

      if (
        !themeSelect ||
        typeof BroadcastChannel !== "function"
      ) {
        return;
      }

      const channel = new BroadcastChannel(
        "mosaic-theme-preview"
      );

      themeSelect.addEventListener("change", () => {
        channel.postMessage({
          theme: themeSelect.value
        });
      });

      window.addEventListener(
        "pagehide",
        () => channel.close(),
        { once: true }
      );
    })();

    (() => {
      const buttons = document.querySelectorAll(
        "[data-sports-demo-action]"
      );
      const allowedActions = new Set([
        "scheduled",
        "live",
        "final",
        "clear"
      ]);

      if (typeof BroadcastChannel !== "function") {
        buttons.forEach((button) => {
          button.disabled = true;
          button.title =
            "Sports Demo requires BroadcastChannel support.";
        });
        return;
      }

      const channel = new BroadcastChannel(
        "mosaic-sports-demo"
      );

      buttons.forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.dataset.sportsDemoAction;

          if (!allowedActions.has(action)) return;

          channel.postMessage({ action });
        });
      });

      window.addEventListener(
        "pagehide",
        () => channel.close(),
        { once: true }
      );
    })();

    (() => {
      document.querySelectorAll(
        "[data-remove-calendar-source]"
      ).forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("li");
          const actions = row.querySelector(
            "[data-calendar-source-actions]"
          );
          const confirmation = row.querySelector(
            "[data-calendar-source-confirmation]"
          );

          actions.hidden = true;
          confirmation.hidden = false;
        });
      });

      document.querySelectorAll(
        "[data-cancel-calendar-source-removal]"
      ).forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("li");
          const actions = row.querySelector(
            "[data-calendar-source-actions]"
          );
          const confirmation = row.querySelector(
            "[data-calendar-source-confirmation]"
          );

          confirmation.hidden = true;
          actions.hidden = false;
        });
      });
    })();

    (() => {
      document.querySelectorAll(
        "[data-remove-discovery-source]"
      ).forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("li");
          const actions = row.querySelector(
            "[data-discovery-source-actions]"
          );
          const confirmation = row.querySelector(
            "[data-discovery-source-confirmation]"
          );

          actions.hidden = true;
          confirmation.hidden = false;
        });
      });

      document.querySelectorAll(
        "[data-cancel-discovery-source-removal]"
      ).forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("li");
          const actions = row.querySelector(
            "[data-discovery-source-actions]"
          );
          const confirmation = row.querySelector(
            "[data-discovery-source-confirmation]"
          );

          confirmation.hidden = true;
          actions.hidden = false;
        });
      });
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
      currentConfig.calendar.sources,
      req.body.sportsEnabled === "true",
      currentConfig.sports.favoriteTeams,
      req.body.discoveryEnabled === "true",
      currentConfig.discovery.sources
    );
    await writeConfig(config);
    res.redirect(303, "/control");
  } catch (error) {
    const isValidationError = error instanceof Error &&
      (error.message === "Location must not be empty." ||
        error.message === "League must be MLB, NFL, NBA, or NHL." ||
        error.message === "Theme selection is invalid." ||
        error.message === "Display name must be a string." ||
        error.message === "Calendar enabled must be a boolean." ||
        error.message === "Calendar provider is invalid." ||
        error.message === "Sports enabled must be a boolean." ||
        error.message === "Favorite teams must be an array." ||
        error.message === "Discovery enabled must be a boolean." ||
        error.message === "Discovery sources must be an array.");

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
    const type = typeof req.body.discoverySourceType === "string"
      ? req.body.discoverySourceType.trim()
      : "";
    const url = normalizeFeedUrl(req.body.discoverySourceUrl);
    const adapterMetadata = discoverySourceTypeMetadata.find(
      (metadata) => metadata.type === type && metadata.userAddable
    );

    if (!name) {
      return res.status(400).json({
        error: "Discovery source nickname must not be empty."
      });
    }

    if (!adapterMetadata || !url) {
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

    if (!source || source.type === "reddit") {
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
   Reddit RSS Helpers
========================== */

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value = "") {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getXmlTag(block, tagName) {
  const pattern = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );

  const match = block.match(pattern);

  return match ? decodeEntities(match[1]).trim() : "";
}

function getEntryLink(entry) {
  const alternateLink = entry.match(
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i
  );

  if (alternateLink) {
    return decodeEntities(alternateLink[1]);
  }

  const anyLink = entry.match(
    /<link[^>]*href=["']([^"']+)["']/i
  );

  return anyLink ? decodeEntities(anyLink[1]) : "";
}

function getImageFromContent(content) {
  const decodedContent = decodeEntities(content);

  const imageMatch = decodedContent.match(
    /<img[^>]+src=["']([^"']+)["']/i
  );

  if (!imageMatch) {
    return null;
  }

  const imageUrl = decodeEntities(imageMatch[1]);

  if (
    imageUrl.includes("redditstatic.com/icon") ||
    imageUrl.includes("redditstatic.com/avatars")
  ) {
    return null;
  }

  return imageUrl;
}

function getBodyFromContent(content, title) {
  const decodedContent = decodeEntities(content);
  const bodyMatch = decodedContent.match(
    /<div[^>]*class=["'][^"']*\bmd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  if (!bodyMatch) {
    return null;
  }

  const body = stripTags(bodyMatch[1]);

  if (
    !body ||
    body.localeCompare(title, undefined, {
      sensitivity: "base"
    }) === 0
  ) {
    return null;
  }

  return body;
}

function getSubredditFromLink(link) {
  const match = link.match(/reddit\.com\/r\/([^/]+)/i);

  return match ? `r/${match[1]}` : "Reddit";
}

function parseRedditFeed(xml) {
  const entries =
    xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  return entries
    .map((entry) => {
      const title = stripTags(getXmlTag(entry, "title"));
      const link = getEntryLink(entry);
      const authorBlock = getXmlTag(entry, "author");
      const author = stripTags(
        getXmlTag(authorBlock, "name")
      );
      const published = getXmlTag(entry, "published");
      const updated = getXmlTag(entry, "updated");
      const content = getXmlTag(entry, "content");

      return {
        title,
        link,
        subreddit: getSubredditFromLink(link),
        author,
        publishedAt: published || updated || null,
        image: getImageFromContent(content),
        body: getBodyFromContent(content, title)
      };
    })
    .filter((post) => post.title && post.link)
    .slice(0, 25);
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

async function handleMlbDailySchedule(req, res) {
  const requestedDate =
    typeof req.query.date === "string"
      ? req.query.date
      : formatLocalDate(new Date());

  if (!isValidDateKey(requestedDate)) {
    return res.status(400).json({
      error: "Date must use YYYY-MM-DD format."
    });
  }

  const cachedSchedule =
    mlbDailyScheduleCache.get(requestedDate);

  try {
    const cacheIsValid =
      cachedSchedule &&
      Date.now() - cachedSchedule.timestamp <
        cachedSchedule.ttl;

    if (cacheIsValid) {
      return res.json(cachedSchedule.data);
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

    res.json(responseData);
  } catch (error) {
    console.error(
      "MLB daily schedule API error:",
      error
    );

    if (cachedSchedule?.data) {
      return res.json({
        ...cachedSchedule.data,
        stale: true
      });
    }

    res.status(500).json({
      error:
        "MLB daily schedule is temporarily unavailable."
    });
  }
}

app.get("/api/sports", (req, res) => {
  const primaryLeague = readConfig().sports.primaryLeague;

  if (primaryLeague === "MLB") {
    return handleMlbDailySchedule(req, res);
  }

  return res.status(501).json({
    error: {
      code: "LEAGUE_NOT_IMPLEMENTED",
      message: `${primaryLeague} data is not yet implemented.`
    },
    sport: primaryLeague,
    sportsEvents: []
  });
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

app.listen(PORT, () => {
  console.log(
    `Project Mosaic running at http://localhost:${PORT}`
  );
});
