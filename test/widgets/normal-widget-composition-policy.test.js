const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  composeNormalWidgets,
  normalizeCompositionIndex,
  reconcileNormalWidgetComposition
} = require(
  "../../frontend/widgets/normal-widget-composition-policy"
);

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function summarize(result) {
  return {
    mode: result.mode,
    enabledIds: [...result.enabledIds],
    visibleIds: [...result.visibleIds],
    density: result.density,
    currentIndex: result.currentIndex,
    nextIndex: result.nextIndex,
    rotationRequired: result.rotationRequired
  };
}

test("zero enabled widgets produce a neutral result in both modes", () => {
  for (const mode of ["pair", "expanded"]) {
    assert.deepEqual(summarize(composeNormalWidgets({
      mode,
      orderedEnabledWidgetIds: [],
      currentIndex: 99
    })), {
      mode,
      enabledIds: [],
      visibleIds: [],
      density: null,
      currentIndex: 0,
      nextIndex: 0,
      rotationRequired: false
    });
  }
});

test("one enabled widget is expanded and never rotates in either mode", () => {
  for (const mode of ["pair", "expanded"]) {
    const result = composeNormalWidgets({
      mode,
      orderedEnabledWidgetIds: ["A"],
      currentIndex: -500
    });

    assert.deepEqual(result.visibleIds, ["A"]);
    assert.equal(result.density, "expanded");
    assert.equal(result.currentIndex, 0);
    assert.equal(result.nextIndex, 0);
    assert.equal(result.rotationRequired, false);
  }
});

test("two widgets remain a compact non-rotating pair in Pair mode", () => {
  const first = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B"],
    currentIndex: 0
  });
  const second = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B"],
    currentIndex: 1
  });

  assert.deepEqual(first.visibleIds, ["A", "B"]);
  assert.deepEqual(second.visibleIds, ["B", "A"]);
  assert.equal(first.density, "compact");
  assert.equal(first.rotationRequired, false);
  assert.equal(first.nextIndex, 0);
  assert.equal(second.nextIndex, 1);
});

test("two widgets rotate individually in Expanded mode", () => {
  const first = composeNormalWidgets({
    mode: "expanded",
    orderedEnabledWidgetIds: ["A", "B"],
    currentIndex: 0
  });
  const second = composeNormalWidgets({
    mode: "expanded",
    orderedEnabledWidgetIds: ["A", "B"],
    currentIndex: first.nextIndex
  });

  assert.deepEqual(first.visibleIds, ["A"]);
  assert.deepEqual(second.visibleIds, ["B"]);
  assert.equal(first.density, "expanded");
  assert.equal(first.rotationRequired, true);
  assert.equal(second.nextIndex, 0);
});

function assertCycle(mode, ids, expectedVisibleIds) {
  expectedVisibleIds.forEach((visibleIds, currentIndex) => {
    const result = composeNormalWidgets({
      mode,
      orderedEnabledWidgetIds: ids,
      currentIndex
    });

    assert.deepEqual([...result.visibleIds], visibleIds);
    assert.equal(result.currentIndex, currentIndex);
    assert.equal(result.nextIndex, (currentIndex + 1) % ids.length);
    assert.equal(result.rotationRequired, true);
    assert.equal(
      result.density,
      mode === "pair" ? "compact" : "expanded"
    );
    assert.equal(new Set(result.visibleIds).size, result.visibleIds.length);
  });
}

test("three-widget cycles follow Pair adjacency and Expanded individuality", () => {
  const ids = ["A", "B", "C"];

  assertCycle("pair", ids, [
    ["A", "B"],
    ["B", "C"],
    ["C", "A"]
  ]);
  assertCycle("expanded", ids, [["A"], ["B"], ["C"]]);
});

test("four-widget cycles follow Pair adjacency and Expanded individuality", () => {
  const ids = ["A", "B", "C", "D"];

  assertCycle("pair", ids, [
    ["A", "B"],
    ["B", "C"],
    ["C", "D"],
    ["D", "A"]
  ]);
  assertCycle("expanded", ids, [["A"], ["B"], ["C"], ["D"]]);
});

test("indexes normalize finite integers, fractions, negatives, and huge values", () => {
  assert.equal(normalizeCompositionIndex(undefined, 3), 0);
  assert.equal(normalizeCompositionIndex(NaN, 3), 0);
  assert.equal(normalizeCompositionIndex(Infinity, 3), 0);
  assert.equal(normalizeCompositionIndex(1.9, 3), 1);
  assert.equal(normalizeCompositionIndex(-1, 3), 2);
  assert.equal(normalizeCompositionIndex(-7, 3), 2);
  assert.equal(normalizeCompositionIndex(1_000_000, 3), 1);
  assert.equal(normalizeCompositionIndex(4, 0), 0);
});

test("direct malformed input sanitizes safely without changing order", () => {
  assert.deepEqual(summarize(composeNormalWidgets()), {
    mode: "pair",
    enabledIds: [],
    visibleIds: [],
    density: null,
    currentIndex: 0,
    nextIndex: 0,
    rotationRequired: false
  });

  const result = composeNormalWidgets({
    mode: "invalid",
    orderedEnabledWidgetIds: [
      " B ", null, "", "A", "B", 42, "C", "A"
    ],
    currentIndex: "1"
  });

  assert.equal(result.mode, "pair");
  assert.deepEqual(result.enabledIds, ["B", "A", "C"]);
  assert.deepEqual(result.visibleIds, ["B", "A"]);
  assert.equal(result.currentIndex, 0);
});

test("composition results and their arrays are immutable", () => {
  const result = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B", "C"]
  });

  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.enabledIds), true);
  assert.equal(Object.isFrozen(result.visibleIds), true);
  assert.throws(() => result.visibleIds.push("D"), TypeError);
});

test("reconfiguration preserves a surviving Pair leader", () => {
  const previous = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B", "C"],
    currentIndex: 1
  });
  const next = reconcileNormalWidgetComposition(previous, {
    mode: "pair",
    orderedEnabledWidgetIds: ["D", "B", "C", "E"]
  });

  assert.deepEqual(next.visibleIds, ["B", "C"]);
  assert.equal(next.currentIndex, 1);
});

test("reconfiguration preserves a surviving Expanded leader", () => {
  const previous = composeNormalWidgets({
    mode: "expanded",
    orderedEnabledWidgetIds: ["A", "B", "C"],
    currentIndex: 1
  });
  const next = reconcileNormalWidgetComposition(previous, {
    mode: "expanded",
    orderedEnabledWidgetIds: ["D", "B", "C", "E"]
  });

  assert.deepEqual(next.visibleIds, ["B"]);
  assert.equal(next.currentIndex, 1);
});

test("reconfiguration resets to the first ID when the leader was removed", () => {
  const previous = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B", "C"],
    currentIndex: 1
  });
  const next = reconcileNormalWidgetComposition(previous, {
    mode: "pair",
    orderedEnabledWidgetIds: ["D", "C", "E"]
  });

  assert.deepEqual(next.visibleIds, ["D", "C"]);
  assert.equal(next.currentIndex, 0);
});

test("reconfiguration handles reductions to two, one, and zero widgets", () => {
  const previous = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B", "C"],
    currentIndex: 1
  });
  const two = reconcileNormalWidgetComposition(previous, {
    mode: "pair",
    orderedEnabledWidgetIds: ["D", "B"]
  });
  const one = reconcileNormalWidgetComposition(previous, {
    mode: "pair",
    orderedEnabledWidgetIds: ["B"]
  });
  const zero = reconcileNormalWidgetComposition(previous, {
    mode: "expanded",
    orderedEnabledWidgetIds: []
  });

  assert.deepEqual(two.visibleIds, ["B", "D"]);
  assert.equal(two.rotationRequired, false);
  assert.deepEqual(one.visibleIds, ["B"]);
  assert.equal(one.density, "expanded");
  assert.deepEqual(zero.visibleIds, []);
  assert.equal(zero.density, null);
});

test("mode changes preserve the current leader using the new mode policy", () => {
  const pair = composeNormalWidgets({
    mode: "pair",
    orderedEnabledWidgetIds: ["A", "B", "C"],
    currentIndex: 1
  });
  const expanded = reconcileNormalWidgetComposition(pair, {
    mode: "expanded",
    orderedEnabledWidgetIds: ["D", "B", "C", "E"]
  });
  const pairAgain = reconcileNormalWidgetComposition(expanded, {
    mode: "pair",
    orderedEnabledWidgetIds: ["D", "B", "C", "E"]
  });

  assert.deepEqual(expanded.visibleIds, ["B"]);
  assert.equal(expanded.density, "expanded");
  assert.deepEqual(pairAgain.visibleIds, ["B", "C"]);
  assert.equal(pairAgain.density, "compact");
});

test("the policy module has no browser, app, provider, Hero, or timer dependencies", () => {
  const source = fs.readFileSync(
    path.join(
      PROJECT_ROOT,
      "frontend/widgets/normal-widget-composition-policy.js"
    ),
    "utf8"
  );

  assert.doesNotMatch(
    source,
    /\b(document|window|EventBus|provider|Hero|fetch|setTimeout|setInterval)\b/
  );
});
