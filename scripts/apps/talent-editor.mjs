import { MODULE_ID } from "../constants.mjs";
import { mountEditors, readForm } from "../forms.mjs";
import { currentLanguage, labels, loadDictionaries, pick, t } from "../i18n.mjs";
import { createsCycle, renameTalentId, sortedTiers } from "../progression.mjs";
import { getRivals, getTree, saveRivals, saveTree } from "../store.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** GM form for creating or editing one talent, with both language variants side by side. */
export class TalentEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sdstudio-editor", "sdstudio-dialog"],
    tag: "form",
    window: { icon: "fa-solid fa-pen-to-square", resizable: true },
    position: { width: 820, height: 760 },
    form: {
      handler: TalentEditor.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      cancel: TalentEditor.#onCancel
    }
  };

  static PARTS = {
    form: {
      template: `modules/${MODULE_ID}/templates/talent-editor.hbs`,
      scrollable: [".sds-editor-body"]
    }
  };

  constructor(options = {}) {
    super(options);
    this.talentId = options.talentId ?? null;
    this.draft = options.draft ?? null;
    this.onCreate = options.onCreate ?? null;
  }

  get title() {
    return this.talentId ? t("Edit.Talent", { id: this.talentId }) : t("Edit.NewTalent");
  }

  async _prepareContext(options) {
    await loadDictionaries();
    const context = await super._prepareContext(options);
    const lang = currentLanguage();
    const tree = await getTree();
    const talent = this.talentId
      ? foundry.utils.deepClone(tree.talents.find(x => x.id === this.talentId))
      : foundry.utils.deepClone(this.draft);
    const prereqSet = new Set(talent.prereqs ?? []);
    const tiers = sortedTiers(tree);
    const tierLabel = new Map(tiers.map(x => [x.id, x.label]));
    const groups = tree.branches.map(branch => ({
      name: pick(branch.name, lang),
      color: branch.color,
      options: tree.talents
        .filter(x => x.branch === branch.id && x.id !== this.talentId)
        .sort((a, b) => a.tier - b.tier || a.row - b.row || a.col - b.col)
        .map(x => ({
          id: x.id,
          name: pick(x.name, lang),
          tier: tierLabel.get(x.tier) ?? "?",
          checked: prereqSet.has(x.id)
        }))
    })).filter(g => g.options.length);

    this._talentValues = talent;
    return Object.assign(context, {
      L: labels(lang),
      talent,
      isNew: !this.talentId,
      branches: tree.branches.map(b => ({ id: b.id, name: pick(b.name, lang), selected: b.id === talent.branch })),
      tiers: tiers.map(x => ({ id: x.id, label: `${x.label} (${t("Tier.Cost", { cost: x.cost }, lang)})`, selected: x.id === talent.tier })),
      groups
    });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    mountEditors(this.element, this._talentValues);
  }

  static #onCancel() {
    this.close();
  }

  static async #onSubmit(event, form) {
    const data = readForm(form);
    const tree = await getTree();
    const rivals = await getRivals();
    const newId = String(data.id ?? "").trim();
    if (!newId || !/^[\w-]+$/.test(newId)) {
      ui.notifications.error(t("Notify.InvalidId"));
      throw new Error("Invalid talent ID");
    }
    if (newId !== this.talentId && tree.talents.some(x => x.id === newId)) {
      ui.notifications.error(t("Notify.DuplicateId", { id: newId }));
      throw new Error("Duplicate talent ID");
    }
    const prereqs = Object.entries(data.prereq ?? {}).filter(([, v]) => v).map(([k]) => k);
    const checkId = this.talentId ?? newId;
    if (createsCycle(tree, checkId, prereqs)) {
      ui.notifications.error(t("Notify.Cycle"));
      throw new Error("Prerequisite cycle");
    }

    const fields = {
      branch: data.branch,
      tier: Number(data.tier),
      row: Math.max(0, Math.trunc(Number(data.row) || 0)),
      col: Math.max(0, Math.trunc(Number(data.col) || 0)),
      name: { cs: data.name?.cs ?? "", en: data.name?.en ?? "" },
      description: { cs: data.description?.cs ?? "", en: data.description?.en ?? "" },
      condition: { cs: data.condition?.cs ?? "", en: data.condition?.en ?? "" },
      prereqs
    };
    if (!fields.name.cs && !fields.name.en) {
      ui.notifications.error(t("Notify.NameRequired"));
      throw new Error("Name required");
    }

    const occupied = tree.talents.find(x => x.id !== this.talentId && x.branch === fields.branch
      && x.tier === fields.tier && x.row === fields.row && x.col === fields.col);
    if (occupied) {
      // Push the new/edited talent to the next free column in that row.
      const used = new Set(tree.talents.filter(x => x.id !== this.talentId && x.branch === fields.branch
        && x.tier === fields.tier && x.row === fields.row).map(x => x.col));
      while (used.has(fields.col)) fields.col++;
    }

    if (this.talentId) {
      const talent = tree.talents.find(x => x.id === this.talentId);
      Object.assign(talent, fields);
      if (newId !== this.talentId) {
        renameTalentId(tree, { purchased: [] }, this.talentId, newId);
        let touched = false;
        for (const g of rivals.groups) {
          for (const p of g.purchased ?? []) if (p.id === this.talentId) {
            p.id = newId;
            touched = true;
          }
          if (g.upgrades?.includes(this.talentId)) {
            g.upgrades = g.upgrades.map(u => (u === this.talentId ? newId : u));
            touched = true;
          }
        }
        if (touched) await saveRivals(rivals);
      }
    } else {
      tree.talents.push({ id: newId, ...fields });
      this.onCreate?.(newId);
    }
    await saveTree(tree);
  }
}
