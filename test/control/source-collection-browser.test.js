const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const WebSocket = require("ws");
const { app } = require("../../backend/server");

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const listen = (server) => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});

const getJson = (url) => new Promise((resolve, reject) => {
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

const waitForPage = async (debugPort, controlUrl) => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const pages = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((candidate) =>
        candidate.type === "page" && candidate.url.includes("/control")
      );
      if (
        page &&
        await evaluate(
          page.webSocketDebuggerUrl,
          `location.href === ${JSON.stringify(controlUrl)} && document.readyState === "complete"`
        )
      ) return page;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Control page did not become available in Chrome.");
};

const evaluate = (webSocketUrl, expression) => new Promise((resolve, reject) => {
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
      reject(new Error(response.result.exceptionDetails.exception?.description));
      return;
    }
    resolve(response.result.result.value);
  });
});

test("actual Control JavaScript selects and edits Calendar and Discovery drafts", {
  skip: !fs.existsSync(CHROME_PATH),
  timeout: 30000
}, async (context) => {
  const server = http.createServer(app);
  const appPort = await listen(server);
  const debugServer = http.createServer();
  const debugPort = await listen(debugServer);
  await new Promise((resolve) => debugServer.close(resolve));
  const profilePath = fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-control-test-"));
  const chrome = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--disable-background-networking",
    `http://127.0.0.1:${appPort}/control`
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

  const controlUrl = `http://127.0.0.1:${appPort}/control`;
  const page = await waitForPage(debugPort, controlUrl);
  const result = await evaluate(page.webSocketDebuggerUrl, `(async () => {
    const wait = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
    const persistedBefore = await fetch("/api/config").then((response) => response.json());
    const dirty = document.querySelector("[data-save-status]");

    document.querySelector('[data-settings-target="calendar"]').click();
    const calendarButton = document.querySelector("[data-edit-calendar-source]");
    if (!calendarButton) return { missing: "calendar" };
    const calendarRow = calendarButton.closest("[data-calendar-source-row]");
    const calendarDraftField = document.querySelector('[name="calendarSourcesDraft"]');
    const calendarBefore = JSON.parse(calendarDraftField.value);
    const calendarId = calendarRow.dataset.sourceId;
    const calendarPersistedName = persistedBefore.calendar.sources
      .find((source) => source.id === calendarId)?.name;
    calendarButton.click();
    await wait();
    const calendarSelected = {
      panelVisible: !document.querySelector('[data-settings-panel="calendar"]').hidden,
      rowSelected: calendarRow.classList.contains("is-selected"),
      title: document.querySelector("[data-calendar-source-editor-title]").textContent,
      action: document.querySelector("[data-add-calendar-source]").textContent,
      name: document.querySelector("#calendar-source-name").value,
      url: document.querySelector("#calendar-source-url").value,
      enabled: document.querySelector("[data-calendar-source-enabled]").checked,
      controlsVisible: !document.querySelector("[data-calendar-selected-controls]").hidden,
      dirty: !dirty.hidden
    };
    document.querySelector("#calendar-source-name").value = calendarSelected.name + " Draft";
    document.querySelector("[data-calendar-source-enabled]").checked = !calendarSelected.enabled;
    document.querySelector("[data-add-calendar-source]").click();
    await wait();
    const calendarAfter = JSON.parse(calendarDraftField.value);
    const calendarEdited = calendarAfter.find((source) => source.id === calendarId);
    const persistedAfterCalendar = await fetch("/api/config").then((response) => response.json());
    document.querySelector("[data-cancel-calendar-source-edit]").click();
    const calendarAddMode = {
      title: document.querySelector("[data-calendar-source-editor-title]").textContent,
      action: document.querySelector("[data-add-calendar-source]").textContent,
      controlsHidden: document.querySelector("[data-calendar-selected-controls]").hidden
    };
    calendarRow.querySelector("[data-edit-calendar-source]").click();
    document.querySelector("[data-remove-selected-calendar-source]").click();
    document.querySelector("[data-confirm-selected-calendar-removal]").click();
    const calendarRemoval = {
      length: JSON.parse(calendarDraftField.value).length,
      selectedRows: document.querySelectorAll("[data-calendar-source-row].is-selected").length
    };

    dirty.hidden = true;
    document.querySelector('[data-settings-target="discovery"]').click();
    const discoveryButton = document.querySelector("[data-edit-discovery-source]");
    if (!discoveryButton) return { missing: "discovery", calendarSelected };
    const discoveryRow = discoveryButton.closest("[data-discovery-source-row]");
    const discoveryDraftField = document.querySelector('[name="discoverySourcesDraft"]');
    const discoveryBefore = JSON.parse(discoveryDraftField.value);
    const discoveryId = discoveryRow.dataset.sourceId;
    const discoveryPersistedName = persistedBefore.discovery.sources
      .find((source) => source.id === discoveryId)?.name;
    discoveryButton.click();
    await wait();
    const discoverySelected = {
      panelVisible: !document.querySelector('[data-settings-panel="discovery"]').hidden,
      rowSelected: discoveryRow.classList.contains("is-selected"),
      title: document.querySelector("[data-discovery-source-editor-title]").textContent,
      action: document.querySelector("[data-add-discovery-source]").textContent,
      name: document.querySelector("#discovery-source-name").value,
      url: document.querySelector("#discovery-source-url").value,
      enabled: document.querySelector("[data-discovery-source-enabled]").checked,
      controlsVisible: !document.querySelector("[data-discovery-selected-controls]").hidden,
      dirty: !dirty.hidden
    };
    document.querySelector("#discovery-source-name").value = discoverySelected.name + " Draft";
    document.querySelector("[data-add-discovery-source]").click();
    await wait();
    const discoveryAfter = JSON.parse(discoveryDraftField.value);
    const discoveryEdited = discoveryAfter.find((source) => source.id === discoveryId);
    const persistedAfterDiscovery = await fetch("/api/config").then((response) => response.json());
    document.querySelector("[data-cancel-discovery-source-edit]").click();
    const discoveryAddMode = {
      title: document.querySelector("[data-discovery-source-editor-title]").textContent,
      action: document.querySelector("[data-add-discovery-source]").textContent,
      controlsHidden: document.querySelector("[data-discovery-selected-controls]").hidden
    };
    discoveryRow.querySelector("[data-edit-discovery-source]").click();
    document.querySelector("[data-remove-selected-discovery-source]").click();
    document.querySelector("[data-confirm-selected-discovery-removal]").click();
    const discoveryRemoval = {
      length: JSON.parse(discoveryDraftField.value).length,
      selectedRows: document.querySelectorAll("[data-discovery-source-row].is-selected").length,
      emptyVisible: !document.querySelector("[data-discovery-source-empty]").hidden
    };

    return {
      calendarBefore, calendarSelected, calendarEdited, calendarPersistedName,
      persistedCalendarName: persistedAfterCalendar.calendar.sources
        .find((source) => source.id === calendarId)?.name,
      calendarAddMode, calendarRemoval,
      discoveryBefore, discoverySelected, discoveryEdited, discoveryPersistedName,
      persistedDiscoveryName: persistedAfterDiscovery.discovery.sources
        .find((source) => source.id === discoveryId)?.name,
      discoveryAddMode, discoveryRemoval,
      dirtyAfterUpdates: !dirty.hidden
    };
  })()`);

  assert.equal(result.missing, undefined);
  assert.deepEqual(result.calendarSelected, {
    panelVisible: true,
    rowSelected: true,
    title: "Edit Source",
    action: "Update Source",
    name: result.calendarBefore[0].name,
    url: result.calendarBefore[0].url,
    enabled: result.calendarBefore[0].enabled !== false,
    controlsVisible: true,
    dirty: false
  });
  assert.equal(result.calendarEdited.id, result.calendarBefore[0].id);
  assert.equal(result.calendarEdited.name, result.calendarBefore[0].name + " Draft");
  assert.equal(result.calendarEdited.enabled, !(result.calendarBefore[0].enabled !== false));
  assert.equal(result.persistedCalendarName, result.calendarPersistedName);
  assert.deepEqual(result.calendarAddMode, {
    title: "Add Source",
    action: "Add Source",
    controlsHidden: true
  });
  assert.equal(result.calendarRemoval.length, result.calendarBefore.length - 1);
  assert.equal(result.calendarRemoval.selectedRows, result.calendarBefore.length > 1 ? 1 : 0);

  assert.deepEqual(result.discoverySelected, {
    panelVisible: true,
    rowSelected: true,
    title: "Edit Source",
    action: "Update Source",
    name: result.discoveryBefore[0].name,
    url: result.discoveryBefore[0].config.url,
    enabled: result.discoveryBefore[0].enabled !== false,
    controlsVisible: true,
    dirty: false
  });
  assert.equal(result.discoveryEdited.id, result.discoveryBefore[0].id);
  assert.equal(result.discoveryEdited.name, result.discoveryBefore[0].name + " Draft");
  assert.equal(result.persistedDiscoveryName, result.discoveryPersistedName);
  assert.deepEqual(result.discoveryAddMode, {
    title: "Add Source",
    action: "Add Source",
    controlsHidden: true
  });
  assert.equal(result.discoveryRemoval.length, result.discoveryBefore.length - 1);
  assert.equal(result.discoveryRemoval.selectedRows, result.discoveryBefore.length > 1 ? 1 : 0);
  assert.equal(result.discoveryRemoval.emptyVisible, result.discoveryBefore.length === 1);
  assert.equal(result.dirtyAfterUpdates, true);
});
