import { APP_ID, DEFAULT_STATE, MODULE_ID, MODULE_PATH, SETTINGS } from "./constants.mjs";

let defaultTree = null;

export async function loadDefaultTree() {
  if (defaultTree) return foundry.utils.deepClone(defaultTree);
  const response = await fetch(foundry.utils.getRoute(`${MODULE_PATH}/data/default-tree.json`));
  defaultTree = await response.json();
  return foundry.utils.deepClone(defaultTree);
}

function refreshApp() {
  foundry.applications.instances.get(APP_ID)?.render();
}

export function registerSettings() {
  game.settings.register(MODULE_ID, SETTINGS.TREE, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: refreshApp
  });
  game.settings.register(MODULE_ID, SETTINGS.STATE, {
    scope: "world",
    config: false,
    type: Object,
    default: foundry.utils.deepClone(DEFAULT_STATE),
    onChange: refreshApp
  });
  game.settings.register(MODULE_ID, SETTINGS.LANGUAGE, {
    name: "SDSTUDIO.Settings.Language.Name",
    hint: "SDSTUDIO.Settings.Language.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: {
      auto: "SDSTUDIO.Settings.Language.Auto",
      cs: "Čeština",
      en: "English"
    },
    default: "auto",
    onChange: refreshApp
  });
}

function isValidTree(tree) {
  return Array.isArray(tree?.talents) && Array.isArray(tree?.branches) && Array.isArray(tree?.tiers);
}

/** The stored tree, or the bundled default when nothing has been saved yet. */
export async function getTree() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.TREE);
  if (isValidTree(stored)) return foundry.utils.deepClone(stored);
  return loadDefaultTree();
}

export function getState() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.STATE) ?? {};
  return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STATE), foundry.utils.deepClone(stored), {
    inplace: false
  });
}

export async function saveTree(tree) {
  if (!game.user.isGM) throw new Error("Only the GM can change the studio tree.");
  if (!isValidTree(tree)) throw new Error("Invalid tree data.");
  await game.settings.set(MODULE_ID, SETTINGS.TREE, tree);
}

export async function saveState(state) {
  if (!game.user.isGM) throw new Error("Only the GM can change studio progress.");
  await game.settings.set(MODULE_ID, SETTINGS.STATE, state);
}

/** Persist the bundled default on first GM login so edits have a stable base. */
export async function ensureTreeInitialized() {
  if (!game.users.activeGM?.isSelf) return;
  const stored = game.settings.get(MODULE_ID, SETTINGS.TREE);
  if (isValidTree(stored)) return;
  await saveTree(await loadDefaultTree());
}

export { isValidTree };
