const weekGrid = document.getElementById("week-grid");
const todayDetailPanel = document.getElementById("today-detail-panel");
const prevButton = document.getElementById("prev-week");
const nextButton = document.getElementById("next-week");
const homeButton = document.getElementById("home-day");

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

let selectedOffset = 0;

let weatherByDate = {};
let weatherLoaded = false;

let marinersByDate = {};
let marinersLoaded = false;

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
   Mariners Schedule
========================== */

function getMarinersGame(date) {
  return marinersByDate[getDateKey(date)] || null;
}

async function loadMarinersSchedule() {
  try {
    const response = await fetch("/api/sports/mlb/sea");

    if (!response.ok) {
      throw new Error(`Mariners request failed: ${response.status}`);
    }

    const scheduleData = await response.json();

    marinersByDate = {};

    scheduleData.games.forEach((game) => {
      marinersByDate[game.date] = game;
    });

    marinersLoaded = true;
  } catch (error) {
    console.error("Unable to load Mariners schedule:", error);
    marinersLoaded = false;
  }

  updatePlanningZone();
}

/* ==========================
   Timeline
========================== */

function buildRollingWeek() {
  weekGrid.innerHTML = "";

  for (
    let offset = selectedOffset - 3;
    offset <= selectedOffset + 3;
    offset++
  ) {
    const date = getDateFromOffset(offset);
    const weather = getWeatherForDate(date);
    const calendar = getCalendarData(offset);

    const column = document.createElement("div");

    if (offset === selectedOffset) {
      column.className = "day-column selected";
    } else if (offset < selectedOffset) {
      column.className = "day-column past";
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

    column.innerHTML = `
      <div class="day-top">

        <div class="day-name ${
          offset === selectedOffset ? "current-day-name" : ""
        }">
          ${
            offset === selectedOffset
              ? date.toLocaleDateString("en-US", { weekday: "long" })
              : dayLabels[date.getDay()]
          }
        </div>

        <div class="day-date">${date.getDate()}</div>

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

/* ==========================
   Selected-Day Details
========================== */

function buildTodayDetailPanel() {
  const selectedDate = getDateFromOffset(selectedOffset);
  const isToday = selectedOffset === 0;

  const weather = getWeatherForDate(selectedDate);
  const calendar = getCalendarData(selectedOffset);
  const marinersGame = getMarinersGame(selectedDate);

  const weatherMain = weather
    ? `${getWeatherIcon(weather.weatherCode)} ${weather.high}° / ${weather.low}°`
    : weatherLoaded
      ? "Forecast Unavailable"
      : "Loading Weather";

  const weatherSub = weather
    ? getWeatherDescription(weather.weatherCode)
    : weatherLoaded
      ? "Outside forecast range"
      : "Please wait";

  let marinersMain = "Loading Schedule";
  let marinersSub = "Please wait";

  if (marinersLoaded) {
    if (marinersGame) {
      marinersMain =
        `${marinersGame.matchupPrefix} ${marinersGame.opponent}`;

      marinersSub = marinersGame.startTime;
    } else {
      marinersMain = "Off Day";
      marinersSub = "No game scheduled";
    }
  }

  todayDetailPanel.innerHTML = `
    <div class="today-panel-content">

      <div class="today-panel-item">
        <div class="today-panel-label">Mariners</div>

        <div class="today-panel-main">
          ${marinersMain}
        </div>

        <div class="today-panel-sub">
          ${marinersSub}
        </div>
      </div>

      <div class="today-panel-item">
        <div class="today-panel-label">Weather</div>

        <div class="today-panel-main">
          ${weatherMain}
        </div>

        <div class="today-panel-sub">
          ${weatherSub}
        </div>
      </div>

      <div class="today-panel-item">
        <div class="today-panel-label">Schedule</div>

        <div class="today-panel-main">
          ${calendar.calendar}
        </div>

        <div class="today-panel-sub">
          ${isToday ? "Current day" : "Selected day"}
        </div>
      </div>

    </div>
  `;
}

/* ==========================
   Navigation
========================== */

function updateHomeButton() {
  if (selectedOffset === 0) {
    homeButton.classList.remove("visible");
  } else {
    homeButton.textContent = "Home";
    homeButton.classList.add("visible");
  }
}

function updatePlanningZone() {
  buildRollingWeek();
  buildTodayDetailPanel();
  updateHomeButton();
}

prevButton.addEventListener("click", () => {
  selectedOffset -= 1;
  updatePlanningZone();
});

nextButton.addEventListener("click", () => {
  selectedOffset += 1;
  updatePlanningZone();
});

homeButton.addEventListener("click", () => {
  selectedOffset = 0;
  updatePlanningZone();
});

/* ==========================
   Clock
========================== */

function updateClock() {
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit"
  });

  document.getElementById("clock-time").textContent = time;
}

updateClock();
setInterval(updateClock, 30000);

/* ==========================
   Startup
========================== */

updatePlanningZone();

loadWeather();
loadMarinersSchedule();

setInterval(loadWeather, 30 * 60 * 1000);
setInterval(loadMarinersSchedule, 6 * 60 * 60 * 1000);