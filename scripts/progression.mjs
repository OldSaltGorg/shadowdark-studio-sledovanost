/**
 * Pure progression rules for the studio talent tree. No Foundry globals here,
 * so these functions can be unit-tested with plain Node.
 */

/** Popularita needed for milestone n: 5 × n × (n + 3). */
export function milestoneThreshold(n) {
  return 5 * n * (n + 3);
}

export function milestonesReached(popularity) {
  const score = Math.max(0, Number(popularity) || 0);
  let n = 0;
  while (milestoneThreshold(n + 1) <= score) n++;
  return n;
}

export function sortedTiers(tree) {
  return [...(tree.tiers ?? [])].sort((a, b) => a.unlockSpent - b.unlockSpent || a.id - b.id);
}

export function getTier(tree, tierId) {
  return tree.tiers?.find(t => t.id === tierId) ?? null;
}

export function computeProgress(tree, state) {
  const purchased = new Map((state.purchased ?? []).map(p => [p.id, p]));
  const spent = [...purchased.values()].reduce((sum, p) => sum + (Number(p.cost) || 0), 0);
  const popularity = Math.max(0, Number(state.popularity) || 0);
  const milestones = milestonesReached(popularity);
  const spPerMilestone = Number(tree.rules?.spPerMilestone ?? 2);
  const adjustment = Number(state.spAdjustment) || 0;
  const earned = milestones * spPerMilestone + adjustment;
  const tiers = sortedTiers(tree).map(t => ({ ...t, unlocked: spent >= t.unlockSpent }));
  return {
    popularity,
    milestones,
    nextMilestone: milestoneThreshold(milestones + 1),
    prevMilestone: milestoneThreshold(milestones),
    spPerMilestone,
    adjustment,
    earned,
    spent,
    available: earned - spent,
    purchased,
    tiers
  };
}

/**
 * Status of one talent.
 * state: "purchased" | "available" | "unaffordable" | "locked"
 * reasons: what blocks a purchase (tier lock, missing prerequisites, SP shortfall).
 */
export function talentStatus(talent, tree, progress) {
  const tier = getTier(tree, talent.tier);
  const cost = Number(tier?.cost) || 0;
  if (progress.purchased.has(talent.id)) {
    return { state: "purchased", cost, paid: progress.purchased.get(talent.id).cost, reasons: [] };
  }
  const reasons = [];
  if (!tier) reasons.push({ type: "noTier" });
  else if (progress.spent < tier.unlockSpent) {
    reasons.push({ type: "tier", need: tier.unlockSpent, spent: progress.spent });
  }
  const missing = (talent.prereqs ?? []).filter(id => !progress.purchased.has(id));
  if (missing.length) reasons.push({ type: "prereq", ids: missing });
  const locked = reasons.length > 0;
  if (progress.available < cost) reasons.push({ type: "sp", need: cost, available: progress.available });
  const state = locked ? "locked" : (reasons.length ? "unaffordable" : "available");
  return { state, cost, reasons };
}

/** IDs of talents that list `id` as a prerequisite. */
export function dependentsOf(tree, id) {
  return tree.talents.filter(t => t.prereqs?.includes(id)).map(t => t.id);
}

/** True if giving `talentId` these prerequisites would create a dependency cycle. */
export function createsCycle(tree, talentId, prereqs) {
  const graph = new Map(tree.talents.map(t => [t.id, t.prereqs ?? []]));
  graph.set(talentId, prereqs);
  const stack = [...prereqs];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === talentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(graph.get(id) ?? []));
  }
  return false;
}

/** Suggest the next free ID for a branch/tier, e.g. "U27". */
export function suggestTalentId(tree, branch, tierId) {
  const prefix = branch?.prefix || branch?.id?.[0]?.toUpperCase() || "T";
  const used = new Set(tree.talents.map(t => t.id));
  for (let i = 1; i < 1000; i++) {
    const id = `${prefix}${tierId}${i}`;
    if (!used.has(id)) return id;
  }
  return foundryLikeRandomId();
}

function foundryLikeRandomId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Move a talent to a slot; swaps with a talent already occupying it. */
export function moveTalent(tree, id, slot) {
  const talent = tree.talents.find(t => t.id === id);
  if (!talent) return tree;
  const occupant = tree.talents.find(t => t.id !== id && t.branch === slot.branch
    && t.tier === slot.tier && t.row === slot.row && t.col === slot.col);
  if (occupant) {
    Object.assign(occupant, { branch: talent.branch, tier: talent.tier, row: talent.row, col: talent.col });
  }
  Object.assign(talent, slot);
  return tree;
}

/** Rename a talent ID everywhere it is referenced. */
export function renameTalentId(tree, state, oldId, newId) {
  for (const t of tree.talents) {
    if (t.id === oldId) t.id = newId;
    t.prereqs = (t.prereqs ?? []).map(p => (p === oldId ? newId : p));
  }
  for (const p of state.purchased ?? []) if (p.id === oldId) p.id = newId;
}

/** Grid dimensions: sub-columns per branch, sub-rows per tier. */
export function gridDimensions(tree, { extra = 0, minCols = 3 } = {}) {
  const cols = {};
  const rows = {};
  for (const b of tree.branches) cols[b.id] = minCols;
  for (const t of tree.tiers) rows[t.id] = 1;
  for (const t of tree.talents) {
    if (t.branch in cols) cols[t.branch] = Math.max(cols[t.branch], t.col + 1);
    if (t.tier in rows) rows[t.tier] = Math.max(rows[t.tier], t.row + 1);
  }
  for (const k of Object.keys(cols)) cols[k] += extra;
  for (const k of Object.keys(rows)) rows[k] += extra;
  return { cols, rows };
}
