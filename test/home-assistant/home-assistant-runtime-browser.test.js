const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FRONTEND_PATH = path.join(__dirname, "..", "..", "frontend");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function evaluate(webSocketUrl, expression) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl);
    socket.once("error", reject);
    socket.once("open", () => socket.send(JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression,
        awaitPromise: true,
        returnByValue: true
      }
    })));
    socket.on("message", (message) => {
      const response = JSON.parse(message);
      if (response.id !== 1) return;
      socket.close();
      if (response.result?.exceptionDetails) {
        reject(new Error(
          response.result.exceptionDetails.exception?.description
        ));
        return;
      }
      resolve(response.result.result.value);
    });
  });
}

async function waitForDashboard(debugPort, dashboardUrl) {
  const deadline = Date.now() + 10000;

  while (Date.now() < deadline) {
    try {
      const pages = await getJson(
        `http://127.0.0.1:${debugPort}/json/list`
      );
      const page = pages.find((candidate) =>
        candidate.type === "page" && candidate.url === dashboardUrl
      );
      if (page) {
        const result = await evaluate(page.webSocketDebuggerUrl, `
          (() => {
            const app = window.mosaicApp;
            const widget = app?.widgetManager?.widgets
              ?.get("homeAssistant");
            if (
              document.readyState !== "complete" ||
              widget?.state?.status === "loading"
            ) return null;
            const provider = app.providerManager.providers
              .find((entry) => entry instanceof HomeAssistantProvider);
            const mount = document.querySelector(
              '[data-normal-widget-id="homeAssistant"]'
            );
            return {
              providerRuntimeEnabled: provider?.runtimeEnabled,
              providerTimerActive: provider?.refreshTimer !== null,
              activeStatus: app.eventCoordinator.getActiveEvents()
                .get("home-assistant")?.payload?.status,
              widgetStatus: widget?.state?.status,
              widgetRows: widget?.state?.rows,
              composed: mount?.hidden === false,
              renderedText: mount?.innerText || ""
            };
          })()
        `);
        if (result) return result;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error("Home Assistant dashboard did not become ready in Chrome.");
}

function createRuntimeApp() {
  const app = express();

  app.get("/api/config", (req, res) => res.json({
    weather: {
      enabled: false,
      widget: { enabled: false },
      hero: { enabled: false }
    },
    sports: {
      enabled: false,
      widget: { enabled: false, leagues: [] },
      hero: { enabled: false },
      favoriteTeams: []
    },
    calendar: { enabled: false, sources: [] },
    discovery: { enabled: false, sources: [] },
    homeAssistant: {
      enabled: true,
      configured: true,
      entities: [
        "redacted-one", "redacted-two", "redacted-three", "redacted-four"
      ],
      widget: { enabled: true }
    },
    normalWidgets: {
      mode: "expanded",
      order: ["homeAssistant", "weather", "sports"],
      rotationSeconds: 15,
      timingMode: "global",
      durations: {
        homeAssistant: 15,
        weather: 15,
        sports: 15
      }
    }
  }));
  app.get("/api/home-assistant/selected-states", (req, res) => res.json({
    schemaVersion: 1,
    status: "available",
    stale: false,
    updatedAt: "2026-09-21T12:00:00.000Z",
    selectedCount: 4,
    entities: [
      {
        entityId: "redacted-one",
        domain: "light",
        displayName: "Studio Lamp",
        mosaicDisplayName: null,
        state: "off",
        unit: null,
        deviceClass: null,
        availability: "available"
      },
      {
        entityId: "redacted-two",
        domain: "binary_sensor",
        displayName: "Patio Entry Door",
        mosaicDisplayName: null,
        state: "off",
        unit: null,
        deviceClass: "door",
        availability: "available"
      },
      {
        entityId: "redacted-three",
        domain: "binary_sensor",
        displayName: "Patio Entry Door",
        mosaicDisplayName: "Patio",
        state: "off",
        unit: null,
        deviceClass: "door",
        availability: "available"
      },
      {
        entityId: "redacted-four",
        domain: "sensor",
        displayName: "Demo Sensor Model X Temperature",
        mosaicDisplayName: "Studio",
        state: "69.35",
        unit: "°F",
        deviceClass: "temperature",
        availability: "available"
      }
    ]
  }));
  app.use(express.static(FRONTEND_PATH));

  return app;
}

test("production-order dashboard runtime renders available Home Assistant state", {
  skip: !fs.existsSync(CHROME_PATH),
  timeout: 30000
}, async (context) => {
  const server = http.createServer(createRuntimeApp());
  const appPort = await listen(server);
  const debugServer = http.createServer();
  const debugPort = await listen(debugServer);
  await new Promise((resolve) => debugServer.close(resolve));
  const profilePath = fs.mkdtempSync(
    path.join(os.tmpdir(), "mosaic-ha-runtime-test-")
  );
  const dashboardUrl = `http://127.0.0.1:${appPort}/`;
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--disable-background-networking",
    dashboardUrl
  ], { stdio: "ignore" });

  context.after(async () => {
    if (chrome.exitCode === null) {
      const exited = new Promise((resolve) => chrome.once("exit", resolve));
      chrome.kill("SIGTERM");
      await exited;
    }
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profilePath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50
    });
  });

  const result = await waitForDashboard(debugPort, dashboardUrl);

  assert.equal(result.providerRuntimeEnabled, true);
  assert.equal(result.providerTimerActive, true);
  assert.equal(result.activeStatus, "available");
  assert.equal(result.widgetStatus, "available");
  assert.deepEqual(result.widgetRows, [
    { name: "Studio Lamp", value: "Off" },
    { name: "Patio Entry Door", value: "Closed" },
    { name: "Patio", value: "Closed" },
    { name: "Studio", value: "69.35 °F" }
  ]);
  assert.equal(result.composed, true);
  assert.match(result.renderedText, /Studio Lamp\s+Off/);
  assert.match(result.renderedText, /Patio Entry Door\s+Closed/);
  assert.match(result.renderedText, /Patio\s+Closed/);
  assert.match(result.renderedText, /Studio\s+69\.35 °F/);
  assert.doesNotMatch(result.renderedText, /Status unavailable/);
});
