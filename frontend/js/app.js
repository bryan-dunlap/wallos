const weekGrid = document.getElementById("week-grid");
const todayDetailPanel = document.getElementById("today-detail-panel");

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const placeholderDetails = [
  { weather: "☁️ 68°", events: "Recent" },
  { weather: "🌧️ 64°", events: "Recent" },
  { weather: "☀️ 72°", events: "Recent" },
  { weather: "☀️ 72° / 58°", condition: "Mostly Sunny" },
  { weather: "🌤️ 74°", events: "Upcoming" },
  { weather: "☀️ 78°", events: "Upcoming" },
  { weather: "⚾ 7:10", events: "Mariners" }
];

function buildRollingWeek() {
  const today = new Date();

  weekGrid.innerHTML = "";

  for (let offset = -3; offset <= 3; offset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);

    const index = offset + 3;
    const detail = placeholderDetails[index];

    const column = document.createElement("div");

    if (offset < 0) {
      column.className = "day-column past";
    } else if (offset === 0) {
      column.className = "day-column today";
    } else {
      column.className = "day-column future";
    }

    if (offset === 0) {
      column.innerHTML = `
        <div class="day-top">
          <div class="day-name">${dayLabels[date.getDay()]}</div>
          <div class="day-date">${date.getDate()}</div>
        </div>
      `;
    } else {
      column.innerHTML = `
        <div class="day-top">
          <div class="day-name">${dayLabels[date.getDay()]}</div>
          <div class="day-date">${date.getDate()}</div>
        </div>

        <div class="day-weather">${detail.weather}</div>
        <div class="day-events">${detail.events}</div>
      `;
    }

    weekGrid.appendChild(column);
  }
}

function buildTodayDetailPanel() {
  todayDetailPanel.innerHTML = `
    <div class="today-panel-content">

      <div class="today-panel-item">
        <div class="today-panel-label">Weather</div>
        <div class="today-panel-main">☀️ 72° / 58°</div>
        <div class="today-panel-sub">Mostly Sunny</div>
      </div>

      <div class="today-panel-item">
        <div class="today-panel-label">Mariners</div>
        <div class="today-panel-main">⚾ 7:10 PM</div>
        <div class="today-panel-sub">vs Yankees</div>
      </div>

      <div class="today-panel-item">
        <div class="today-panel-label">Calendar</div>
        <div class="today-panel-main">📅 2 Events</div>
        <div class="today-panel-sub">Next: 8:00 AM</div>
      </div>

    </div>
  `;
}

buildRollingWeek();
buildTodayDetailPanel();