import { test } from "node:test";
import assert from "node:assert/strict";
import { routeEdge } from "../scripts/routing.mjs";

const rect = (col, row) => ({ left: col * 140, right: col * 140 + 120, top: row * 80, bottom: row * 80 + 60 });
const gaps = { gapX: 20, gapY: 20 };

test("straight vertical when nothing is in between", () => {
  const s = rect(0, 0);
  const t = rect(0, 1);
  assert.equal(routeEdge(s, t, [s, t], gaps), "M 60 60 L 60 80");
});

test("elbow route through the channel above the target", () => {
  const s = rect(0, 0);
  const t = rect(2, 1);
  assert.equal(routeEdge(s, t, [s, t], gaps), "M 60 60 L 60 70 L 340 70 L 340 80");
});

test("detours through a gutter when a node blocks the drop", () => {
  const s = rect(1, 0);
  const blocker = rect(1, 1);
  const t = rect(1, 2);
  const d = routeEdge(s, t, [s, blocker, t], gaps);
  assert.equal(d, "M 200 60 L 200 70 L 270 70 L 270 150 L 200 150 L 200 160");
});

test("side-by-side nodes in the same row get a horizontal link", () => {
  const s = rect(0, 0);
  const t = rect(1, 0);
  assert.equal(routeEdge(s, t, [s, t], gaps), "M 120 30 L 140 30");
});

test("upward dependency loops underneath", () => {
  const s = rect(0, 1);
  const t = rect(1, 0);
  assert.equal(routeEdge(s, t, [s, t], gaps), "M 60 140 L 60 150 L 200 150 L 200 60");
});
