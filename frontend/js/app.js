const weekGrid = document.getElementById("week-grid");
const todayDetailPanel = document.getElementById("today-detail-panel");
const prevButton = document.getElementById("prev-week");
const nextButton = document.getElementById("next-week");
const homeButton = document.getElementById("home-day");
const weatherLocation = document.getElementById("weather-location");
const weatherIcon = document.getElementById("weather-icon");
const weatherTemperature = document.getElementById("weather-temperature");
const weatherCondition = document.getElementById("weather-condition");
const weatherHigh = document.getElementById("weather-high");
const weatherLow = document.getElementById("weather-low");
const weatherPrecipitationDetail = document.getElementById(
  "weather-precipitation-detail"
);
const weatherPrecipitation = document.getElementById("weather-precipitation");
const sportsCategory = document.getElementById("sports-category");
const sportsStatus = document.getElementById("sports-status");
const sportsMatchup = document.getElementById("sports-matchup");
const sportsDetails = document.getElementById("sports-details");

const compactWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short"
});
const fullWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long"
});
const monthFormatter = new Intl.DateTimeFormat(undefined, {
  month: "long"
});

let selectedOffset = 0;
let timelineStartOffset = 0;

let weatherByDate = {};
let weatherLoaded = false;

let sportsEvents = [];
let sportsLoaded = false;
let sportsScheduleData = null;
let sportsRotationIndex = 0;

const SPORTS_ROTATION_MS = 15 * 1000;

/* ==========================
   Date Helpers
========================== */

function getDateFromOffset(offset) {
  const date = new Date();

  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);

  return date;
}

function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/* ==========================
   Placeholder Calendar Data
========================== */

function getCalendarData(offset) {
  const samples = [
    { calendar: "1 Event" },
    { calendar: "No Events" },
    { calendar: "2 Events" },
    { calendar: "1 Event" },
    { calendar: "3 Events" }
  ];

  return samples[Math.abs(offset) % samples.length];
}

function getEventCount(calendarText) {
  if (calendarText === "No Events") {
    return "0";
  }

  return calendarText
    .replace(" Events", "")
    .replace(" Event", "");
}

/* ==========================
   Weather
========================== */

function getWeatherDescription(code) {
  const descriptions = {
    0: "Clear",
    1: "Mostly Clear",
    2: "Partly Cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Freezing Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    56: "Freezing Drizzle",
    57: "Heavy Freezing Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Heavy Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Light Showers",
    81: "Showers",
    82: "Heavy Showers",
    85: "Light Snow Showers",
    86: "Heavy Snow Showers",
    95: "Thunderstorms",
    96: "Thunderstorms with Hail",
    99: "Severe Thunderstorms"
  };

  return descriptions[code] || "Weather Unavailable";
}

function getWeatherIcon(code) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";

  return "";
}

function getWeatherForDate(date) {
  return weatherByDate[getDateKey(date)] || null;
}

function renderWeatherWidget(weatherData) {
  const today = getWeatherForDate(getDateFromOffset(0));
  const current = weatherData?.current;

  if (!current || !today) {
    weatherLocation.textContent = "Weather unavailable";
    weatherIcon.textContent = "—";
    weatherTemperature.textContent = "—°";
    weatherCondition.textContent = "Unable to load conditions";
    weatherHigh.textContent = "—";
    weatherLow.textContent = "—";
    weatherPrecipitation.textContent = "—";
    weatherPrecipitationDetail.hidden = true;
    return;
  }

  weatherLocation.textContent = weatherData.location.name;
  weatherIcon.textContent = getWeatherIcon(current.weatherCode);
  weatherTemperature.textContent = `${current.temperature}°`;
  weatherCondition.textContent =
    getWeatherDescription(current.weatherCode);
  weatherHigh.textContent = today.high;
  weatherLow.textContent = today.low;
  weatherPrecipitationDetail.hidden =
    today.precipitationChance <= 0;

  if (today.precipitationChance > 0) {
    weatherPrecipitation.textContent =
      today.precipitationChance;
  }
}

async function loadWeather() {
  try {
    const response = await fetch("/api/weather");

    if (!response.ok) {
      throw new Error(`Weather request failed: ${response.status}`);
    }

    const weatherData = await response.json();

    weatherByDate = {};

    weatherData.daily.forEach((day) => {
      weatherByDate[day.date] = day;
    });

    weatherLoaded = true;
  } catch (error) {
    console.error("Unable to load weather:", error);
    weatherLoaded = false;
  }

  updatePlanningZone();
}

/* ==========================
   Sports Schedule
========================== */

function getTeamDisplayName(teamName) {
  const nameParts = teamName.trim().split(/\s+/);
  const compoundName = nameParts.slice(-2).join(" ");

  if (
    compoundName === "Blue Jays" ||
    compoundName === "Red Sox" ||
    compoundName === "White Sox"
  ) {
    return compoundName;
  }

  return nameParts.at(-1);
}

function createSportsTickerText(className, text) {
  const element = document.createElement("span");

  element.className = className;
  element.textContent = text;

  return element;
}

function formatTeamRecord(record) {
  if (
    record?.wins == null ||
    record?.losses == null
  ) {
    return "";
  }

  return `(${record.wins}-${record.losses})`;
}

function formatInningNumber(inningNumber) {
  const remainder = inningNumber % 100;

  if (remainder >= 11 && remainder <= 13) {
    return `${inningNumber}th`;
  }

  const suffixes = {
    1: "st",
    2: "nd",
    3: "rd"
  };

  return `${inningNumber}${
    suffixes[inningNumber % 10] || "th"
  }`;
}

function getLiveGameStatus(event) {
  const inningNumber =
    event.linescore?.inning?.number;
  const inningHalf =
    event.linescore?.inning?.half;
  const outs = event.linescore?.outs;
  const statusParts = [];

  if (inningNumber != null) {
    statusParts.push(
      [
        inningHalf,
        formatInningNumber(inningNumber)
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  if (outs != null) {
    statusParts.push(
      `${outs} ${outs === 1 ? "out" : "outs"}`
    );
  }

  return (
    statusParts.join(" · ") ||
    event.status.detail ||
    "Live"
  );
}

function createTeamIdentity(
  team,
  {
    className = "",
    displayName = team?.name || "Team TBD",
    showRecord = false
  } = {}
) {
  const identity = document.createElement("span");
  const logo = document.createElement("img");
  const text = document.createElement("span");
  const name = document.createElement("span");

  identity.className =
    `team-identity ${className}`.trim();
  identity.dataset.teamId = team?.id ?? "";
  identity.dataset.teamAbbreviation =
    team?.abbreviation || "";

  logo.className = "team-identity-logo";
  logo.alt = "";
  logo.src = team?.logo || "";
  logo.width = 26;
  logo.height = 26;
  logo.addEventListener("error", () => {
    logo.hidden = true;
  });

  text.className = "team-identity-text";
  name.className = "team-identity-name";
  name.textContent = displayName;
  text.appendChild(name);

  if (showRecord) {
    const formattedRecord =
      formatTeamRecord(team?.record);

    if (formattedRecord) {
      const record = document.createElement("span");

      record.className = "team-identity-record";
      record.textContent = formattedRecord;
      text.appendChild(record);
    }
  }

  if (team?.logo) {
    identity.appendChild(logo);
  }

  identity.appendChild(text);

  return identity;
}

function renderSportsTicker(scheduleData) {
  if (!scheduleData) {
    sportsCategory.textContent = "Sports";
    sportsStatus.textContent = "Unavailable";
    sportsMatchup.classList.remove("sports-matchup-layout");
    sportsMatchup.textContent = "No Data";
    sportsDetails.textContent = "—";
    return;
  }

  const event =
    scheduleData.sportsEvents[sportsRotationIndex] ||
    null;

  sportsCategory.textContent =
    scheduleData.sport;

  if (!event) {
    sportsStatus.textContent = "Idle";
    sportsMatchup.classList.remove("sports-matchup-layout");
    sportsMatchup.textContent = "No games scheduled";
    sportsDetails.textContent = scheduleData.date;
    return;
  }

  const awayTeamDisplayName =
    getTeamDisplayName(event.awayTeam.name);
  const homeTeamDisplayName =
    getTeamDisplayName(event.homeTeam.name);
  const isActive =
    event.status.state === "Live";
  const isFinal =
    event.status.state === "Final";

  if (isActive) {
    sportsStatus.textContent =
      getLiveGameStatus(event);
  } else if (isFinal) {
    sportsStatus.textContent = "Final";
  } else {
    sportsStatus.textContent = event.scheduledTime;
  }

  sportsDetails.textContent = "";
  sportsMatchup.classList.add("sports-matchup-layout");

  const scoreboard = document.createElement("span");
  const showGameStats = isActive || isFinal;
  const scoreboardCells = [
    ["sports-scoreboard-corner", ""],
    ["sports-scoreboard-heading", "R"],
    ["sports-scoreboard-heading", "H"],
    ["sports-scoreboard-heading", "E"],
    [
      "sports-scoreboard-value",
      event.awayTeam.runs ??
        event.awayTeam.score
    ],
    ["sports-scoreboard-value", event.awayTeam.hits],
    ["sports-scoreboard-value", event.awayTeam.errors],
    [
      "sports-scoreboard-value",
      event.homeTeam.runs ??
        event.homeTeam.score
    ],
    ["sports-scoreboard-value", event.homeTeam.hits],
    ["sports-scoreboard-value", event.homeTeam.errors]
  ];

  scoreboard.className = "sports-scoreboard";

  if (showGameStats) {
    for (const [className, value] of scoreboardCells.slice(0, 4)) {
      scoreboard.appendChild(
        createSportsTickerText(className, value)
      );
    }
  }

  scoreboard.appendChild(
    createTeamIdentity(event.awayTeam, {
      className: "sports-scoreboard-team sports-scoreboard-team-away",
      displayName: awayTeamDisplayName,
      showRecord: true
    })
  );

  if (showGameStats) {
    for (const [className, value] of scoreboardCells.slice(4, 7)) {
      scoreboard.appendChild(
        createSportsTickerText(
          className,
          value ?? "—"
        )
      );
    }
  }

  scoreboard.appendChild(
    createTeamIdentity(event.homeTeam, {
      className: "sports-scoreboard-team sports-scoreboard-team-home",
      displayName: homeTeamDisplayName,
      showRecord: true
    })
  );

  if (showGameStats) {
    for (const [className, value] of scoreboardCells.slice(7)) {
      scoreboard.appendChild(
        createSportsTickerText(
          className,
          value ?? "—"
        )
      );
    }
  }

  sportsMatchup.replaceChildren(scoreboard);
}

function advanceSportsTicker() {
  if (
    !sportsScheduleData ||
    sportsEvents.length < 2
  ) {
    return;
  }

  sportsRotationIndex =
    (sportsRotationIndex + 1) %
    sportsEvents.length;

  renderSportsTicker(sportsScheduleData);
}

async function loadSportsSchedule() {
  try {
    const date = getDateKey(getDateFromOffset(0));
    const response = await fetch(
      `/api/sports/mlb?date=${encodeURIComponent(date)}`
    );

    if (!response.ok) {
      throw new Error(`Sports request failed: ${response.status}`);
    }

    const scheduleData = await response.json();

    sportsEvents = scheduleData.sportsEvents;
    sportsRotationIndex = 0;
    sportsScheduleData = {
      ...scheduleData,
      sportsEvents
    };

    sportsLoaded = true;
    renderSportsTicker(sportsScheduleData);
  } catch (error) {
    console.error("Unable to load sports schedule:", error);
    sportsEvents = [];
    sportsLoaded = false;
    sportsScheduleData = null;
    sportsRotationIndex = 0;
    renderSportsTicker(null);
  }

  updatePlanningZone();
}

function buildRollingWeek() {
  weekGrid.innerHTML = "";

  for (
    let offset = timelineStartOffset;
    offset < timelineStartOffset + 5;
    offset++
  ) {

    const date = getDateFromOffset(offset);
    const weather = getWeatherForDate(date);
    const calendar = getCalendarData(offset);

    const column = document.createElement("div");
    const isAnchored = offset === timelineStartOffset;

    if (isAnchored) {
      column.className = "day-column selected";
    } else {
      column.className = "day-column future";
    }

    if (offset === 0) {
      column.classList.add("today");
    }

    const temperatureText = weather
      ? `${weather.high}°`
      : weatherLoaded
        ? "—"
        : "...";

    let dayLabel;

    if (isAnchored) {
      dayLabel = fullWeekdayFormatter.format(date).toUpperCase();
    } else {
      dayLabel = compactWeekdayFormatter.format(date).toUpperCase();
    }

    const monthMarkup = isAnchored
      ? `<div class="day-month">${monthFormatter.format(date).toUpperCase()}</div>`
      : "";

    column.innerHTML = `
      <div class="day-top">

        <div class="day-name">
          ${dayLabel}
        </div>

        ${monthMarkup}

        <div class="day-date">
          ${date.getDate()}
        </div>

      </div>

      <div class="day-glance">

        <div class="day-glance-item">
          ${temperatureText}
        </div>

        <div class="day-glance-item">

          <div class="event-dots">
            <span></span>
            <span></span>
          </div>

          ${getEventCount(calendar.calendar)}

        </div>

      </div>
    `;


    column.addEventListener("click", () => {

      selectedOffset = offset;

      updatePlanningZone();

    });


    weekGrid.appendChild(column);

  }
}
//* ==========================
//   Selected-Day Details
//========================== */

function buildTodayDetailPanel() {
  // Detail panel intentionally removed.
  // The Live Zone now owns all date-specific information.
  return;
}
/* ==========================
   Navigation
========================== */

function updateHomeButton() {

  if (timelineStartOffset === 0) {

    homeButton.classList.remove("visible");

  } else {

    homeButton.textContent = "RETURN TO TODAY";
    homeButton.classList.add("visible");

  }

}

function updatePlanningZone() {
  buildRollingWeek();
  buildTodayDetailPanel();
  updateHomeButton();
}

prevButton.addEventListener("click", () => {

  timelineStartOffset -= 1;

  updatePlanningZone();

});


nextButton.addEventListener("click", () => {

  timelineStartOffset += 1;

  updatePlanningZone();

});

homeButton.addEventListener("click", () => {

  selectedOffset = 0;
  timelineStartOffset = 0;

  updatePlanningZone();

});

/* ==========================
   Clock
========================== */

function updateClock() {
  const now = new Date();

  const timeParts = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  const [time, period] = timeParts.split(" ");

  document.getElementById("clock-time").textContent = time;

  document.getElementById("clock-period").textContent = period;
}

updateClock();
setInterval(updateClock, 30000);

/* ==========================
   Startup
========================== */

updatePlanningZone();

loadWeather();
loadSportsSchedule();

setInterval(loadWeather, 30 * 60 * 1000);
setInterval(loadSportsSchedule, 6 * 60 * 60 * 1000);
setInterval(advanceSportsTicker, SPORTS_ROTATION_MS);

/* ==========================
   Widget Startup
========================== */

const testWidgetContainer = document.getElementById(
    "test-widget-container"
);

if (testWidgetContainer) {

    TestWidget.mount(testWidgetContainer);

}
