const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const frontendPath = path.join(__dirname, "..", "frontend");
const configPath = path.join(__dirname, "..", "config.json");

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
    favoriteTeam: "SEA"
  },
  display: {
    theme: "mosaic"
  },
  profile: {
    name: ""
  },
  calendar: {
    enabled: true
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

let redditCache = {
  timestamp: 0,
  data: null
};

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
    const favoriteTeam = savedConfig?.sports?.favoriteTeam;
    const theme = savedConfig?.display?.theme;
    const profileName = savedConfig?.profile?.name;
    const calendarEnabled = savedConfig?.calendar?.enabled;

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
        favoriteTeam: typeof favoriteTeam === "string"
          ? favoriteTeam
          : DEFAULT_CONFIG.sports.favoriteTeam
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
          : DEFAULT_CONFIG.calendar.enabled
      }
    };
  } catch (error) {
    console.error("Unable to read config.json; using defaults:", error);
    return structuredClone(DEFAULT_CONFIG);
  }
}

function validateConfigUpdate(
  locationQuery,
  primaryLeague,
  theme,
  profileName,
  calendarEnabled,
  sportsEnabled,
  favoriteTeam
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

  if (typeof sportsEnabled !== "boolean") {
    throw new Error("Sports enabled must be a boolean.");
  }

  if (typeof favoriteTeam !== "string") {
    throw new Error("Favorite team must be a string.");
  }

  return {
    location: {
      query: locationQuery
    },
    sports: {
      primaryLeague,
      enabled: sportsEnabled,
      favoriteTeam
    },
    display: {
      theme
    },
    profile: {
      name: profileName
    },
    calendar: {
      enabled: calendarEnabled
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

  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mosaic Control</title>
</head>
<body>
  <h1>Mosaic Control</h1>
  <form method="post" action="/control">
    <fieldset>
      <legend>Who is this for?</legend>
      <label for="profile-name">Display Name</label>
      <input id="profile-name" name="profileName" type="text" value="${escapeHtml(config.profile.name)}" placeholder="Bryan">
    </fieldset>
    <fieldset>
      <legend>Where are you?</legend>
      <label for="location-query">City or ZIP Code</label>
      <input id="location-query" name="locationQuery" type="text" value="${escapeHtml(config.location.query)}" required>
    </fieldset>
    <fieldset>
      <legend>What sport do you follow?</legend>
      <select name="primaryLeague">${leagueOptions}</select>
      <label>
        <input name="sportsEnabled" type="checkbox" value="true"${config.sports.enabled ? " checked" : ""}>
        Sports Enabled
      </label>
      <label for="favorite-team">Favorite Team</label>
      <input id="favorite-team" name="favoriteTeam" type="text" value="${escapeHtml(config.sports.favoriteTeam)}" placeholder="SEA">
    </fieldset>
    <fieldset>
      <legend>How should Mosaic look?</legend>
      <label for="display-theme">Theme</label>
      <select id="display-theme" name="theme">${themeOptions}</select>
    </fieldset>
    <fieldset>
      <legend>Calendar</legend>
      <label>
        <input name="calendarEnabled" type="checkbox" value="true"${config.calendar.enabled ? " checked" : ""}>
        Calendar Enabled
      </label>
    </fieldset>
    <button type="submit">Save</button>
  </form>
  <script>
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
  </script>
</body>
</html>`);
});

app.post("/control", async (req, res) => {
  try {
    const config = validateConfigUpdate(
      req.body.locationQuery,
      req.body.primaryLeague,
      req.body.theme,
      req.body.profileName,
      req.body.calendarEnabled === "true",
      req.body.sportsEnabled === "true",
      req.body.favoriteTeam
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
        error.message === "Sports enabled must be a boolean." ||
        error.message === "Favorite team must be a string.");

    if (isValidationError) {
      return res.status(400).json({ error: error.message });
    }

    console.error("Unable to save configuration:", error);
    res.status(500).json({ error: "Configuration could not be saved." });
  }
});

app.get("/api/config", (req, res) => {
  const config = readConfig();

  res.json({
    display: config.display,
    profile: config.profile,
    calendar: config.calendar,
    sports: config.sports
  });
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
  const runs =
    linescoreData?.runs ??
    teamData?.score ??
    null;

  return {
    id: teamId,
    abbreviation:
      teamData?.team?.abbreviation || "",
    name: teamData?.team?.name || "Team TBD",
    logo: teamId
      ? `https://www.mlbstatic.com/team-logos/${teamId}.svg`
      : null,

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

function normalizeMlbEvent(game) {
  const linescore = game.linescore;

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
          inning: {
            number:
              linescore.currentInning ?? null,
            half:
              linescore.inningHalf || null
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
          }
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
        image: getImageFromContent(content)
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
        sportsEvents.push(normalizeMlbEvent(game));
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
    const cacheIsValid =
      redditCache.data &&
      Date.now() - redditCache.timestamp <
        REDDIT_CACHE_MS;

    if (cacheIsValid) {
      return res.json(redditCache.data);
    }

    const redditResponse = await fetch(
      REDDIT_FEED_URL,
      {
        headers: {
          "User-Agent":
            "ProjectMosaic/0.1 RaspberryPiDashboard",
          Accept:
            "application/atom+xml, application/xml, text/xml"
        }
      }
    );

    if (!redditResponse.ok) {
      throw new Error(
        `Reddit RSS request failed: ${redditResponse.status}`
      );
    }

    const xml = await redditResponse.text();
    const posts = parseRedditFeed(xml);

    if (posts.length === 0) {
      throw new Error(
        "Reddit RSS feed returned no usable posts."
      );
    }

    const responseData = {
      feed: REDDIT_FEED_URL,
      posts,
      updatedAt: new Date().toISOString()
    };

    redditCache = {
      timestamp: Date.now(),
      data: responseData
    };

    res.json(responseData);
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

/* ==========================
   Server Startup
========================== */

app.listen(PORT, () => {
  console.log(
    `Project Mosaic running at http://localhost:${PORT}`
  );
});
