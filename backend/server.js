const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

const frontendPath = path.join(__dirname, "..", "frontend");

/* ==========================
   Configuration
========================== */

const WEATHER_LOCATION = "98402";
const WEATHER_CACHE_MS = 30 * 60 * 1000;

const MARINERS_TEAM_ID = 136;
const SPORTS_CACHE_MS = 6 * 60 * 60 * 1000;

const DISPLAY_TIME_ZONE = "America/Los_Angeles";

/* ==========================
   Caches
========================== */

let weatherCache = {
  timestamp: 0,
  data: null
};

let marinersCache = {
  timestamp: 0,
  data: null
};

/* ==========================
   Static Frontend
========================== */

app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ==========================
   Helpers
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

/* ==========================
   Weather API
========================== */

app.get("/api/weather", async (req, res) => {
  try {
    const cacheIsValid =
      weatherCache.data &&
      Date.now() - weatherCache.timestamp < WEATHER_CACHE_MS;

    if (cacheIsValid) {
      return res.json(weatherCache.data);
    }

    const locationParams = new URLSearchParams({
      name: WEATHER_LOCATION,
      count: "1",
      language: "en",
      format: "json",
      countryCode: "US"
    });

    const locationResponse = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?${locationParams}`
    );

    if (!locationResponse.ok) {
      throw new Error(`Location lookup failed: ${locationResponse.status}`);
    }

    const locationData = await locationResponse.json();
    const location = locationData.results?.[0];

    if (!location) {
      throw new Error(`No location found for ZIP code ${WEATHER_LOCATION}`);
    }

    const forecastParams = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),

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
      throw new Error(`Weather request failed: ${forecastResponse.status}`);
    }

    const forecastData = await forecastResponse.json();

    const responseData = {
      location: {
        name: location.name,
        state: location.admin1,
        postalCode: WEATHER_LOCATION,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone: forecastData.timezone
      },

      daily: forecastData.daily.time.map((date, index) => ({
        date,
        weatherCode: forecastData.daily.weather_code[index],
        high: Math.round(forecastData.daily.temperature_2m_max[index]),
        low: Math.round(forecastData.daily.temperature_2m_min[index]),
        precipitationChance:
          forecastData.daily.precipitation_probability_max[index]
      })),

      updatedAt: new Date().toISOString()
    };

    weatherCache = {
      timestamp: Date.now(),
      data: responseData
    };

    res.json(responseData);
  } catch (error) {
    console.error("Weather API error:", error);

    if (weatherCache.data) {
      return res.json({
        ...weatherCache.data,
        stale: true
      });
    }

    res.status(500).json({
      error: "Weather data is temporarily unavailable."
    });
  }
});

/* ==========================
   Mariners Schedule API
========================== */

app.get("/api/sports/mlb/sea", async (req, res) => {
  try {
    const cacheIsValid =
      marinersCache.data &&
      Date.now() - marinersCache.timestamp < SPORTS_CACHE_MS;

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
          game.teams?.home?.team?.id === MARINERS_TEAM_ID;

        const opponentTeam = isHome
          ? game.teams?.away?.team
          : game.teams?.home?.team;

        games.push({
          gameId: game.gamePk,
          date: formatLocalDate(game.gameDate),
          startTime: formatLocalTime(game.gameDate),

          opponent: opponentTeam?.name || "Opponent TBD",
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
    console.error("Mariners schedule API error:", error);

    if (marinersCache.data) {
      return res.json({
        ...marinersCache.data,
        stale: true
      });
    }

    res.status(500).json({
      error: "Mariners schedule is temporarily unavailable."
    });
  }
});

/* ==========================
   Server Startup
========================== */

app.listen(PORT, () => {
  console.log(`Project Mosaic running at http://localhost:${PORT}`);
});