import { t } from "../i18n.mjs";
import { commitSession, createSession, DEFAULT_CALENDAR, entryTotal, sessionTotals, shuffle } from "../rewards.mjs";
import { evaluateRivals, groupScore, rankSnapshot, resolveActiveGroup } from "../rivals.mjs";
import { getActiveGroupId, getRivals, getSession, saveRivals, saveSession, setActiveGroupId, updateStudio } from "../store.mjs";
import { dateLabel, rollD6 } from "./common.mjs";

const { DialogV2 } = foundry.applications.api;

/** Non-GM users who could take part, with their assigned protagonist. */
function candidates() {
  return game.users.filter(u => !u.isGM).map(user => {
    const actor = user.character;
    const level = Number(actor?.system?.level?.value);
    return {
      userId: user.id,
      author: user.name,
      protagonist: actor?.name ?? "",
      actorId: actor?.id ?? null,
      img: actor?.img ?? user.avatar ?? "icons/svg/mystery-man.svg",
      level: Number.isFinite(level) ? level : null,
      active: !!user.active,
      color: user.color?.css ?? String(user.color ?? "#888")
    };
  });
}

export async function prepareRewards(base) {
  const { lang, L, isGM, group, players } = base;
  const session = getSession();
  const people = candidates();
  if (!this.rwSelection) {
    this.rwSelection = new Set(people.filter(p => p.active && p.actorId).map(p => p.userId));
  }

  const rubric = [0, 1, 2].map(n => ({ points: n, text: L.Rewards.Rubric[n] }));
  const calendar = { ...DEFAULT_CALENDAR, ...(group?.calendar ?? {}) };
  const auto = !getActiveGroupId();
  const ctx = {
    rubric,
    calendar,
    studio: group ? { id: group.id, name: group.name } : null,
    studios: players.length > 1 || !auto ? [
      { id: "", name: t("Rewards.AutoStudio", { name: players[0]?.name ?? "—" }, lang), selected: auto },
      ...players.map(g => ({ id: g.id, name: `${g.name} (${groupScore(g)})`, selected: !auto && g.id === group?.id }))
    ] : null,
    authors: Object.entries(group?.authorRecords ?? {}).map(([id, a]) => ({ id, ...a }))
      .sort((a, b) => (b.lifetime ?? 0) - (a.lifetime ?? 0)),
    recent: recentDays(group, lang)
  };

  if (!group) {
    ctx.noStudio = true;
    return ctx;
  }

  if (!session) {
    ctx.setup = {
      kind: this.rwKind ?? "day",
      people: people.map(p => ({ ...p, checked: this.rwSelection.has(p.userId) })),
      nextLabel: dateLabel({
        chapter: calendar.chapter,
        day: calendar.day + 1,
        kind: this.rwKind ?? "day"
      }, lang),
      canStart: isGM && people.some(p => this.rwSelection.has(p.userId))
    };
    return ctx;
  }

  const totals = sessionTotals(session);
  const order = session.order.map((id, i) => {
    const e = session.entries[id];
    return {
      userId: id,
      index: i,
      author: e.author,
      protagonist: e.protagonist || e.author,
      done: e.highlight !== null,
      current: session.phase === "focus" && i === session.index,
      total: entryTotal(e)
    };
  });
  const focusId = session.order[session.index];
  const e = session.entries[focusId];
  ctx.session = {
    phase: session.phase,
    kind: session.date.kind,
    isInterview: session.date.kind === "interview",
    label: dateLabel(session.date, lang),
    order,
    totals,
    isFirst: session.index === 0,
    isLast: session.index === session.order.length - 1
  };
  if (session.phase === "focus" && e) {
    const name = e.protagonist || e.author;
    ctx.focus = {
      ...e,
      name,
      prompt: t(session.date.kind === "interview" ? "Rewards.PromptInterview" : "Rewards.Prompt", { name }, lang),
      options: rubric.map(r => ({ ...r, selected: e.highlight === r.points })),
      levelKnown: Number.isFinite(e.level),
      newRecord: e.levelBonus > 0,
      recordText: t("Rewards.NewRecord", { n: e.levelBonus }, lang),
      position: t("Rewards.Position", { n: session.index + 1, total: session.order.length }, lang)
    };
  }
  if (session.phase === "summary") {
    ctx.summary = session.order.map(id => {
      const x = session.entries[id];
      return {
        userId: id,
        author: x.author,
        protagonist: x.protagonist,
        level: x.level,
        record: x.record,
        highlight: x.highlight ?? 0,
        levelBonus: x.levelBonus,
        note: x.note,
        total: entryTotal(x),
        options: [0, 1, 2].map(n => ({ n, selected: (x.highlight ?? 0) === n }))
      };
    });
  }
  return ctx;
}

function recentDays(group, lang) {
  return (group?.history ?? []).filter(h => h.kind !== "manual").slice(-6).reverse()
    .map(h => ({ label: dateLabel(h, lang), total: h.gain }));
}

export function renderRewards() {
  const html = this.element;
  if (!game.user.isGM) return;
  html.querySelectorAll("[data-rw-field]").forEach(el => {
    el.addEventListener("change", event => onFieldChange.call(this, event));
  });
  html.querySelectorAll("input[data-rw-select]").forEach(el => {
    el.addEventListener("change", () => {
      if (el.checked) this.rwSelection.add(el.dataset.rwSelect);
      else this.rwSelection.delete(el.dataset.rwSelect);
      this.render();
    });
  });
  html.querySelectorAll("input[data-calendar]").forEach(el => {
    el.addEventListener("change", async () => {
      const key = el.dataset.calendar;
      const value = Math.max(key === "chapter" ? 1 : 0, Math.trunc(Number(el.value) || 0));
      await updateStudio(group => {
        group.calendar = { ...DEFAULT_CALENDAR, ...(group.calendar ?? {}), [key]: value };
      });
    });
  });
  html.querySelector("select[data-studio-select]")?.addEventListener("change", async event => {
    if (getSession()) {
      ui.notifications.warn(t("Rewards.FinishFirst"));
      this.render();
      return;
    }
    await setActiveGroupId(event.currentTarget.value);
  });
}

/** Summary-table and note edits: `data-rw-field="highlight|levelBonus|note"` + `data-user`. */
async function onFieldChange(event) {
  const el = event.currentTarget;
  const session = getSession();
  const entry = session?.entries[el.dataset.user];
  if (!entry) return;
  const field = el.dataset.rwField;
  if (field === "note") entry.note = el.value;
  else if (field === "highlight") entry.highlight = Math.min(2, Math.max(0, Math.trunc(Number(el.value) || 0)));
  else if (field === "levelBonus") entry.levelBonus = Math.max(0, Math.trunc(Number(el.value) || 0));
  await saveSession(session);
}

/* -------------------------------------------- */
/*  Actions (GM drives; players watch)          */
/* -------------------------------------------- */

function setKind(event, target) {
  this.rwKind = target.dataset.kind;
  this.render();
}

async function startSession() {
  if (!game.user.isGM) return;
  const people = candidates().filter(p => this.rwSelection.has(p.userId));
  if (!people.length) return;
  const rivals = await getRivals();
  const group = resolveActiveGroup(rivals.groups, getActiveGroupId());
  if (!group) return;
  const session = createSession({
    kind: this.rwKind ?? "day",
    calendar: { ...DEFAULT_CALENDAR, ...(group.calendar ?? {}) },
    participants: people.map(({ active, color, ...p }) => p),
    authors: group.authorRecords ?? {}
  });
  session.groupId = group.id;
  await saveSession(session);
}

async function reshuffle() {
  const session = getSession();
  if (!session) return;
  session.order = shuffle(session.order);
  session.index = 0;
  await saveSession(session);
}

async function setHighlight(event, target) {
  const session = getSession();
  const id = session?.order[session.index];
  if (!id) return;
  session.entries[id].highlight = Number(target.dataset.points);
  await saveSession(session);
}

async function adjustLevel(event, target) {
  const session = getSession();
  const id = session?.order[session.index];
  if (!id) return;
  const entry = session.entries[id];
  entry.levelBonus = Math.max(0, (Number(entry.levelBonus) || 0) + Number(target.dataset.delta));
  await saveSession(session);
}

async function focusAuthor(event, target) {
  const session = getSession();
  if (!session) return;
  session.phase = "focus";
  session.index = Number(target.dataset.index);
  await saveSession(session);
}

async function nextAuthor() {
  const session = getSession();
  if (!session) return;
  const id = session.order[session.index];
  if (session.entries[id].highlight === null) {
    ui.notifications.warn(t("Rewards.PickPoints"));
    return;
  }
  if (session.index >= session.order.length - 1) session.phase = "summary";
  else session.index += 1;
  await saveSession(session);
}

async function prevAuthor() {
  const session = getSession();
  if (!session) return;
  if (session.phase === "summary") session.phase = "focus";
  else session.index = Math.max(0, session.index - 1);
  await saveSession(session);
}

async function showSummary() {
  const session = getSession();
  if (!session) return;
  session.phase = "summary";
  await saveSession(session);
}

async function cancelSession() {
  const ok = await DialogV2.confirm({ window: { title: t("Rewards.Cancel") }, content: `<p>${t("Rewards.CancelConfirm")}</p>` });
  if (ok) await saveSession(null);
}

async function commitDay() {
  if (!game.user.isGM) return;
  const session = getSession();
  if (!session) return;
  const totals = sessionTotals(session);
  const ok = await DialogV2.confirm({
    window: { title: t("Rewards.Commit") },
    content: `<p>${t("Rewards.CommitConfirm", { total: totals.total, label: dateLabel(session.date) })}</p>`
      + (totals.pending ? `<p class="sds-warning">${t("Rewards.PendingWarning", { n: totals.pending })}</p>` : "")
  });
  if (!ok) return;

  // One write: the player studio's day and the rivals' rolls for the same date.
  const rivals = await getRivals();
  const index = rivals.groups.findIndex(g => g.id === session.groupId);
  if (index < 0) {
    ui.notifications.error(t("Notify.NoStudio"));
    return;
  }
  rivals.lastRanks = rankSnapshot(rivals.groups);
  const { group, total } = commitSession(rivals.groups[index], session);
  rivals.groups[index] = group;
  const date = session.date;
  const { groups, results } = evaluateRivals(rivals.groups, date, rollD6);
  rivals.groups = groups;
  rivals.lastEvaluation = { date, results, at: Date.now() };
  await saveRivals(rivals);
  await saveSession(null);
  ui.notifications.info(t("Rewards.Committed", { total, label: dateLabel(date) }));
  this.activeTab = "board";
  this.render();
}

export const rewardsActions = {
  rwKind: setKind,
  rwStart: startSession,
  rwShuffle: reshuffle,
  rwPoints: setHighlight,
  rwLevel: adjustLevel,
  rwFocus: focusAuthor,
  rwNext: nextAuthor,
  rwPrev: prevAuthor,
  rwSummary: showSummary,
  rwCancel: cancelSession,
  rwCommit: commitDay
};
