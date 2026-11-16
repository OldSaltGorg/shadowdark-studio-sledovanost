import { test } from "node:test";
import assert from "node:assert/strict";
import { commitSession, createSession, sessionTotals, suggestedLevelBonus } from "../scripts/rewards.mjs";

const people = [
  { userId: "a", author: "Anna", protagonist: "Glatnig", level: 3 },
  { userId: "b", author: "Bob", protagonist: "Mubgnat", level: 4 },
  { userId: "c", author: "Cyril", protagonist: "Thrur", level: null }
];
const calendar = { chapter: 2, day: 3 };

test("level bonus only above a known record", () => {
  assert.equal(suggestedLevelBonus(4, 3), 1);
  assert.equal(suggestedLevelBonus(5, 3), 2);
  assert.equal(suggestedLevelBonus(3, 4), 0);
  assert.equal(suggestedLevelBonus(null, 3), 0);
});

test("first-time authors start at their current level with no retro award", () => {
  const s = createSession({ kind: "day", calendar, participants: people, authors: { b: { recordLevel: 3 } }, rng: () => 0 });
  assert.equal(s.entries.a.record, 3);
  assert.equal(s.entries.a.levelBonus, 0);
  assert.equal(s.entries.b.levelBonus, 1);
  assert.deepEqual(s.date, { chapter: 2, day: 4, kind: "day" });
  assert.deepEqual([...s.order].sort(), ["a", "b", "c"]);
});

test("commit adds a history entry, raises records and advances the day", () => {
  const authors = { b: { recordLevel: 3, lifetime: 10 } };
  const s = createSession({ kind: "day", calendar, participants: people, authors });
  s.entries.a.highlight = 2;
  s.entries.b.highlight = 1;
  s.entries.c.highlight = 0;
  assert.deepEqual(sessionTotals(s), { highlights: 3, levels: 1, total: 4, pending: 0 });
  const group = { id: "p", isPlayer: true, startScore: 50, history: [], calendar, authors: 5, authorRecords: authors };
  const { group: next, total } = commitSession(group, s, 1);
  assert.equal(total, 4);
  assert.equal(next.calendar.day, 4);
  assert.equal(next.authorRecords.b.recordLevel, 4);
  assert.equal(next.authorRecords.b.lifetime, 12);
  assert.equal(next.authorRecords.a.lifetime, 2);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].gain, 4);
  assert.equal(next.history[0].awards.length, 3);
  assert.deepEqual(group.history, [], "input is not mutated");
  assert.equal(next.authors, 5, "author count is untouched");
});

test("interviews do not advance the day counter", () => {
  const s = createSession({ kind: "interview", calendar, participants: people, authors: {} });
  assert.equal(s.date.day, null);
  const { group } = commitSession({ calendar, authors: 5, history: [] }, s);
  assert.equal(group.calendar.day, 3);
  assert.equal(group.history[0].kind, "interview");
});
