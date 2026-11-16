/**
 * Pure rules for the daily author-award flow (Tab 1). No Foundry globals.
 */

export const MAX_HIGHLIGHT = 2;

export const DEFAULT_CALENDAR = Object.freeze({ chapter: 1, day: 0 });

/** +1 per level above the author's career record. Unknown record = no award. */
export function suggestedLevelBonus(level, record) {
  if (!Number.isFinite(level) || !Number.isFinite(record)) return 0;
  return Math.max(0, level - record);
}

export function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Create a session. Participants: [{userId, author, protagonist, actorId, img, level}].
 * The author's record is taken from `authors`; a first-time author's record starts at
 * their current level (no retrospective award).
 */
export function createSession({ kind, calendar, participants, authors, rng = Math.random }) {
  const date = { chapter: calendar.chapter, day: kind === "interview" ? null : calendar.day + 1, kind };
  const entries = {};
  for (const p of participants) {
    const known = authors[p.userId]?.recordLevel;
    const record = Number.isFinite(known) ? known : p.level;
    entries[p.userId] = {
      ...p,
      record,
      highlight: null,
      levelBonus: suggestedLevelBonus(p.level, record),
      note: ""
    };
  }
  return {
    active: true,
    phase: "focus",
    date,
    order: shuffle(participants.map(p => p.userId), rng),
    index: 0,
    entries,
    startedAt: Date.now()
  };
}

export function entryTotal(entry) {
  return (Number(entry.highlight) || 0) + (Number(entry.levelBonus) || 0);
}

export function sessionTotals(session) {
  const rows = session.order.map(id => session.entries[id]).filter(Boolean);
  return {
    highlights: rows.reduce((s, e) => s + (Number(e.highlight) || 0), 0),
    levels: rows.reduce((s, e) => s + (Number(e.levelBonus) || 0), 0),
    total: rows.reduce((s, e) => s + entryTotal(e), 0),
    pending: rows.filter(e => e.highlight === null).length
  };
}

/**
 * Apply a finished session to a player studio: author records, calendar and a
 * history entry (with per-author detail) that raises its score.
 * @returns {{group: object, total: number}}
 */
export function commitSession(group, session, now = Date.now()) {
  const next = structuredClone(group);
  next.authorRecords ??= {};
  next.history ??= [];
  next.calendar = { ...DEFAULT_CALENDAR, ...(next.calendar ?? {}) };
  let total = 0;
  const awards = [];
  for (const userId of session.order) {
    const e = session.entries[userId];
    if (!e) continue;
    const gained = entryTotal(e);
    total += gained;
    const author = next.authorRecords[userId] ?? { lifetime: 0, recordLevel: e.record };
    author.name = e.author;
    author.protagonist = e.protagonist;
    author.lifetime = (Number(author.lifetime) || 0) + gained;
    // Assigning a higher-level protagonist raises the record even without an award.
    author.recordLevel = Math.max(Number(author.recordLevel) || 0, Number(e.level) || 0, Number(e.record) || 0);
    next.authorRecords[userId] = author;
    awards.push({
      userId,
      author: e.author,
      protagonist: e.protagonist,
      highlight: Number(e.highlight) || 0,
      level: Number(e.levelBonus) || 0,
      note: e.note ?? ""
    });
  }
  next.history.push({ ...session.date, gain: total, headline: "", awards, at: now });
  if (session.date.kind === "day") {
    next.calendar = { ...next.calendar, day: Math.max(next.calendar.day, session.date.day) };
  }
  return { group: next, total };
}
