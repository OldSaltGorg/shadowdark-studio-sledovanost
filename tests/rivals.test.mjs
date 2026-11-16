import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  evaluateRivals, groupScore, groupSP, hasEvaluated, nextRivalDay, playerGroups, rankGroups, resolveActiveGroup,
  rivalGain, studioState
} from "../scripts/rivals.mjs";
import { generateGroup, generateMember, typicalLevel } from "../scripts/generator.mjs";

const seed = () => JSON.parse(readFileSync(new URL("../data/default-rivals.json", import.meta.url), "utf8"));
const tree = () => JSON.parse(readFileSync(new URL("../data/default-tree.json", import.meta.url), "utf8"));
const seq = (...rolls) => { let i = 0; return () => rolls[i++ % rolls.length]; };
function lcg(s = 42) { return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); }

test("seeded scores match the chapter 2 roster note", () => {
  const data = seed();
  const scores = Object.fromEntries(data.groups.map(g => [g.name, groupScore(g)]));
  assert.deepEqual(scores, {
    "Baziliškobijci": 104, "Zlatá tiráž": 94, "Pět podpisů krví": 84, "Rezavé lucerny": 81,
    "Poslední korektura": 80, "Sběratelé posledních slov": 73, "Společnost otevřených dveří": 69,
    "Sůl a saze": 69, "Redakce": 50, "Družina Robina Úda": 46
  });
});

test("competition ranking 1,2,2,4 with alphabetical display order", () => {
  const ranked = rankGroups(seed().groups);
  const view = ranked.map(x => [x.rank, x.group.name]);
  assert.deepEqual(view.slice(6, 10), [
    [7, "Sůl a saze"], [7, "Společnost otevřených dveří"], [9, "Redakce"], [10, "Družina Robina Úda"]
  ].sort((a, b) => a[0] - b[0] || new Intl.Collator("cs").compare(a[1], b[1])));
});

test("rival gain: profile added, clamped 0..10, interviews ignore profile", () => {
  assert.equal(rivalGain(6, { profile: 2 }).gain, 10);
  assert.equal(rivalGain(1, { profile: -1 }).gain, 0);
  assert.equal(rivalGain(4, { profile: 1 }).gain, 7);
  assert.equal(rivalGain(4, { profile: 2, kind: "interview" }).gain, 6);
});

test("evaluating a date rolls active rivals once and never twice", () => {
  const data = seed();
  data.groups.find(g => g.name === "Sůl a saze").status = "cancelled";
  const date = { chapter: 2, day: 1, kind: "day" };
  const first = evaluateRivals(data.groups, date, seq(3));
  const rolled = first.results.filter(r => !r.skipped);
  assert.equal(rolled.length, 8, "9 rivals minus 1 cancelled; player skipped");
  const bazi = first.groups.find(g => g.name === "Baziliškobijci");
  assert.equal(groupScore(bazi), 104 + 7);
  assert.ok(hasEvaluated(bazi, date));
  const second = evaluateRivals(first.groups, date, seq(6));
  assert.ok(second.results.every(r => r.skipped));
  assert.equal(groupScore(second.groups.find(g => g.name === "Baziliškobijci")), 111);
  assert.equal(nextRivalDay(second.groups, 2), 2);
  assert.equal(nextRivalDay(second.groups, 1), 11);
});

test("cancelled groups are unranked and listed last", () => {
  const data = seed();
  data.groups[0].status = "cancelled";
  const ranked = rankGroups(data.groups);
  assert.equal(ranked.at(-1).group.id, data.groups[0].id);
  assert.equal(ranked.at(-1).rank, null);
  assert.equal(ranked[0].rank, 1);
});

test("group SP uses milestones and tree tier costs", () => {
  const data = seed();
  const bazi = data.groups.find(g => g.name === "Baziliškobijci");
  assert.deepEqual(groupSP(bazi, tree(), 104), { earned: 6, spent: 6, available: 0 });
});

test("generated groups are complete, unique and deterministic for a seed", () => {
  const data = seed();
  const a = generateGroup(data.groups, { rng: lcg(7), id: "x" });
  const b = generateGroup(data.groups, { rng: lcg(7), id: "x" });
  assert.deepEqual(a, b);
  assert.equal(a.members.length, 5);
  assert.ok(!data.groups.some(g => g.name === a.name));
  assert.equal(a.face, a.members[0].name);
  assert.equal(new Set(a.members.map(m => m.name)).size, 5);
  assert.ok(a.startScore >= 0 && a.startScore <= 5);
  assert.equal(a.profile, -1);
  assert.equal(typicalLevel(data.groups), 3);
  for (const m of a.members) {
    assert.ok(m.level >= 2 && m.level <= 3, `${m.name} level ${m.level}`);
    assert.ok(m.hp >= m.level && m.ac >= 8, JSON.stringify(m));
    assert.equal(Object.keys(m.stats).length, 6);
  }
  const priest = generateMember({ classKey: "priest", rng: lcg(3), level: 2 });
  assert.match(priest.gear, /uctívá/);
  assert.match(priest.class, /kněz/);
});

test("evaluating only selected studios leaves the others untouched", () => {
  const data = seed();
  const pick = data.groups.filter(g => !g.isPlayer).slice(0, 2).map(g => g.id);
  const { groups, results } = evaluateRivals(data.groups, { chapter: 2, day: 1, kind: "day" }, seq(4), { only: new Set(pick) });
  assert.deepEqual(results.map(r => r.id).sort(), [...pick].sort());
  const untouched = groups.filter(g => !pick.includes(g.id) && !g.isPlayer);
  assert.ok(untouched.every(g => !hasEvaluated(g, { chapter: 2, day: 1, kind: "day" })));
});

test("multiple player studios: default to the top one, explicit choice wins", () => {
  const data = seed();
  const second = { ...data.groups.find(g => g.isPlayer), id: "p2", name: "Druhý stůl", startScore: 120, purchased: [{ id: "I11", cost: 1 }] };
  data.groups.push(second);
  assert.deepEqual(playerGroups(data.groups).map(g => g.id), ["p2", "hracska-redakce"]);
  assert.equal(resolveActiveGroup(data.groups, "").id, "p2");
  assert.equal(resolveActiveGroup(data.groups, "hracska-redakce").id, "hracska-redakce");
  assert.equal(resolveActiveGroup(data.groups, "bazilikobijci-missing").id, "p2");
  assert.equal(resolveActiveGroup(data.groups, "baziliskobijci").id, "p2", "rivals can't be active");
  assert.deepEqual(studioState(second), { popularity: 120, spAdjustment: 0, purchased: [{ id: "I11", cost: 1 }] });
  const { results } = evaluateRivals(data.groups, { chapter: 2, day: 1, kind: "day" }, seq(3));
  assert.ok(!results.some(r => r.id === "p2"), "player studios are never auto-evaluated");
});

test("player studio SP comes from its own purchases and adjustment", () => {
  const g = { isPlayer: true, purchased: [{ id: "I11", cost: 1 }, { id: "I21", cost: 2 }], spAdjustment: 1 };
  assert.deepEqual(groupSP(g, tree(), 95), { earned: 7, spent: 3, available: 4 });
});

test("latest chapter across the board", async () => {
  const { latestChapter } = await import("../scripts/rivals.mjs");
  assert.equal(latestChapter(seed().groups), 2);
  assert.equal(latestChapter([]), 1);
});
