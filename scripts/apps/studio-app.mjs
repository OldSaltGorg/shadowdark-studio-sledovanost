import { APP_ID, MODULE_ID } from "../constants.mjs";
import { currentLanguage, labels, loadDictionaries, t } from "../i18n.mjs";
import { computeProgress } from "../progression.mjs";
import { getStudio, getTree } from "../store.mjs";
import { DEFAULT_CALENDAR } from "../rewards.mjs";
import { playerGroups } from "../rivals.mjs";
import { prepareTree, renderTree, treeActions } from "../tabs/tree.mjs";
import { prepareRewards, renderRewards, rewardsActions } from "../tabs/rewards.mjs";
import { boardActions, prepareBoard, renderBoard } from "../tabs/board.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const TABS = [
  { id: "rewards", icon: "fa-solid fa-star" },
  { id: "tree", icon: "fa-solid fa-diagram-project" },
  { id: "board", icon: "fa-solid fa-ranking-star" }
];

/** The studio window: shared progress header plus three tabs. */
export class StudioApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: APP_ID,
    classes: ["sdstudio"],
    tag: "section",
    window: { icon: "fa-solid fa-feather-pointed", resizable: true },
    position: { width: 1360, height: 860 },
    actions: {
      sdsTab: StudioApp.#onTab,
      ...treeActions,
      ...rewardsActions,
      ...boardActions
    }
  };

  static PARTS = {
    header: { template: `modules/${MODULE_ID}/templates/studio-header.hbs` },
    rewards: { template: `modules/${MODULE_ID}/templates/tab-rewards.hbs`, scrollable: [".sds-rw-main", ".sds-rw-side"] },
    tree: { template: `modules/${MODULE_ID}/templates/tab-tree.hbs`, scrollable: [".sds-board-scroll", ".sds-detail"] },
    board: { template: `modules/${MODULE_ID}/templates/tab-board.hbs`, scrollable: [".sds-lb-scroll"] }
  };

  activeTab = "rewards";
  tree = null;
  editMode = false;
  selectedTalent = null;
  selectedBranch = null;
  _resizeObserver = null;

  constructor(options = {}) {
    const position = {
      width: Math.min(1560, window.innerWidth - 60),
      height: Math.min(920, window.innerHeight - 60)
    };
    super(foundry.utils.mergeObject({ position }, options, { inplace: false }));
  }

  get title() {
    return t("Title");
  }

  async _prepareContext(options) {
    await loadDictionaries();
    const context = await super._prepareContext(options);
    const lang = currentLanguage();
    const L = labels(lang);
    const isGM = game.user.isGM;
    const tree = this.tree = await getTree();
    const { rivals, group, state } = await getStudio();
    const progress = computeProgress(tree, state);
    const players = playerGroups(rivals.groups);
    const span = Math.max(1, progress.nextMilestone - progress.prevMilestone);
    const toNext = Math.min(100, Math.max(0, Math.round(((progress.popularity - progress.prevMilestone) / span) * 100)));
    const calendar = { ...DEFAULT_CALENDAR, ...(group?.calendar ?? {}) };

    Object.assign(context, {
      L, lang, isGM,
      activeTab: this.activeTab,
      tabs: TABS.map(x => ({ ...x, label: L.Tabs[x.id], active: x.id === this.activeTab })),
      langs: [{ id: "cs", label: "CZ", active: lang === "cs" }, { id: "en", label: "EN", active: lang === "en" }],
      progress: {
        ...progress,
        toNext,
        availableNegative: progress.available < 0,
        nextMilestoneText: t("Header.NextMilestone", { score: progress.nextMilestone, sp: progress.spPerMilestone }, lang),
        toGo: progress.nextMilestone - progress.popularity
      },
      calendarLabel: t("Rewards.Calendar", calendar, lang),
      studio: group ? { id: group.id, name: group.name, many: players.length > 1 } : null
    });

    const base = { lang, L, isGM, tree, state, progress, rivals, group, players };
    if (this.activeTab === "tree") Object.assign(context, await prepareTree.call(this, base));
    else if (this.activeTab === "rewards") context.rw = await prepareRewards.call(this, base);
    else if (this.activeTab === "board") context.lb = await prepareBoard.call(this, base);
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.activeTab !== "tree") {
      this._resizeObserver?.disconnect();
      this._resizeObserver = null;
    }
    if (this.activeTab === "tree") renderTree.call(this);
    else if (this.activeTab === "rewards") renderRewards.call(this);
    else if (this.activeTab === "board") renderBoard.call(this);
  }

  _onClose(options) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    super._onClose(options);
  }

  static #onTab(event, target) {
    this.activeTab = target.dataset.sdsTab;
    this.render();
  }
}
