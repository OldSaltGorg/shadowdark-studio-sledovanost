import { MODULE_ID } from "../constants.mjs";
import { t } from "../i18n.mjs";
import { generateGroup } from "../generator.mjs";
import { evaluateRivals, lastEntry, latestChapter, nextRivalDay, rankGroups, rankSnapshot } from "../rivals.mjs";
import { getRivals, getStudio, isValidRivals, loadDefaultRivals, saveRivals } from "../store.mjs";
import { readForm } from "../forms.mjs";
import { GroupSheet } from "../apps/group-sheet.mjs";
import { dateLabel, rollD6 } from "./common.mjs";

const { DialogV2 } = foundry.applications.api;
const PUBLIC_ROWS = 10;

export async function prepareBoard(base) {
  const { lang, isGM } = base;
  const rivals = base.rivals;
  const ranked = rankGroups(rivals.groups);
  this.lbSelection ??= new Set();
  const ids = new Set(rivals.groups.map(g => g.id));
  for (const id of this.lbSelection) if (!ids.has(id)) this.lbSelection.delete(id);
  const rows = [];
  let shown = 0;
  for (const { group, score, rank } of ranked) {
    const active = rank !== null;
    if (active) shown++;
    const visible = isGM || (active && shown <= PUBLIC_ROWS);
    if (!visible) continue;
    const last = lastEntry(group);
    const prev = rivals.lastRanks?.[group.id];
    const move = active && prev ? prev - rank : 0;
    rows.push({
      id: group.id,
      rank,
      name: group.name,
      face: group.face,
      score,
      isPlayer: group.isPlayer,
      cancelled: !active,
      lastGain: last ? last.gain : null,
      lastLabel: last ? dateLabel(last, lang) : "",
      headline: last?.headline ?? "",
      selectable: active && !group.isPlayer,
      selected: this.lbSelection.has(group.id),
      gainText: last ? (last.gain < 0 ? `${last.gain}` : `+${last.gain}`) : "",
      moveUp: move > 0 ? move : 0,
      moveDown: move < 0 ? -move : 0,
      dividerBefore: isGM && active && shown === PUBLIC_ROWS + 1,
      cancelledDivider: false
    });
  }
  const firstCancelled = rows.find(r => r.cancelled);
  if (firstCancelled) firstCancelled.cancelledDivider = true;

  this._lbSelectable = rows.filter(r => r.selectable).map(r => r.id);
  const evaluation = rivals.lastEvaluation;
  return {
    title: rivals.title || "Žebříček Popularity",
    selectedCount: this.lbSelection.size,
    rows,
    evaluation: isGM && evaluation ? {
      label: dateLabel(evaluation.date, lang),
      when: new Date(evaluation.at).toLocaleString(lang),
      results: (evaluation.results ?? []).map(r => ({
        ...r,
        dateLabel: dateLabel(r.date ?? evaluation.date, lang),
        profile: r.profile ? (r.profile > 0 ? `+${r.profile}` : `−${-r.profile}`) : ""
      }))
    } : null
  };
}

export function renderBoard() {
  if (!game.user.isGM) return;
  const html = this.element;
  html.querySelectorAll(".sds-lb-row[data-group-id]").forEach(row => {
    row.addEventListener("dblclick", () => openGroup(row.dataset.groupId));
  });
  html.querySelectorAll("input[data-lb-select]").forEach(box => {
    box.addEventListener("dblclick", event => event.stopPropagation());
    box.addEventListener("change", () => {
      if (box.checked) this.lbSelection.add(box.dataset.lbSelect);
      else this.lbSelection.delete(box.dataset.lbSelect);
      this.render();
    });
  });
  html.querySelector("input[data-board-title]")?.addEventListener("change", async event => {
    const rivals = await getRivals();
    rivals.title = event.currentTarget.value;
    await saveRivals(rivals);
  });
}

function openGroup(id) {
  new GroupSheet({ groupId: id }).render({ force: true });
}

/* -------------------------------------------- */
/*  Actions (GM)                                */
/* -------------------------------------------- */

function editGroup(event, target) {
  openGroup(target.closest("[data-group-id]").dataset.groupId);
}

async function addGroup() {
  const rivals = await getRivals();
  const group = generateGroup(rivals.groups, { id: foundry.utils.randomID(10) });
  rivals.groups.push(group);
  await saveRivals(rivals);
  ui.notifications.info(t("Board.Generated", { name: group.name }));
  openGroup(group.id);
}

async function evaluateNow() {
  const { rivals, group } = await getStudio();
  const chapter = Number(group?.calendar?.chapter) || latestChapter(rivals.groups);
  const selected = [...(this.lbSelection ?? [])].filter(id => rivals.groups.some(g => g.id === id && !g.isPlayer));
  const selectedNames = selected.map(id => rivals.groups.find(g => g.id === id).name);
  const content = `
    <div class="form-group"><label>${t("Board.EvalKind")}</label>
      <select name="kind"><option value="day">${t("Board.EvalDay")}</option><option value="interview">${t("Board.EvalInterview")}</option></select></div>
    <div class="form-group"><label>${t("Board.EvalChapter")}</label><input type="number" name="chapter" min="1" value="${chapter}"></div>
    <div class="form-group"><label>${t("Board.EvalFromDay")}</label><input type="number" name="day" min="1" value="${nextRivalDay(rivals.groups, chapter)}"></div>
    <div class="form-group"><label>${t("Board.EvalCount")}</label><input type="number" name="count" min="1" max="30" value="1"></div>
    ${selected.length ? `<div class="form-group"><label>${t("Board.EvalSelectedOnly", { n: selected.length })}</label>`
      + `<input type="checkbox" name="selectedOnly" checked></div>`
      + `<p class="hint">${foundry.utils.escapeHTML(selectedNames.join(", "))}</p>` : ""}
    <p class="hint">${t("Board.EvalHint")}</p>`;
  const data = await DialogV2.wait({
    window: { title: t("Board.Evaluate") },
    content,
    buttons: [
      { action: "go", label: t("Board.Evaluate"), icon: "fa-solid fa-dice-six", default: true,
        callback: (event, button) => readForm(button.form) },
      { action: "cancel", label: t("Board.Cancel") }
    ]
  });
  if (!data || typeof data !== "object") return;
  const kind = data.kind === "interview" ? "interview" : "day";
  const ch = Math.max(1, Math.trunc(Number(data.chapter) || chapter));
  const from = Math.max(1, Math.trunc(Number(data.day) || 1));
  const count = kind === "interview" ? 1 : Math.min(30, Math.max(1, Math.trunc(Number(data.count) || 1)));

  const ranksBefore = rankSnapshot(rivals.groups);
  const only = data.selectedOnly && selected.length ? new Set(selected) : null;
  const allResults = [];
  let lastDate = null;
  for (let i = 0; i < count; i++) {
    lastDate = { chapter: ch, day: kind === "interview" ? null : from + i, kind };
    const { groups, results } = evaluateRivals(rivals.groups, lastDate, rollD6, { only });
    rivals.groups = groups;
    allResults.push(...results.map(r => ({ ...r, date: { ...lastDate } })));
  }
  const rolled = allResults.filter(r => !r.skipped).length;
  if (rolled) {
    rivals.lastRanks = ranksBefore;
    rivals.lastEvaluation = { date: lastDate, results: allResults, at: Date.now() };
    await saveRivals(rivals);
  }
  if (only) this.lbSelection.clear();
  ui.notifications.info(t("Board.Evaluated", { n: rolled, skipped: allResults.length - rolled }));
}

async function exportBoard() {
  const rivals = await getRivals();
  const payload = {
    module: MODULE_ID,
    type: "leaderboard",
    exported: new Date().toISOString(),
    rivals
  };
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(JSON.stringify(payload, null, 2), "application/json", `${MODULE_ID}-leaderboard-${new Date().toISOString().slice(0, 10)}.json`);
}

async function importBoard() {
  let file = null;
  const result = await DialogV2.wait({
    window: { title: t("Board.Import") },
    content: `<div class="form-group"><label>${t("Board.File")}</label><input type="file" name="file" accept=".json,application/json"></div>`
      + `<p class="hint">${t("Board.ImportHint")}</p>`,
    buttons: [
      { action: "import", label: t("Board.Import"), default: true,
        callback: (event, button) => { file = button.form.elements.file.files[0]; return "import"; } },
      { action: "cancel", label: t("Board.Cancel") }
    ]
  });
  if (result !== "import" || !file) return;
  try {
    const data = JSON.parse(await file.text());
    const rivals = data.rivals ?? data;
    if (!isValidRivals(rivals)) throw new Error("Invalid leaderboard");
    await saveRivals(rivals);
    ui.notifications.info(t("Board.Imported"));
  } catch (err) {
    console.error(`${MODULE_ID} | Leaderboard import failed`, err);
    ui.notifications.error(t("Board.ImportFailed"));
  }
}

async function resetBoard() {
  const ok = await DialogV2.confirm({ window: { title: t("Board.Reset") }, content: `<p>${t("Board.ResetConfirm")}</p>` });
  if (ok) await saveRivals(await loadDefaultRivals());
}

function selectAll() {
  this.lbSelection = new Set(this._lbSelectable ?? []);
  this.render();
}

function selectNone() {
  this.lbSelection = new Set();
  this.render();
}

export const boardActions = {
  lbSelectAll: selectAll,
  lbSelectNone: selectNone,
  lbEdit: editGroup,
  lbAdd: addGroup,
  lbEvaluate: evaluateNow,
  lbExport: exportBoard,
  lbImport: importBoard,
  lbReset: resetBoard
};

