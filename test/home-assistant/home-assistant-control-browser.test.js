const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
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
      params: { expression, awaitPromise: true, returnByValue: true }
    })));
    socket.on("message", (message) => {
      const response = JSON.parse(message);
      if (response.id !== 1) return;
      socket.close();
      if (response.result?.exceptionDetails) {
        reject(new Error(response.result.exceptionDetails.exception?.description));
        return;
      }
      resolve(response.result.result.value);
    });
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Isolated Mosaic server did not start.");
}

async function waitForPage(debugPort, expectedUrl) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((candidate) =>
        candidate.type === "page" && candidate.url === expectedUrl
      );
      if (page && await evaluate(
        page.webSocketDebuggerUrl,
        "document.readyState === 'complete'"
      )) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Control page did not reach ${expectedUrl}.`);
}

function createFixtureConfig() {
  const config = JSON.parse(fs.readFileSync(
    path.join(PROJECT_ROOT, "config.example.json"),
    "utf8"
  ));
  config.homeAssistant = {
    enabled: true,
    baseUrl: "http://127.0.0.1:9",
    accessToken: "browser-test-private-token",
    entities: [
      "binary_sensor.patio_entry",
      "sensor.demo_temperature",
      "binary_sensor.missing"
    ],
    entityAliases: {
      "sensor.demo_temperature": "Studio",
      "binary_sensor.missing": "Side Door"
    },
    widget: { enabled: true }
  };
  config.normalWidgets = {
    mode: "pair",
    order: ["weather", "sports", "homeAssistant"],
    rotationSeconds: 15,
    timingMode: "global",
    durations: { weather: 15, sports: 15, homeAssistant: 15 }
  };
  return config;
}

test("actual Control keeps Home Assistant aliases draft-only through save and reload", {
  skip: !fs.existsSync(CHROME_PATH),
  timeout: 45000
}, async (context) => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "mosaic-ha-alias-control-")
  );
  const configPath = path.join(temporaryDirectory, "config.json");
  fs.writeFileSync(configPath, JSON.stringify(createFixtureConfig(), null, 2));

  const portProbe = http.createServer();
  const appPort = await listen(portProbe);
  await new Promise((resolve) => portProbe.close(resolve));
  const debugProbe = http.createServer();
  const debugPort = await listen(debugProbe);
  await new Promise((resolve) => debugProbe.close(resolve));
  const backend = spawn(process.execPath, ["backend/server.js"], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      MOSAIC_PORT: String(appPort),
      MOSAIC_CONFIG_PATH: configPath
    },
    stdio: "ignore"
  });
  await waitForServer(`http://127.0.0.1:${appPort}/control`);

  const profilePath = path.join(temporaryDirectory, "chrome-profile");
  const initialUrl = `http://127.0.0.1:${appPort}/control`;
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--disable-background-networking",
    initialUrl
  ], { stdio: "ignore" });

  context.after(async () => {
    for (const processToStop of [chrome, backend]) {
      if (processToStop.exitCode === null) {
        const exited = new Promise((resolve) =>
          processToStop.once("exit", resolve)
        );
        processToStop.kill("SIGTERM");
        await exited;
      }
    }
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  let page = await waitForPage(debugPort, initialUrl);
  const draftResult = await evaluate(page.webSocketDebuggerUrl, `(() => {
    document.querySelector('[data-settings-target="home-assistant"]').click();
    const inputs = [...document.querySelectorAll(
      '[data-home-assistant-display-name]'
    )];
    const valuesBefore = inputs.map((input) => input.value);
    const front = inputs.find((input) =>
      input.dataset.homeAssistantDisplayName.endsWith("patio_entry")
    );
    const missing = inputs.find((input) =>
      input.dataset.homeAssistantDisplayName.endsWith("missing")
    );
    const visibility = inputs.map((input) => {
      const row = input.closest("[data-home-assistant-selected-entity]");
      input.scrollIntoView({ block: "center" });
      const inputRect = input.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const style = getComputedStyle(input);
      input.focus();
      return {
        label: input.closest("label")?.textContent.includes(
          "Display Name (optional)"
        ),
        width: inputRect.width,
        height: inputRect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        withinCard: inputRect.left >= rowRect.left &&
          inputRect.right <= rowRect.right &&
          inputRect.top >= rowRect.top &&
          inputRect.bottom <= rowRect.bottom,
        inViewport: inputRect.left < innerWidth && inputRect.right > 0 &&
          inputRect.top < innerHeight && inputRect.bottom > 0,
        editable: !input.disabled && !input.readOnly &&
          document.activeElement === input
      };
    });
    front.value = "Patio";
    front.dispatchEvent(new Event("input", { bubbles: true }));
    const frontRow = front.closest("[data-home-assistant-selected-entity]");
    frontRow.querySelector('[data-move-home-assistant-entity="down"]').click();
    return {
      valuesBefore,
      visibility,
      frontValueAfterTyping: front.value,
      missingEditable: !missing.disabled && missing.value === "Side Door",
      dirty: !document.querySelector("[data-save-status]").hidden,
      draft: JSON.parse(document.querySelector(
        '[name="homeAssistantEntitiesDraft"]'
      ).value)
    };
  })()`);

  assert.deepEqual(draftResult.valuesBefore, ["", "Studio", "Side Door"]);
  draftResult.visibility.forEach((field) => {
    assert.equal(field.label, true);
    assert.ok(field.width > 0);
    assert.ok(field.height > 0);
    assert.notEqual(field.display, "none");
    assert.notEqual(field.visibility, "hidden");
    assert.notEqual(field.opacity, "0");
    assert.equal(field.withinCard, true);
    assert.equal(field.inViewport, true);
    assert.equal(field.editable, true);
  });
  assert.equal(draftResult.frontValueAfterTyping, "Patio");
  assert.equal(draftResult.missingEditable, true);
  assert.equal(draftResult.dirty, true);
  assert.equal(
    JSON.parse(fs.readFileSync(configPath)).homeAssistant.entityAliases[
      "binary_sensor.patio_entry"
    ],
    undefined
  );
  assert.deepEqual(
    draftResult.draft.map((entry) => [entry.entityId, entry.displayName || ""]),
    [
      ["sensor.demo_temperature", "Studio"],
      ["binary_sensor.patio_entry", "Patio"],
      ["binary_sensor.missing", "Side Door"]
    ]
  );

  await evaluate(page.webSocketDebuggerUrl,
    "document.querySelector('.settings-form').requestSubmit(); true"
  );
  const savedUrl = `${initialUrl}?saved=1`;
  page = await waitForPage(debugPort, savedUrl);
  const savedResult = await evaluate(page.webSocketDebuggerUrl, `(() => {
    const draft = JSON.parse(document.querySelector(
      '[name="homeAssistantEntitiesDraft"]'
    ).value);
    const front = document.querySelector(
      '[data-home-assistant-display-name$="patio_entry"]'
    );
    return { draft, frontAlias: front.value };
  })()`);
  assert.equal(savedResult.frontAlias, "Patio");
  assert.deepEqual(savedResult.draft.map((entry) => entry.entityId), [
    "sensor.demo_temperature",
    "binary_sensor.patio_entry",
    "binary_sensor.missing"
  ]);

  await evaluate(page.webSocketDebuggerUrl, `(() => {
    const front = document.querySelector(
      '[data-home-assistant-display-name$="patio_entry"]'
    );
    front.value = "";
    front.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector(
      '[data-remove-home-assistant-entity$="missing"]'
    ).click();
    document.querySelector('.settings-form').requestSubmit();
    return true;
  })()`);
  page = await waitForPage(debugPort, savedUrl);
  const finalConfig = JSON.parse(fs.readFileSync(configPath));
  assert.deepEqual(finalConfig.homeAssistant.entities, [
    "sensor.demo_temperature", "binary_sensor.patio_entry"
  ]);
  assert.deepEqual(finalConfig.homeAssistant.entityAliases, {
    "sensor.demo_temperature": "Studio"
  });
  const finalState = await evaluate(page.webSocketDebuggerUrl, `(() => {
    const front = document.querySelector(
      '[data-home-assistant-display-name$="patio_entry"]'
    );
    const rect = front.getBoundingClientRect();
    return {
      draft: JSON.parse(document.querySelector(
        '[name="homeAssistantEntitiesDraft"]'
      ).value),
      frontValue: front.value,
      visible: rect.width > 0 && rect.height > 0 &&
        getComputedStyle(front).display !== "none" &&
        getComputedStyle(front).visibility !== "hidden"
    };
  })()`);
  assert.deepEqual(finalState.draft, [
    { entityId: "sensor.demo_temperature", displayName: "Studio" },
    { entityId: "binary_sensor.patio_entry" }
  ]);
  assert.equal(finalState.frontValue, "");
  assert.equal(finalState.visible, true);
});
