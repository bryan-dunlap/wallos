const fs = require("node:fs");
const WebSocket = require("ws");

const endpoint = process.argv[2];
const outputDirectory = process.argv[3] || "/tmp/mosaic-expanded-validation";

if (!endpoint) throw new Error("A DevTools page WebSocket endpoint is required.");
fs.mkdirSync(outputDirectory, { recursive: true });

const socket = new WebSocket(endpoint);
let requestId = 0;
const pending = new Map();

function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

socket.on("message", (data) => {
  const message = JSON.parse(data);
  if (!message.id || !pending.has(message.id)) return;
  const handler = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handler.reject(new Error(message.error.message));
  else handler.resolve(message.result);
});

function evaluate(expression) {
  return command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  }).then((result) => result.result.value);
}

const weatherPayload = (overrides = {}) => ({
  status: "available",
  stale: false,
  location: "Tacoma, WA",
  temperature: 64,
  apparentTemperature: 62,
  condition: "Partly cloudy",
  icon: "🌤️",
  high: 70,
  low: 51,
  precipitation: 0,
  hourly: [11, 12, 13, 14, 15].map((hour, index) => ({
    at: `2026-09-26T${hour}:00`,
    temperature: 65 + index,
    precipitationChance: 0,
    condition: "Partly cloudy",
    icon: "🌤️"
  })),
  ...overrides
});

function sportsEvents(longNames = false) {
  const names = longNames
    ? ["Metropolitan Seattle Mariners", "Los Angeles American League Angels"]
    : ["Mariners", "Angels"];
  const create = (id, league, status, away, home, scores) => ({
    league,
    id,
    type: "game",
    status,
    participants: {
      away: { name: away, record: "90-60", logo: "" },
      home: { name: home, record: "70-80", logo: "" }
    },
    scores,
    state: {
      scheduledTime: "7:10 PM",
      scheduledAt: "2026-09-26T12:00:00.000Z",
      statusDetail: status === "live" ? "Top 8th" : ""
    },
    details: {
      baseball: {
        inning: status === "live" ? { half: "top", number: 8 } : null,
        teamStats: {
          away: { hits: 8, errors: 0 },
          home: { hits: 6, errors: 1 }
        }
      },
      football: { quarters: {} }
    }
  });
  return [
    create("one", "MLB", "live", names[0], names[1], { away: 5, home: 3 }),
    create("two", "NFL", "scheduled", "Seahawks", "Rams", { away: null, home: null }),
    create("three", "MLB", "final", "Astros", "Yankees", { away: 2, home: 4 })
  ];
}

function performerSummary(longNames = false, partial = false) {
  return {
    teams: {
      away: {
        name: "Mariners",
        entries: [
          { role: "Batter", name: longNames ? "Julio Daniel Rodríguez Extremely Long Name" : "Julio Rodríguez", summary: "2–4 · HR · 3 RBI" },
          ...(!partial ? [{ role: "Pitcher", name: "Logan Gilbert", summary: "6.0 IP · 2 ER · 7 K" }] : [])
        ]
      },
      home: {
        name: "Angels",
        entries: partial ? [] : [
          { role: "Batter", name: "Mike Trout", summary: "2–3 · 2B · RBI" },
          { role: "Pitcher", name: "José Soriano", summary: "5.1 IP · 4 ER · 5 K" }
        ]
      }
    }
  };
}

const homeEntities = [
  { domain: "light", displayName: "Reading Lamp", state: "off", availability: "available" },
  { domain: "binary_sensor", displayName: "Patio Entry Door", state: "on", deviceClass: "door", availability: "available" },
  { domain: "sensor", displayName: "Upstairs Temperature", state: "72", unit: "°F", deviceClass: "temperature", availability: "available" },
  { domain: "light", displayName: "Kitchen Pendants", state: "on", availability: "available" },
  { domain: "cover", displayName: "Garage Door", state: "unavailable", icon: "mdi:garage", availability: "unavailable" },
  { domain: "binary_sensor", displayName: "Hall Motion", state: "off", deviceClass: "motion", availability: "available" },
  { domain: "lock", displayName: "Front Door", state: "locked", availability: "available" },
  { domain: "sensor", displayName: "Basement Humidity", state: "46", unit: "%", deviceClass: "humidity", availability: "available" }
];

const homeAssistantVisualCases = [
  ["home-door-closed", [{ domain: "binary_sensor", displayName: "Front Door", state: "off", deviceClass: "door", availability: "available" }]],
  ["home-door-open", [{ domain: "binary_sensor", displayName: "Front Door", state: "on", deviceClass: "door", availability: "available" }]],
  ["home-lock-locked", [{ domain: "lock", displayName: "Front Door", state: "locked", availability: "available" }]],
  ["home-lock-unlocked", [{ domain: "lock", displayName: "Front Door", state: "unlocked", availability: "available" }]],
  ["home-light-on", [{ domain: "light", displayName: "Reading Lamp", state: "on", availability: "available" }]],
  ["home-light-off", [{ domain: "light", displayName: "Reading Lamp", state: "off", availability: "available" }]],
  ["home-temperature", [{ domain: "sensor", displayName: "Living Room", state: "72", unit: "°F", deviceClass: "temperature", availability: "available" }]],
  ["home-unavailable", [{ domain: "light", displayName: "Reading Lamp", state: "unavailable", availability: "unavailable" }]],
  ["home-unknown", [{ domain: "sensor", displayName: "Air Quality", state: "unknown", availability: "unknown" }]],
  ["home-mixed-six", homeEntities.slice(0, 6)]
];

const homeAssistantThemeEntities = [
  { domain: "binary_sensor", displayName: "Door Closed", state: "off", deviceClass: "door", availability: "available" },
  { domain: "binary_sensor", displayName: "Door Open", state: "on", deviceClass: "door", availability: "available" },
  { domain: "lock", displayName: "Lock Locked", state: "locked", availability: "available" },
  { domain: "lock", displayName: "Lock Unlocked", state: "unlocked", availability: "available" },
  { domain: "light", displayName: "Light On", state: "on", availability: "available" },
  { domain: "light", displayName: "Light Off", state: "off", availability: "available" },
  { domain: "light", displayName: "Unavailable", state: "unavailable", availability: "unavailable" },
  { domain: "sensor", displayName: "Temperature", state: "72", unit: "°F", deviceClass: "temperature", availability: "available" }
];

const activateSource = (id, density = "expanded") => `
  (() => {
    const coordinator = window.mosaicApp.normalWidgetCompositionCoordinator;
    coordinator.mounts.forEach((mount) => {
      mount.hidden = true;
      mount.classList.remove("normal-widget-mount--primary", "normal-widget-mount--secondary", "normal-widget-mount--expanded");
    });
    coordinator.slots.forEach((slot, index) => {
      slot.hidden = index !== 0;
      slot.classList.toggle("normal-widget-slot--expanded", index === 0 && "${density}" === "expanded");
      const surface = slot.querySelector(".normal-widget-surface");
      if (surface) surface.hidden = index !== 0;
    });
    const mount = coordinator.mounts.get("${id}");
    mount.hidden = false;
    mount.classList.add("normal-widget-mount--${density === "expanded" ? "expanded" : "primary"}");
    coordinator.widgets.get("${id}").setPresentationContext({ density: "${density}" });
  })()
`;

const activatePair = (first, second) => `
  (() => {
    const coordinator = window.mosaicApp.normalWidgetCompositionCoordinator;
    coordinator.mounts.forEach((mount) => {
      mount.hidden = true;
      mount.classList.remove("normal-widget-mount--primary", "normal-widget-mount--secondary", "normal-widget-mount--expanded");
    });
    ["${first}", "${second}"].forEach((id, index) => {
      const slot = coordinator.slots[index];
      slot.hidden = false;
      slot.classList.remove("normal-widget-slot--expanded");
      slot.querySelector(".normal-widget-surface").hidden = false;
      const mount = coordinator.mounts.get(id);
      mount.hidden = false;
      mount.classList.add(index === 0 ? "normal-widget-mount--primary" : "normal-widget-mount--secondary");
      coordinator.widgets.get(id).setPresentationContext({ density: "compact" });
    });
  })()
`;

async function inspect(name) {
  const result = await evaluate(`(() => {
    const mounts = [...document.querySelectorAll(".normal-widget-mount:not([hidden])")];
    const issues = [];
    mounts.forEach((mount) => {
      const bounds = mount.getBoundingClientRect();
      if (mount.scrollWidth > mount.clientWidth + 1 || mount.scrollHeight > mount.clientHeight + 1) {
        issues.push({ type: "mount-scroll-overflow", id: mount.dataset.normalWidgetId, scroll: [mount.scrollWidth, mount.scrollHeight], client: [mount.clientWidth, mount.clientHeight] });
      }
      [...mount.querySelectorAll("*")].forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width && rect.height && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1 || rect.top < bounds.top - 1 || rect.bottom > bounds.bottom + 1)) {
          issues.push({ type: "outside-mount", id: mount.dataset.normalWidgetId, className: element.className, rect: [rect.left, rect.top, rect.right, rect.bottom], bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom] });
        }
      });
    });
    return {
      name: ${JSON.stringify(name)},
      viewport: [innerWidth, innerHeight],
      scale: getComputedStyle(document.documentElement).getPropertyValue("--mosaic-scale"),
      extension: getComputedStyle(document.documentElement).getPropertyValue("--mosaic-zone-surface-extension"),
      mounts: mounts.map((mount) => { const rect = mount.getBoundingClientRect(); return { id: mount.dataset.normalWidgetId, density: mount.dataset.normalWidgetDensity, rect: [rect.x, rect.y, rect.width, rect.height] }; }),
      issues
    };
  })()`);
  const screenshot = await command("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`${outputDirectory}/${name}.png`, Buffer.from(screenshot.data, "base64"));
  return result;
}

async function run() {
  await command("Page.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 1512, height: 982, deviceScaleFactor: 1, mobile: false });
  await command("Page.navigate", { url: "http://127.0.0.1:3000/" });
  await new Promise((resolve) => setTimeout(resolve, 1000));

  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.applyConfiguration({
    normalWidgets: { mode: "expanded", order: ["weather", "sports", "homeAssistant"] },
    weather: { enabled: true, widget: { enabled: true } },
    sports: { enabled: true, widget: { enabled: true } },
    homeAssistant: { enabled: true, widget: { enabled: true } }
  })`);

  const results = [];
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("weather").showEvent({ payload: ${JSON.stringify(weatherPayload())} }); ${activateSource("weather")}`);
  results.push(await inspect("weather-normal"));
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("weather").showEvent({ payload: ${JSON.stringify(weatherPayload({ precipitation: 70, hourly: weatherPayload().hourly.map((hour, index) => ({ ...hour, precipitationChance: 35 + index * 10, icon: "🌧️" })) }))} }); ${activateSource("weather")}`);
  results.push(await inspect("weather-precipitation"));
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("weather").showEvent({ payload: ${JSON.stringify(weatherPayload({ stale: true }))} }); ${activateSource("weather")}`);
  results.push(await inspect("weather-stale"));

  const live = sportsEvents()[0];
  const final = { ...sportsEvents()[2], id: "final-one", participants: sportsEvents()[0].participants, details: sportsEvents()[0].details };
  const scheduled = { ...live, id: "scheduled-one", status: "scheduled", scores: { away: null, home: null } };
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.queue.replace([${JSON.stringify(final)}]); widget.state = { payload: { availability: "available" } }; widget.receiveFeaturedPerformers({ eventId: "final-one", featuredPerformers: ${JSON.stringify(performerSummary())} }); ${activateSource("sports")} widget.render(); }`);
  results.push(await inspect("sports-final-performers"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.queue.replace([${JSON.stringify(live)}]); widget.receiveFeaturedPerformers({ eventId: "one", featuredPerformers: ${JSON.stringify(performerSummary())} }); ${activateSource("sports")} widget.render(); }`);
  results.push(await inspect("sports-live-performers"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.queue.replace([${JSON.stringify(scheduled)}]); ${activateSource("sports")} widget.render(); }`);
  results.push(await inspect("sports-scheduled"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.queue.replace([${JSON.stringify(live)}]); widget.receiveFeaturedPerformers({ eventId: "one", featuredPerformers: null }); ${activateSource("sports")} widget.render(); }`);
  results.push(await inspect("sports-missing-detail"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.receiveFeaturedPerformers({ eventId: "one", featuredPerformers: ${JSON.stringify(performerSummary(false, true))} }); widget.render(); }`);
  results.push(await inspect("sports-partial-performers"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.receiveFeaturedPerformers({ eventId: "one", featuredPerformers: ${JSON.stringify(performerSummary(true))} }); widget.render(); }`);
  results.push(await inspect("sports-long-player-name"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.stopRotation(); widget.queue.replace([${JSON.stringify(live)}, ${JSON.stringify(final)}]); widget.receiveFeaturedPerformers({ eventId: "one", featuredPerformers: ${JSON.stringify(performerSummary())} }); widget.receiveFeaturedPerformers({ eventId: "final-one", featuredPerformers: ${JSON.stringify(performerSummary(false, true))} }); ${activateSource("sports")} widget.advanceGame(); widget.stopRotation(); }`);
  results.push(await inspect("sports-multiple-rotated"));
  await evaluate(`{ const widget = window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("sports"); widget.stopRotation(); ${activateSource("sports", "compact")} widget.render(); }`);
  results.push(await inspect("sports-compact"));

  for (const [name, entities] of homeAssistantVisualCases) {
    await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("homeAssistant").showEvent({ payload: { status: "available", stale: false, selectedCount: ${entities.length}, entities: ${JSON.stringify(entities)} } }); ${activateSource("homeAssistant")}`);
    results.push(await inspect(name));
  }
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("homeAssistant").showEvent({ payload: { status: "available", stale: false, selectedCount: 8, entities: ${JSON.stringify(homeEntities)} } }); ${activateSource("homeAssistant")}`);
  results.push(await inspect("home-assistant-eight"));
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("homeAssistant").showEvent({ payload: { status: "available", stale: true, selectedCount: 8, entities: ${JSON.stringify(homeEntities)} } }); ${activateSource("homeAssistant")}`);
  results.push(await inspect("home-assistant-stale"));

  for (const theme of ["mosaic", "steampunk", "retro-future"]) {
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("homeAssistant").showEvent({ payload: { status: "available", stale: false, selectedCount: 8, entities: ${JSON.stringify(homeAssistantThemeEntities)} } }); ${activateSource("homeAssistant")}`);
    const result = await inspect(`home-theme-${theme}`);
    result.semanticColors = await evaluate(`(() => Object.fromEntries([...document.querySelectorAll('.home-assistant-status-row')].map((row) => [row.querySelector('.home-assistant-status-value').textContent, getComputedStyle(row.querySelector('.home-assistant-status-value')).color])))()`);
    result.glyphColors = await evaluate(`(() => [...document.querySelectorAll('.home-assistant-status-row')].map((row) => getComputedStyle(row.querySelector('.home-assistant-status-glyph')).color))()`);
    result.entityNameColor = await evaluate(`getComputedStyle(document.querySelector('.home-assistant-status-name')).color`);
    results.push(result);
  }
  await evaluate(`document.documentElement.dataset.theme = "yacht-rock"`);

  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("weather").showEvent({ payload: ${JSON.stringify(weatherPayload())} }); ${activateSource("weather")}`);
  results.push(await inspect("weather-expanded-regression"));
  await evaluate(`window.mosaicApp.normalWidgetCompositionCoordinator.widgets.get("weather").showEvent({ payload: ${JSON.stringify(weatherPayload())} });`);
  await evaluate(activatePair("weather", "sports"));
  results.push(await inspect("pair-weather-sports"));
  await evaluate(activatePair("sports", "homeAssistant"));
  results.push(await inspect("pair-sports-home"));
  await evaluate(activateSource("weather"));
  results.push(await inspect("single-auto-expanded"));

  await command("Emulation.setDeviceMetricsOverride", { width: 1800, height: 982, deviceScaleFactor: 1, mobile: false });
  await evaluate(`new Promise((resolve) => { window.dispatchEvent(new Event("resize")); requestAnimationFrame(() => requestAnimationFrame(resolve)); })`);
  results.push(await inspect("weather-wide"));

  console.log(JSON.stringify(results, null, 2));
  socket.close();
}

socket.on("open", () => run().catch((error) => {
  console.error(error);
  socket.close();
  process.exitCode = 1;
}));
