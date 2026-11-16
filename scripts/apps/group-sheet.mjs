import { MODULE_ID } from "../constants.mjs";
import { readForm } from "../forms.mjs";
import { currentLanguage, labels, loadDictionaries, pick, t } from "../i18n.mjs";
import { generateMember, typicalLevel } from "../generator.mjs";
import { groupScore, groupSP, latestChapter, PROFILES } from "../rivals.mjs";
import { getRivals, getTree, saveRivals } from "../store.mjs";
import { dateLabel } from "../tabs/common.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

const STAT_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

function byIndex(obj) {
  return Object.keys(obj ?? {}).map(Number).sort((a, b) => a - b).map(i => [i, obj[i]]);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** GM-only editor for one leaderboard group (rival or player studio). */
export class GroupSheet extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sdstudio-group", "sdstudio-dialog"],
    tag: "form",
    window: { icon: "fa-solid fa-people-group", resizable: true },
    position: { width: 980, height: 820 },
    form: { handler: GroupSheet.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: {
      addMember: GroupSheet.#onAddMember,
      removeMember: GroupSheet.#onRemoveMember,
      addHistory: GroupSheet.#onAddHistory,
      removeHistory: GroupSheet.#onRemoveHistory,
      deleteGroup: GroupSheet.#onDeleteGroup,
      cancel: GroupSheet.#onCancel
    }
  };

  static PARTS = {
    form: { template: `modules/${MODULE_ID}/templates/group-sheet.hbs`, scrollable: [".sds-group-body"] }
  };

  constructor(options = {}) {
    super({ id: `sdstudio-group-${options.groupId}`, ...options });
    this.groupId = options.groupId;
    this.draft = null;
  }

  get title() {
    return this.draft?.name ? `${t("Board.Group")}: ${this.draft.name}` : t("Board.Group");
  }

  async _prepareContext(options) {
    await loadDictionaries();
    const context = await super._prepareContext(options);
    const lang = currentLanguage();
    const rivals = await getRivals();
    if (!this.draft) {
      this.draft = foundry.utils.deepClone(rivals.groups.find(g => g.id === this.groupId) ?? null);
      this.allGroups = rivals.groups;
    }
    const g = this.draft;
    if (!g) return Object.assign(context, { missing: true, L: labels(lang) });
    const tree = await getTree();
    const score = groupScore(g);
    const owned = new Set(g.isPlayer ? (g.purchased ?? []).map(p => p.id) : g.upgrades ?? []);
    return Object.assign(context, {
      L: labels(lang),
      g,
      score,
      sp: groupSP(g, tree, score, tree.rules?.spPerMilestone ?? 2),
      profiles: PROFILES.map(p => ({ ...p, label: t(`Board.Profile.${p.key}`), selected: p.value === Number(g.profile) })),
      statuses: ["active", "cancelled"].map(s => ({ value: s, label: t(`Board.Status.${s}`), selected: g.status === s })),
      statKeys: STAT_KEYS.map(k => ({ key: k, label: k.toUpperCase() })),
      members: (g.members ?? []).map((m, i) => ({
        ...m, index: i, statList: STAT_KEYS.map(k => ({ key: k, value: m.stats?.[k] ?? 10 }))
      })),
      history: (g.history ?? []).map((h, i) => ({
        ...h, index: i, label: dateLabel(h, lang), rollText: h.roll ? `d6 ${h.roll}` : "—"
      })).reverse(),
      branches: tree.branches.map(b => ({
        name: pick(b.name, lang),
        color: b.color,
        talents: tree.talents.filter(x => x.branch === b.id)
          .sort((a, c) => a.tier - c.tier || a.row - c.row || a.col - c.col)
          .map(x => ({ id: x.id, name: pick(x.name, lang), tier: x.tier, checked: owned.has(x.id) }))
      })),
      playerUpgrades: g.isPlayer ? (g.purchased ?? []).map(p => ({
        id: p.id, cost: p.cost, name: pick(tree.talents.find(x => x.id === p.id)?.name, lang) || p.id
      })) : null
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const title = this.element.querySelector(".window-title");
    if (title) title.textContent = this.title;
  }

  /** Copy current form values into the draft before structural edits re-render the form. */
  #sync() {
    const form = this.element;
    if (!form || !this.draft) return;
    const data = readForm(form);
    const g = this.draft;
    for (const key of ["name", "face", "reputation", "goal", "weakness", "relationship", "episodes", "notes", "status"]) {
      if (key in data) g[key] = data[key];
    }
    g.isPlayer = !!data.isPlayer;
    g.profile = num(data.profile, g.profile);
    g.cap = Math.max(0, num(data.cap, 10));
    g.authors = Math.max(1, num(data.authors, 5));
    g.startScore = num(data.startScore, 0);
    g.members = byIndex(data.members).map(([i, m]) => ({
      ...(g.members[i] ?? {}),
      name: m.name ?? "",
      ancestry: m.ancestry ?? "",
      class: m.class ?? "",
      level: Math.max(0, num(m.level, 1)),
      hp: Math.max(0, num(m.hp, 1)),
      ac: num(m.ac, 10),
      gear: m.gear ?? "",
      stats: Object.fromEntries(STAT_KEYS.map(k => [k, num(m.stats?.[k], 10)]))
    }));
    for (const [i, h] of byIndex(data.history)) {
      if (!g.history[i]) continue;
      g.history[i].gain = num(h.gain, 0);
      g.history[i].headline = h.headline ?? "";
    }
    if (!g.isPlayer) g.upgrades = Object.entries(data.upgrades ?? {}).filter(([, v]) => v).map(([k]) => k);
  }

  static #onAddMember() {
    this.#sync();
    const usedNames = new Set(this.draft.members.map(m => m.name));
    this.draft.members.push(generateMember({ level: typicalLevel([this.draft]), usedNames }));
    this.render();
  }

  static #onRemoveMember(event, target) {
    this.#sync();
    this.draft.members.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onAddHistory() {
    this.#sync();
    this.draft.history.push({ chapter: (this.draft.history.at(-1)?.chapter ?? 1), day: null, kind: "manual",
      gain: 0, headline: "", at: Date.now() });
    this.render();
  }

  static #onRemoveHistory(event, target) {
    this.#sync();
    this.draft.history.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static async #onDeleteGroup() {
    const ok = await DialogV2.confirm({
      window: { title: t("Board.Delete") },
      content: `<p>${t("Board.DeleteConfirm", { name: foundry.utils.escapeHTML(this.draft.name) })}</p>`
    });
    if (!ok) return;
    const rivals = await getRivals();
    rivals.groups = rivals.groups.filter(g => g.id !== this.groupId);
    await saveRivals(rivals);
    this.close();
  }

  static #onCancel() {
    this.close();
  }

  static async #onSubmit() {
    this.#sync();
    const rivals = await getRivals();
    const g = this.draft;
    if (!g.name?.trim()) {
      ui.notifications.error(t("Board.NameRequired"));
      throw new Error("Name required");
    }
    delete g.generated;
    if (g.isPlayer) {
      g.calendar ??= { chapter: latestChapter(rivals.groups), day: 0 };
      g.purchased ??= [];
      g.authorRecords ??= {};
    }
    rivals.groups = rivals.groups.map(x => (x.id === g.id ? g : x));
    if (!rivals.groups.some(x => x.id === g.id)) rivals.groups.push(g);
    await saveRivals(rivals);
  }
}
