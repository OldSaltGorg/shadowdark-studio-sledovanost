import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  computeProgress, createsCycle, gridDimensions, milestoneThreshold, milestonesReached, moveTalent,
  renameTalentId, talentStatus
} from "../scripts/progression.mjs";

const tree = () => JSON.parse(readFileSync(new URL("../data/default-tree.json", import.meta.url), "utf8"));
const find = (tr, id) => tr.talents.find(x => x.id === id);
const buy = (...ids) => ({ purchased: ids.map(([id, cost]) => ({ id, cost })) });

test("milestone thresholds match the rules table", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(milestoneThreshold),
    [20, 50, 90, 140, 200, 270, 350, 440, 540, 650, 770, 900]);
  assert.equal(milestonesReached(0), 0);
  assert.equal(milestonesReached(19), 0);
  assert.equal(milestonesReached(20), 1);
  assert.equal(milestonesReached(900), 12);
});

test("default tree matches the investment check (39 upgrades, 9/14/16, 85 SP)", () => {
  const tr = tree();
  assert.equal(tr.talents.length, 39);
  const byTier = [1, 2, 3].map(n => tr.talents.filter(x => x.tier === n).length);
  assert.deepEqual(byTier, [9, 14, 16]);
  const cost = tr.talents.reduce((s, x) => s + tr.tiers.find(t => t.id === x.tier).cost, 0);
  assert.equal(cost, 85);
  const ids = new Set(tr.talents.map(x => x.id));
  for (const x of tr.talents) for (const p of x.prereqs) assert.ok(ids.has(p), `${x.id} -> ${p}`);
  const slots = new Set(tr.talents.map(x => `${x.branch}|${x.tier}|${x.row}|${x.col}`));
  assert.equal(slots.size, 39, "no two upgrades share a slot");
  for (const x of tr.talents) assert.ok(x.name.cs && x.name.en && x.description.cs && x.description.en, x.id);
});

test("investment check examples from the rules", () => {
  const tr = tree();
  // Popularity 57: 4 SP; four tier I purchases open tier II with 0 SP left.
  let p = computeProgress(tr, { popularity: 57, ...buy(["I11", 1], ["I12", 1], ["U11", 1], ["E11", 1]) });
  assert.equal(p.earned, 4);
  assert.equal(p.available, 0);
  assert.equal(p.tiers.find(t => t.id === 2).unlocked, true);
  assert.equal(talentStatus(find(tr, "I21"), tr, p).state, "unaffordable");
  // Popularity 105: 6 SP, 2 left for one tier II upgrade.
  p = computeProgress(tr, { popularity: 105, ...buy(["I11", 1], ["I12", 1], ["U11", 1], ["E11", 1]) });
  assert.equal(p.available, 2);
  assert.equal(talentStatus(find(tr, "I21"), tr, p).state, "available");
  assert.equal(talentStatus(find(tr, "I31"), tr, p).state, "locked");
});

test("talent status reasons", () => {
  const tr = tree();
  const p = computeProgress(tr, { popularity: 900, ...buy(["I12", 1]) });
  const s = talentStatus(find(tr, "I32"), tr, p);
  assert.equal(s.state, "locked");
  assert.deepEqual(s.reasons.map(r => r.type), ["tier"]);
  const s2 = talentStatus(find(tr, "I21"), tr, computeProgress(tr, { popularity: 900, ...buy(["I12", 1], ["I13", 1], ["U11", 1], ["E11", 1]) }));
  assert.deepEqual(s2.reasons, [{ type: "prereq", ids: ["I11"] }]);
  const s3 = talentStatus(find(tr, "I21"), tr, computeProgress(tr, { popularity: 900, ...buy(["I12", 1]) }));
  assert.equal(talentStatus(find(tr, "I11"), tr, computeProgress(tr, { popularity: 900, ...buy(["I12", 1]) })).state, "available");
  assert.equal(s3.state, "locked");
  assert.equal(talentStatus(find(tr, "I12"), tr, computeProgress(tr, { popularity: 0, ...buy(["I12", 1]) })).state, "purchased");
});

test("paid cost is preserved even if tier cost changes", () => {
  const tr = tree();
  tr.tiers.find(t => t.id === 1).cost = 5;
  const p = computeProgress(tr, { popularity: 20, ...buy(["I11", 1]) });
  assert.equal(p.spent, 1);
  assert.equal(p.available, 1);
});

test("spAdjustment adds to earned SP", () => {
  const p = computeProgress(tree(), { popularity: 20, spAdjustment: 3, purchased: [] });
  assert.equal(p.earned, 5);
});

test("cycle detection", () => {
  const tr = tree();
  assert.equal(createsCycle(tr, "I11", ["I31"]), true);
  assert.equal(createsCycle(tr, "I31", ["I11"]), false);
  assert.equal(createsCycle(tr, "X", ["X"]), true);
});

test("moving onto an occupied slot swaps positions", () => {
  const tr = tree();
  moveTalent(tr, "I11", { branch: "interface", tier: 1, row: 0, col: 1 });
  assert.deepEqual([find(tr, "I11").col, find(tr, "I12").col], [1, 0]);
  moveTalent(tr, "I11", { branch: "utility", tier: 3, row: 4, col: 0 });
  assert.equal(find(tr, "I11").branch, "utility");
  assert.equal(gridDimensions(tr).rows[3], 5);
});

test("renaming an ID updates prerequisites and purchases", () => {
  const tr = tree();
  const st = buy(["I12", 1]);
  renameTalentId(tr, st, "I12", "CHAT");
  assert.ok(find(tr, "CHAT"));
  assert.ok(find(tr, "I32").prereqs.includes("CHAT"));
  assert.equal(st.purchased[0].id, "CHAT");
});
