const weekGrid = document.getElementById("week-grid");
const todayDetailPanel = document.getElementById("today-detail-panel");
const prevButton = document.getElementById("prev-week");
const nextButton = document.getElementById("next-week");
const homeButton = document.getElementById("home-day");

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];



let selectedOffset = 0;

function getDateFromOffset(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date;
}

function getPlaceholderData(offset) {
  const samples = [
    { weather: "☁️ 68° / 55°", condition: "Cloudy", calendar: "1 Event" },
    { weather: "🌧️ 64° / 52°", condition: "Light Rain", calendar: "No Events" },
    { weather: "☀️ 72° / 58°", condition: "Mostly Sunny", calendar: "2 Events" },
    { weather: "🌤️ 74° / 57°", condition: "Partly Cloudy", calendar: "1 Event" },
    { weather: "☀️ 78° / 60°", condition: "Sunny", calendar: "3 Events" }
  ];

  return samples[Math.abs(offset) % samples.length];
}
const marinersSchedule = {
  "2026-07-08": { opponent: "@ Marlins", time: "3:40 PM" },
  "2026-07-09": { opponent: "@ Marlins", time: "3:40 PM" },
  "2026-07-10": { opponent: "@ Rays", time: "4:10 PM" },
  "2026-07-11": { opponent: "@ Rays", time: "1:10 PM" },
  "2026-07-12": { opponent: "@ Rays", time: "10:40 AM" },
  "2026-07-17": { opponent: "vs Giants", time: "7:10 PM" },
  "2026-07-18": { opponent: "vs Giants", time: "5:08 PM" },
  "2026-07-19": { opponent: "vs Giants", time: "1:10 PM" },
  "2026-07-20": { opponent: "vs Reds", time: "6:40 PM" },
  "2026-07-21": { opponent: "vs Reds", time: "6:40 PM" }
};

function getDateKey(date) {
  return date.toISOString().split("T")[0];
}

function getMarinersGame(date) {
  const key = getDateKey(date);
  return marinersSchedule[key] || null;
}

function buildRollingWeek() {
  weekGrid.innerHTML = "";

  for (let offset = selectedOffset - 3; offset <= selectedOffset + 3; offset++) {
    const date = getDateFromOffset(offset);
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

    const data = getPlaceholderData(offset);

column.innerHTML = `
  <div class="day-top">
    <div class="day-name">${dayLabels[date.getDay()]}</div>
    <div class="day-date">${date.getDate()}</div>
  </div>

  <div class="day-glance">

    <div class="day-glance-item">
        ${data.weather.split(" ")[1]}
    </div>

    <div class="day-glance-item">

        <div class="event-dots">
            <span></span>
            <span></span>
        </div>

        ${data.calendar.replace(" Events","").replace(" Event","").replace("No","0")}

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

function buildTodayDetailPanel() {
  const selectedDate = getDateFromOffset(selectedOffset);
  const isToday = selectedOffset === 0;
  const data = getPlaceholderData(selectedOffset);
  const marinersGame = getMarinersGame(selectedDate);

  todayDetailPanel.innerHTML = `
  <div class="today-panel-content">

  <div class="today-panel-item">
  <div class="today-panel-label">Mariners</div>
  <div class="today-panel-main">${marinersGame ? marinersGame.opponent : "Off Day"}</div>
  <div class="today-panel-sub">${marinersGame ? marinersGame.time : "No game scheduled"}</div>
</div> 
  
  <div class="today-panel-item">
      <div class="today-panel-label">Weather</div>
      <div class="today-panel-main">${data.weather}</div>
      <div class="today-panel-sub">${data.condition}</div>
    </div>

    <div class="today-panel-item">
      <div class="today-panel-label">Schedule</div>
      <div class="today-panel-main">${data.calendar}</div>
      <div class="today-panel-sub">${isToday ? "Current day" : "Selected day"}</div>
    </div>

    

  </div>
`;
}

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

updatePlanningZone();