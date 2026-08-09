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

setInterval(loadWeather, 30 * 60 * 1000);

/* ==========================
   Widget Startup
========================== */

const testWidgetContainer = document.getElementById(
    "test-widget-container"
);

if (testWidgetContainer) {

    TestWidget.mount(testWidgetContainer);

}
