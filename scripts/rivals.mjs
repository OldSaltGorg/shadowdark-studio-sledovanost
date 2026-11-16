/**
 * Pure rival-studio and leaderboard rules. No Foundry globals.
 */
import { milestonesReached } from "./progression.mjs";

/** d6 → base gain, per the rival procedure table. */
export const BASE_GAIN = { 1: 1, 2: 3, 3: 5, 4: 6, 5: 7, 6: 8 };

export const HEADLINES = {
  1: "Nákladný nezdar nebo ústup.",
  2: "Běžný postup.",
  3: "Úspěšná výprava nebo objev.",
  4: "Výkon typický pro dané studio.",
  5: "Velký úspěch nebo obrat v rivalitě.",
  6: "Průlomová epizoda nebo dramatický zvrat."
};

export const PROFILES = [
  { value: -1, key: "newcomer" },
  { value: 0, key: "steady" },
  { value: 1, key: "rising" },
  { value: 2, key: "favourite" }
];

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Identity of an evaluated date; the same date is never processed twice. */
export function dateKey({ chapter, day, kind, at }) {
  if (kind === "manual") return `${chapter}|manual|${at ?? Math.random()}`;
  return kind === "interview" ? `${chapter}|interview` : `${chapter}|day|${day}`;
}

export function hasEvaluated(group, date) {
  const key = dateKey(date);
  return (group.history ?? []).some(h => dateKey(h) === key);
}

/**
 * Score of one group: opening score plus every recorded gain, so edits to
 * history self-correct. Player studios gain through the Daily awards flow.
 */
export function groupScore(group) {
  return Math.max(0, (Number(group.startScore) || 0) + (group.history ?? []).reduce((s, h) => s + (Number(h.gain) || 0), 0));
}

/** Player studios ordered by leaderboard position (best first). */
export function playerGroups(groups) {
  return rankGroups(groups).filter(x => x.group.isPlayer).map(x => x.group);
}

/** The studio the window works with: an explicit choice if valid, else the top player studio. */
export function resolveActiveGroup(groups, preferredId) {
  const players = playerGroups(groups);
  return players.find(g => g.id === preferredId) ?? players[0] ?? null;
}

/** Upgrade-tree state for a player studio, in the shape computeProgress expects. */
export function studioState(group) {
  return {
    popularity: group ? groupScore(group) : 0,
    spAdjustment: Number(group?.spAdjustment) || 0,
    purchased: group?.purchased ?? []
  };
}

/** Roll result for one rival. Interviews ignore the profile modifier. */
export function rivalGain(roll, { profile = 0, cap = 10, kind = "day" } = {}) {
  const base = BASE_GAIN[roll];
  const mod = kind === "interview" ? 0 : Number(profile) || 0;
  return { roll, base, profile: mod, gain: clamp(base + mod, 0, Number(cap) || 10), headline: HEADLINES[roll] };
}

/**
 * Evaluate all active rivals for one date.
 * @param {object[]} groups
 * @param {{chapter:number, day:number|null, kind:string}} date
 * @param {() => number} rollD6
 * @param {{only?: Set<string>|null}} [options] Restrict to these group IDs
 * @returns {{groups: object[], results: object[]}} new groups array and per-group results
 */
export function evaluateRivals(groups, date, rollD6, { only = null } = {}) {
  const results = [];
  const out = groups.map(group => {
    if (group.isPlayer || group.status !== "active") return group;
    if (only && !only.has(group.id)) return group;
    if (hasEvaluated(group, date)) {
      results.push({ id: group.id, name: group.name, skipped: true });
      return group;
    }
    const entry = {
      chapter: date.chapter,
      day: date.kind === "interview" ? null : date.day,
      kind: date.kind,
      ...rivalGain(rollD6(), { profile: group.profile, cap: group.cap, kind: date.kind }),
      at: Date.now()
    };
    results.push({ id: group.id, name: group.name, ...entry });
    return { ...group, history: [...(group.history ?? []), entry] };
  });
  return { groups: out, results };
}

/**
 * Competition ranking (1, 2, 2, 4) of active groups by score; ties display
 * alphabetically. Cancelled groups follow, unranked.
 */
export function rankGroups(groups, collator = new Intl.Collator("cs")) {
  const scored = groups.map(g => ({ group: g, score: groupScore(g) }));
  const active = scored.filter(x => x.group.status === "active")
    .sort((a, b) => b.score - a.score || collator.compare(a.group.name, b.group.name));
  let rank = 0;
  active.forEach((x, i) => {
    if (i === 0 || x.score !== active[i - 1].score) rank = i + 1;
    x.rank = rank;
  });
  const cancelled = scored.filter(x => x.group.status !== "active")
    .sort((a, b) => b.score - a.score || collator.compare(a.group.name, b.group.name))
    .map(x => ({ ...x, rank: null }));
  return [...active, ...cancelled];
}

export function rankSnapshot(groups) {
  return Object.fromEntries(rankGroups(groups).filter(x => x.rank).map(x => [x.group.id, x.rank]));
}

/** Most recent history entry (for the "last gain" column). */
export function lastEntry(group) {
  const h = group.history ?? [];
  return h.length ? h[h.length - 1] : null;
}

/** Next unevaluated rival day in a chapter (for the manual evaluation default). */
export function nextRivalDay(groups, chapter) {
  let max = 0;
  for (const g of groups) {
    if (g.isPlayer) continue;
    for (const h of g.history ?? []) if (h.kind === "day" && h.chapter === chapter) max = Math.max(max, h.day);
  }
  return max + 1;
}

/** Most recent chapter anywhere on the board (player calendars or recorded history). */
export function latestChapter(groups) {
  let chapter = 1;
  for (const g of groups) {
    chapter = Math.max(chapter, Number(g.calendar?.chapter) || 0);
    for (const h of g.history ?? []) chapter = Math.max(chapter, Number(h.chapter) || 0);
  }
  return chapter;
}

/** SP summary for a group, using the same milestones and the tree's tier costs. */
export function groupSP(group, tree, score, spPerMilestone = 2) {
  const earned = milestonesReached(score) * spPerMilestone;
  const tierCost = new Map((tree?.tiers ?? []).map(t => [t.id, t.cost]));
  if (group.isPlayer) {
    const paid = (group.purchased ?? []).reduce((s, p) => s + (Number(p.cost) || 0), 0);
    const total = earned + (Number(group.spAdjustment) || 0);
    return { earned: total, spent: paid, available: total - paid };
  }
  const spent = (group.upgrades ?? []).reduce((s, id) => {
    const talent = tree?.talents?.find(x => x.id === id);
    return s + (talent ? tierCost.get(talent.tier) ?? 0 : 0);
  }, 0);
  return { earned, spent, available: earned - spent };
}
