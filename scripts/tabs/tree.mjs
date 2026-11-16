import { MODULE_ID } from "../constants.mjs";
import { currentLanguage, labels, pick, t } from "../i18n.mjs";
import {
  computeProgress, dependentsOf, getTier, gridDimensions, moveTalent, sortedTiers, suggestTalentId, talentStatus
} from "../progression.mjs";
import { routeEdge } from "../routing.mjs";
import { getRivals, getStudio, getTree, isValidTree, loadDefaultTree, saveTree, updateStudio } from "../store.mjs";
import { groupScore } from "../rivals.mjs";
import { TalentEditor } from "../apps/talent-editor.mjs";
import { formDialog, readForm } from "../forms.mjs";

const { DialogV2 } = foundry.applications.api;
const TextEditorImpl = () => foundry.applications.ux.TextEditor.implementation;

const GAP_X = 12;
const GAP_Y = 20;


/** Tree-tab context. Called with `this` = the studio app. */
export async function prepareTree(base) {
  const { lang, L, isGM, tree, progress, state } = base;
  this._studioState = state;
  if (!isGM) this.editMode = false;
  const editMode = this.editMode;
  if (this.selectedTalent && !tree.talents.some(x => x.id === this.selectedTalent)) this.selectedTalent = null;
  if (this.selectedBranch && !tree.branches.some(x => x.id === this.selectedBranch)) this.selectedBranch = null;
  return {
    editMode,
    layout: buildLayout.call(this, tree, progress, lang, L, editMode),
    detail: await buildDetail.call(this, tree, progress, lang, L, isGM, editMode),
    ownedCount: progress.purchased.size,
    totalCount: tree.talents.length
  };
}

/** Wire up tree-tab DOM behaviour after render. */
export function renderTree() {
  const html = this.element;
  html.querySelectorAll("input[data-state-field]").forEach(input => {
    input.addEventListener("change", event => onStateFieldChange.call(this, event));
  });
  if (this.editMode) activateDragDrop.call(this, html);
  const board = html.querySelector(".sds-board");
  this._resizeObserver?.disconnect();
  this._resizeObserver = null;
  if (board) {
    this._resizeObserver = new ResizeObserver(() => drawEdges.call(this));
    this._resizeObserver.observe(board);
    requestAnimationFrame(() => drawEdges.call(this));
  }
}

function buildLayout(tree, progress, lang, L, editMode) {
  const { cols, rows } = gridDimensions(tree, { extra: editMode ? 1 : 0 });
  const tiers = sortedTiers(tree);
  const branches = tree.branches;

  // Column 1 = tier labels; each branch is preceded by a separator column.
  const colTemplate = ["var(--sds-label-w)"];
  const branchCol = {};
  let c = 2;
  for (const b of branches) {
    colTemplate.push("var(--sds-sep)");
    c++;
    branchCol[b.id] = c;
    for (let i = 0; i < cols[b.id]; i++) colTemplate.push("var(--sds-node-w)");
    c += cols[b.id];
  }
  colTemplate.push("var(--sds-sep)");
  const lastCol = c + 1;

  // Row 1 = branch headers; each tier is preceded by a separator row.
  const rowTemplate = ["auto"];
  const tierRow = {};
  let r = 2;
  for (const tier of tiers) {
    rowTemplate.push("var(--sds-sep)");
    r++;
    tierRow[tier.id] = r;
    for (let i = 0; i < rows[tier.id]; i++) rowTemplate.push("var(--sds-node-h)");
    r += rows[tier.id];
  }
  const lastRow = r;

  const tierProgress = new Map(progress.tiers.map(x => [x.id, x]));
  const branchMap = new Map(branches.map(b => [b.id, b]));

  const headers = branches.map(b => ({
    id: b.id,
    name: pick(b.name, lang),
    color: b.color,
    col: `${branchCol[b.id]} / span ${cols[b.id]}`,
    selected: this.selectedBranch === b.id
  }));

  const tierLabels = tiers.map(tier => {
    const tp = tierProgress.get(tier.id);
    return {
      id: tier.id,
      label: tier.label,
      cost: t("Tier.Cost", { cost: tier.cost }, lang),
      status: tp.unlocked ? L.Tier.Unlocked : t("Tier.Locked", { need: tier.unlockSpent }, lang),
      unlocked: tp.unlocked,
      row: `${tierRow[tier.id]} / span ${rows[tier.id]}`
    };
  });

  const cells = [];
  for (const b of branches) for (const tier of tiers) {
    cells.push({
      color: b.color,
      locked: !tierProgress.get(tier.id).unlocked,
      col: `${branchCol[b.id]} / span ${cols[b.id]}`,
      row: `${tierRow[tier.id]} / span ${rows[tier.id]}`
    });
  }

  const separators = [
    ...branches.map(b => ({ kind: "v", col: `${branchCol[b.id] - 1}`, row: `2 / ${lastRow}` })),
    { kind: "v", col: `${lastCol - 1}`, row: `2 / ${lastRow}` },
    ...tiers.map(tier => ({ kind: "h", col: `1 / ${lastCol}`, row: `${tierRow[tier.id] - 1}` }))
  ];

  const occupied = new Set();
  const nodes = [];
  for (const talent of tree.talents) {
    const branch = branchMap.get(talent.branch);
    if (!branch || !(talent.tier in tierRow)) continue;
    occupied.add(`${talent.branch}|${talent.tier}|${talent.row}|${talent.col}`);
    const status = talentStatus(talent, tree, progress);
    const name = pick(talent.name, lang);
    nodes.push({
      id: talent.id,
      name,
      color: branch.color,
      state: status.state,
      branch: talent.branch,
      tier: talent.tier,
      r: talent.row,
      c: talent.col,
      col: branchCol[talent.branch] + talent.col,
      row: tierRow[talent.tier] + talent.row,
      selected: this.selectedTalent === talent.id,
      related: isRelated.call(this, tree, talent.id),
      hasCondition: !!pick(talent.condition, lang),
      tooltip: `${name} — ${L.Status[status.state]} (${t("Tier.Cost", { cost: status.cost }, lang)})`
    });
  }

  const slots = [];
  if (editMode) {
    for (const b of branches) for (const tier of tiers) {
      for (let rr = 0; rr < rows[tier.id]; rr++) for (let cc = 0; cc < cols[b.id]; cc++) {
        if (occupied.has(`${b.id}|${tier.id}|${rr}|${cc}`)) continue;
        slots.push({
          branch: b.id, tier: tier.id, r: rr, c: cc,
          col: branchCol[b.id] + cc, row: tierRow[tier.id] + rr
        });
      }
    }
  }

  const orphans = tree.talents.filter(x => !branchMap.has(x.branch) || !(x.tier in tierRow))
    .map(x => ({ id: x.id, name: pick(x.name, lang) }));

  return {
    style: `grid-template-columns: ${colTemplate.join(" ")}; grid-template-rows: ${rowTemplate.join(" ")};`
      + ` column-gap: ${GAP_X}px; row-gap: ${GAP_Y}px;`,
    headers, tierLabels, cells, separators, nodes, slots, orphans
  };
}

function isRelated(tree, id) {
  const sel = this.selectedTalent;
  if (!sel || sel === id) return false;
  const selected = tree.talents.find(x => x.id === sel);
  const talent = tree.talents.find(x => x.id === id);
  return !!(selected?.prereqs?.includes(id) || talent?.prereqs?.includes(sel));
}

async function buildDetail(tree, progress, lang, L, isGM, editMode) {
  const enrich = html => TextEditorImpl().enrichHTML(html ?? "", { secrets: isGM });
  const nameOf = id => pick(tree.talents.find(x => x.id === id)?.name, lang) || id;

  if (this.selectedTalent) {
    const talent = tree.talents.find(x => x.id === this.selectedTalent);
    const branch = tree.branches.find(b => b.id === talent.branch);
    const tier = getTier(tree, talent.tier);
    const status = talentStatus(talent, tree, progress);
    const purchase = progress.purchased.get(talent.id);
    const reasons = status.reasons.map(reason => {
      switch (reason.type) {
        case "tier": return t("Reason.Tier", { need: reason.need, spent: reason.spent }, lang);
        case "prereq": return t("Reason.Prereq", { names: reason.ids.map(nameOf).join(", ") }, lang);
        case "sp": return t("Reason.SP", { need: reason.need, available: reason.available }, lang);
        default: return L.Reason.NoTier;
      }
    });
    return {
      type: "talent",
      id: talent.id,
      name: pick(talent.name, lang),
      color: branch?.color ?? "#999",
      branchName: pick(branch?.name, lang),
      tierLabel: tier?.label ?? "?",
      cost: status.cost,
      state: status.state,
      stateLabel: L.Status[status.state],
      reasons,
      condition: pick(talent.condition, lang),
      description: await enrich(pick(talent.description, lang)),
      prereqs: (talent.prereqs ?? []).map(id => ({ id, name: nameOf(id), owned: progress.purchased.has(id) })),
      unlocks: dependentsOf(tree, talent.id).map(id => ({ id, name: nameOf(id), owned: progress.purchased.has(id) })),
      purchasedOn: purchase?.at ? new Date(purchase.at).toLocaleDateString(lang) : null,
      paid: purchase?.cost,
      canPurchase: isGM && status.state === "available",
      canGrant: isGM && editMode && !purchase && status.state !== "available",
      canRefund: isGM && !!purchase
    };
  }

  if (this.selectedBranch) {
    const branch = tree.branches.find(b => b.id === this.selectedBranch);
    const talents = tree.talents.filter(x => x.branch === branch.id);
    return {
      type: "branch",
      id: branch.id,
      name: pick(branch.name, lang),
      color: branch.color,
      description: await enrich(pick(branch.description, lang)),
      owned: talents.filter(x => progress.purchased.has(x.id)).length,
      total: talents.length,
      canDelete: editMode && talents.length === 0
    };
  }

  return {
    type: "overview",
    description: await enrich(pick(tree.intro, lang)),
    tiers: sortedTiers(tree).map(tier => ({
      label: tier.label,
      cost: tier.cost,
      unlockSpent: tier.unlockSpent,
      unlocked: progress.spent >= tier.unlockSpent
    })),
    owned: tree.talents.filter(x => progress.purchased.has(x.id))
      .map(x => ({ id: x.id, name: pick(x.name, lang), color: tree.branches.find(b => b.id === x.branch)?.color }))
  };
}

/** Draw prerequisite arrows as an SVG layer behind the nodes. */
function drawEdges() {
  const board = this.element?.querySelector(".sds-board");
  const svg = board?.querySelector("svg.sds-edges");
  if (!board || !svg || !this.tree) return;
  const origin = board.getBoundingClientRect();
  const rects = new Map();
  for (const el of board.querySelectorAll(".sds-node")) {
    const r = el.getBoundingClientRect();
    rects.set(el.dataset.id, {
      left: r.left - origin.left, top: r.top - origin.top,
      right: r.right - origin.left, bottom: r.bottom - origin.top
    });
  }
  const all = [...rects.values()];
  const owned = new Set((this._studioState?.purchased ?? []).map(p => p.id));
  const colors = new Map(this.tree.branches.map(b => [b.id, b.color]));
  const sel = this.selectedTalent;
  const paths = [];
  for (const talent of this.tree.talents) {
    const target = rects.get(talent.id);
    if (!target) continue;
    for (const pre of talent.prereqs ?? []) {
      const source = rects.get(pre);
      if (!source) continue;
      const d = routeEdge(source, target, all, { gapX: GAP_X, gapY: GAP_Y });
      const classes = ["sds-edge"];
      if (owned.has(pre)) classes.push("ready");
      if (owned.has(pre) && owned.has(talent.id)) classes.push("owned");
      if (sel && (sel === pre || sel === talent.id)) classes.push("focus");
      const color = colors.get(talent.branch) ?? "#aaa";
      paths.push(`<path class="${classes.join(" ")}" d="${d}" style="--edge-color:${color}" marker-end="url(#sds-arrow-${talent.branch})"/>`);
    }
  }
  const markers = this.tree.branches.map(b => `<marker id="sds-arrow-${b.id}" viewBox="0 0 10 10" refX="9" refY="5"`
    + ` markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${b.color}"/></marker>`);
  svg.setAttribute("width", board.scrollWidth);
  svg.setAttribute("height", board.scrollHeight);
  svg.innerHTML = `<defs>${markers.join("")}</defs>${paths.join("")}`;
}

function activateDragDrop(html) {
  html.querySelectorAll(".sds-node[draggable]").forEach(el => {
    el.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", el.dataset.id);
      event.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => el.classList.remove("dragging"));
  });
  html.querySelectorAll("[data-drop-slot]").forEach(el => {
    el.addEventListener("dragover", event => {
      event.preventDefault();
      el.classList.add("drop-hover");
    });
    el.addEventListener("dragleave", () => el.classList.remove("drop-hover"));
    el.addEventListener("drop", event => onDrop.call(this, event, el));
  });
}

async function onDrop(event, el) {
  event.preventDefault();
  el.classList.remove("drop-hover");
  const id = event.dataTransfer.getData("text/plain");
  if (!id || id === el.dataset.id) return;
  const tree = await getTree();
  moveTalent(tree, id, {
    branch: el.dataset.branch,
    tier: Number(el.dataset.tier),
    row: Number(el.dataset.r),
    col: Number(el.dataset.c)
  });
  await saveTree(tree);
}

async function onStateFieldChange(event) {
  if (!game.user.isGM) return;
  const input = event.currentTarget;
  const value = Math.trunc(Number(input.value) || 0);
  await updateStudio(group => {
    if (input.dataset.stateField === "spAdjustment") {
      group.spAdjustment = value;
      return;
    }
    // Popularita corrections are logged as a manual history entry so the total stays auditable.
    const delta = Math.max(0, value) - groupScore(group);
    if (!delta) return false;
    group.history = [...(group.history ?? []), {
      chapter: group.calendar?.chapter ?? 1, day: null, kind: "manual", gain: delta,
      headline: t("Notify.ManualCorrection"), at: Date.now()
    }];
  });
}

/* -------------------------------------------- */
/*  Actions: selection & view                   */
/* -------------------------------------------- */

function onSelectTalent(event, target) {
  const id = target.dataset.id;
  this.selectedTalent = this.selectedTalent === id ? null : id;
  this.selectedBranch = null;
  this.render();
}

function onSelectBranch(event, target) {
  const id = target.dataset.branch;
  this.selectedBranch = this.selectedBranch === id ? null : id;
  this.selectedTalent = null;
  this.render();
}

function onClearSelection() {
  this.selectedTalent = null;
  this.selectedBranch = null;
  this.render();
}

async function onSetLanguage(event, target) {
  await game.settings.set(MODULE_ID, "language", target.dataset.lang);
}

function onToggleEdit() {
  if (!game.user.isGM) return;
  this.editMode = !this.editMode;
  this.render();
}

/* -------------------------------------------- */
/*  Actions: purchasing (GM only)               */
/* -------------------------------------------- */

async function buy(id, { force = false } = {}) {
  if (!game.user.isGM) return;
  const tree = await getTree();
  const { state, group } = await getStudio();
  if (!group) {
    ui.notifications.warn(t("Notify.NoStudio"));
    return;
  }
  const progress = computeProgress(tree, state);
  const talent = tree.talents.find(x => x.id === id);
  if (!talent || progress.purchased.has(id)) return;
  const status = talentStatus(talent, tree, progress);
  if (!force && status.state !== "available") {
    ui.notifications.warn(t("Notify.CannotPurchase"));
    return;
  }
  const name = foundry.utils.escapeHTML(pick(talent.name));
  const condition = pick(talent.condition);
  let content = `<p>${t(force ? "Confirm.Grant" : "Confirm.Purchase", { name, cost: status.cost })}</p>`;
  if (condition) content += `<p class="sds-condition"><i class="fa-solid fa-circle-exclamation"></i> ${foundry.utils.escapeHTML(condition)}</p>`;
  if (progress.available - status.cost < 0) content += `<p class="sds-warning">${t("Confirm.NegativeSP")}</p>`;
  const ok = await DialogV2.confirm({ window: { title: t(force ? "Action.Grant" : "Action.Purchase") }, content });
  if (!ok) return;
  await updateStudio(g => {
    g.purchased = [...(g.purchased ?? []), { id, cost: status.cost, at: Date.now() }];
  });
}

function onPurchase(event, target) {
  return buy.call(this, target.dataset.id);
}

function onGrant(event, target) {
  return buy.call(this, target.dataset.id, { force: true });
}

async function onRefund(event, target) {
  if (!game.user.isGM) return;
  const id = target.dataset.id;
  const tree = await getTree();
  const { state } = await getStudio();
  const talent = tree.talents.find(x => x.id === id);
  const entry = state.purchased.find(p => p.id === id);
  if (!entry) return;
  const owned = new Set(state.purchased.map(p => p.id));
  const dependents = dependentsOf(tree, id).filter(d => owned.has(d))
    .map(d => pick(tree.talents.find(x => x.id === d)?.name) || d);
  let content = `<p>${t("Confirm.Refund", { name: foundry.utils.escapeHTML(pick(talent?.name) || id), cost: entry.cost })}</p>`;
  if (dependents.length) {
    content += `<p class="sds-warning">${t("Confirm.RefundDependents", { names: foundry.utils.escapeHTML(dependents.join(", ")) })}</p>`;
  }
  const ok = await DialogV2.confirm({ window: { title: t("Action.Refund") }, content });
  if (!ok) return;
  await updateStudio(g => {
    g.purchased = (g.purchased ?? []).filter(p => p.id !== id);
  });
}

/* -------------------------------------------- */
/*  Actions: editing talents (GM only)          */
/* -------------------------------------------- */

function onEditTalent(event, target) {
  new TalentEditor({ talentId: target.dataset.id }).render({ force: true });
}

async function onAddTalent(event, target) {
  const tree = await getTree();
  const branch = tree.branches.find(b => b.id === target.dataset.branch);
  const tier = Number(target.dataset.tier);
  new TalentEditor({
    talentId: null,
    draft: {
      id: suggestTalentId(tree, branch, tier),
      branch: branch.id,
      tier,
      row: Number(target.dataset.r),
      col: Number(target.dataset.c),
      name: { cs: "", en: "" },
      description: { cs: "", en: "" },
      condition: { cs: "", en: "" },
      prereqs: []
    },
    onCreate: id => {
      this.selectedTalent = id;
      this.selectedBranch = null;
    }
  }).render({ force: true });
}

async function onDeleteTalent(event, target) {
  const id = target.dataset.id;
  const tree = await getTree();
  const rivals = await getRivals();
  if (rivals.groups.some(g => (g.purchased ?? []).some(p => p.id === id))) {
    ui.notifications.warn(t("Notify.RefundBeforeDelete"));
    return;
  }
  const talent = tree.talents.find(x => x.id === id);
  const ok = await DialogV2.confirm({
    window: { title: t("Action.Delete") },
    content: `<p>${t("Confirm.DeleteTalent", { name: foundry.utils.escapeHTML(pick(talent?.name) || id) })}</p>`
  });
  if (!ok) return;
  tree.talents = tree.talents.filter(x => x.id !== id);
  for (const x of tree.talents) x.prereqs = (x.prereqs ?? []).filter(p => p !== id);
  this.selectedTalent = null;
  await saveTree(tree);
}

/* -------------------------------------------- */
/*  Actions: branches, tiers, intro (GM only)   */
/* -------------------------------------------- */

async function onEditBranch(event, target) {
  const tree = await getTree();
  const branch = tree.branches.find(b => b.id === target.dataset.branch);
  if (!branch) return;
  const data = await branchDialog(branch);
  if (!data) return;
  Object.assign(branch, data);
  await saveTree(tree);
}

async function onAddBranch() {
  const tree = await getTree();
  const id = foundry.utils.randomID(8);
  const draft = {
    id, prefix: "X", color: "#c9a14a",
    name: { cs: "Nová větev", en: "New branch" },
    description: { cs: "", en: "" }
  };
  const data = await branchDialog(draft);
  if (!data) return;
  tree.branches.push(Object.assign(draft, data));
  await saveTree(tree);
}

async function onMoveBranch(event, target) {
  const tree = await getTree();
  const i = tree.branches.findIndex(b => b.id === target.dataset.branch);
  const j = i + Number(target.dataset.dir);
  if (i < 0 || j < 0 || j >= tree.branches.length) return;
  [tree.branches[i], tree.branches[j]] = [tree.branches[j], tree.branches[i]];
  await saveTree(tree);
}

async function onDeleteBranch(event, target) {
  const tree = await getTree();
  const id = target.dataset.branch;
  if (tree.talents.some(x => x.branch === id)) {
    ui.notifications.warn(t("Notify.BranchNotEmpty"));
    return;
  }
  const ok = await DialogV2.confirm({ window: { title: t("Action.Delete") }, content: `<p>${t("Confirm.DeleteBranch")}</p>` });
  if (!ok) return;
  tree.branches = tree.branches.filter(b => b.id !== id);
  this.selectedBranch = null;
  await saveTree(tree);
}

async function onEditTier(event, target) {
  const tree = await getTree();
  const tier = getTier(tree, Number(target.dataset.tier));
  if (!tier) return;
  const data = await tierDialog(tier, tree.talents.some(x => x.tier === tier.id));
  if (!data) return;
  if (data.delete) {
    tree.tiers = tree.tiers.filter(x => x.id !== tier.id);
  } else {
    Object.assign(tier, data);
  }
  await saveTree(tree);
}

async function onAddTier() {
  const tree = await getTree();
  const last = sortedTiers(tree).at(-1);
  const id = Math.max(0, ...tree.tiers.map(x => x.id)) + 1;
  const draft = {
    id,
    label: toRoman(id),
    cost: (last?.cost ?? 0) + 1,
    unlockSpent: (last?.unlockSpent ?? 0) + 8
  };
  const data = await tierDialog(draft, false, true);
  if (!data) return;
  tree.tiers.push(Object.assign(draft, data));
  await saveTree(tree);
}

async function onEditIntro() {
  const tree = await getTree();
  const data = await bilingualTextDialog(t("Edit.Intro"), tree.intro ?? {});
  if (!data) return;
  tree.intro = data;
  await saveTree(tree);
}

/* -------------------------------------------- */
/*  Actions: import / export / reset            */
/* -------------------------------------------- */

async function onExportTree() {
  const tree = await getTree();
  const payload = { module: MODULE_ID, exported: new Date().toISOString(), tree };
  const save = foundry.utils.saveDataToFile ?? globalThis.saveDataToFile;
  save(JSON.stringify(payload, null, 2), "application/json",
    `${MODULE_ID}-${new Date().toISOString().slice(0, 10)}.json`);
}

async function onImportTree() {
  const content = `<div class="form-group"><label>${t("Import.File")}</label>`
    + `<input type="file" name="file" accept=".json,application/json"></div>`
    + `<p class="hint">${t("Import.Hint")}</p>`;
  let file = null;
  const result = await DialogV2.wait({
    window: { title: t("Action.Import") },
    content,
    buttons: [{
      action: "import",
      label: t("Action.Import"),
      default: true,
      callback: (ev, button) => {
        file = button.form.elements.file.files[0];
        return "import";
      }
    }, { action: "cancel", label: t("Action.Cancel") }]
  });
  if (result !== "import" || !file) return;
  try {
    const data = JSON.parse(await file.text());
    const tree = data.tree ?? data;
    if (!isValidTree(tree)) throw new Error("Invalid tree");
    await saveTree(tree);
    ui.notifications.info(t("Notify.Imported"));
  } catch (err) {
    console.error(`${MODULE_ID} | Import failed`, err);
    ui.notifications.error(t("Notify.ImportFailed"));
  }
}

async function onResetTree() {
  const ok = await DialogV2.confirm({ window: { title: t("Action.Reset") }, content: `<p>${t("Confirm.Reset")}</p>` });
  if (!ok) return;
  await saveTree(await loadDefaultTree());
}

export const treeActions = {
  selectTalent: onSelectTalent,
  selectBranch: onSelectBranch,
  clearSelection: onClearSelection,
  setLanguage: onSetLanguage,
  toggleEdit: onToggleEdit,
  purchase: onPurchase,
  grant: onGrant,
  refund: onRefund,
  editTalent: onEditTalent,
  addTalent: onAddTalent,
  deleteTalent: onDeleteTalent,
  editBranch: onEditBranch,
  addBranch: onAddBranch,
  moveBranch: onMoveBranch,
  deleteBranch: onDeleteBranch,
  editTier: onEditTier,
  addTier: onAddTier,
  editIntro: onEditIntro,
  exportTree: onExportTree,
  importTree: onImportTree,
  resetTree: onResetTree
};

/* -------------------------------------------- */
/*  Small form dialogs                          */
/* -------------------------------------------- */

function dialogLabels() {
  return { save: t("Action.Save"), cancel: t("Action.Cancel") };
}

function esc(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

async function branchDialog(branch) {
  const content = `
    <div class="form-group"><label>${t("Edit.NameCs")}</label><input type="text" name="name.cs" value="${esc(branch.name?.cs)}" required></div>
    <div class="form-group"><label>${t("Edit.NameEn")}</label><input type="text" name="name.en" value="${esc(branch.name?.en)}"></div>
    <div class="form-group"><label>${t("Edit.Prefix")}</label><input type="text" name="prefix" value="${esc(branch.prefix)}" maxlength="3"></div>
    <div class="form-group"><label>${t("Edit.Color")}</label><input type="color" name="color" value="${esc(branch.color)}"></div>
    <div class="form-group stacked"><label>${t("Edit.DescriptionCs")}</label><div data-prose-name="description.cs" data-height="180"></div></div>
    <div class="form-group stacked"><label>${t("Edit.DescriptionEn")}</label><div data-prose-name="description.en" data-height="180"></div></div>`;
  const expanded = await formDialog({
    title: t("Edit.Branch"), content, width: 640, labels: dialogLabels(), values: { description: branch.description ?? {} }
  });
  if (!expanded) return null;
  return {
    name: { cs: expanded.name?.cs ?? "", en: expanded.name?.en ?? "" },
    description: { cs: expanded.description?.cs ?? "", en: expanded.description?.en ?? "" },
    prefix: (expanded.prefix || "X").toUpperCase(),
    color: expanded.color || "#c9a14a"
  };
}

async function tierDialog(tier, hasTalents, isNew = false) {
  const content = `
    <div class="form-group"><label>${t("Edit.TierLabel")}</label><input type="text" name="label" value="${esc(tier.label)}" required></div>
    <div class="form-group"><label>${t("Edit.TierCost")}</label><input type="number" name="cost" min="0" step="1" value="${Number(tier.cost)}"></div>
    <div class="form-group"><label>${t("Edit.TierUnlock")}</label><input type="number" name="unlockSpent" min="0" step="1" value="${Number(tier.unlockSpent)}"></div>
    <p class="hint">${t("Edit.TierHint")}</p>`;
  const buttons = [{
    action: "save", label: t("Action.Save"), default: true,
    callback: (ev, button) => readForm(button.form)
  }];
  if (!isNew && !hasTalents) buttons.push({ action: "delete", label: t("Action.Delete"), icon: "fa-solid fa-trash" });
  buttons.push({ action: "cancel", label: t("Action.Cancel") });
  const result = await DialogV2.wait({ window: { title: t("Edit.Tier") }, content, buttons });
  if (!result || result === "cancel") return null;
  if (result === "delete") return { delete: true };
  return {
    label: String(result.label || tier.label),
    cost: Math.max(0, Math.trunc(Number(result.cost) || 0)),
    unlockSpent: Math.max(0, Math.trunc(Number(result.unlockSpent) || 0))
  };
}

async function bilingualTextDialog(title, field) {
  const content = `
    <div class="form-group stacked"><label>Čeština</label><div data-prose-name="cs" data-height="260"></div></div>
    <div class="form-group stacked"><label>English</label><div data-prose-name="en" data-height="260"></div></div>`;
  const data = await formDialog({ title, content, width: 760, labels: dialogLabels(), values: field });
  if (!data) return null;
  return { cs: data.cs ?? "", en: data.en ?? "" };
}

function toRoman(n) {
  const map = [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, s] of map) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}
