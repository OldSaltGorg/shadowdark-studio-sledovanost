import { APP_ID, DEFAULT_STATE, MODULE_ID, MODULE_PATH, SETTINGS } from "./constants.mjs";
import { resolveActiveGroup, studioState } from "./rivals.mjs";

let defaultTree = null;
let defaultRivals = null;

export async function loadDefaultRivals() {
  if (!defaultRivals) {
    const response = await fetch(foundry.utils.getRoute(`${MODULE_PATH}/data/default-rivals.json`));
    defaultRivals = await response.json();
  }
  return foundry.utils.deepClone(defaultRivals);
}

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
  game.settings.register(MODULE_ID, SETTINGS.ACTIVE_GROUP, {
    scope: "world",
    config: false,
    type: String,
    default: "",
    onChange: refreshApp
  });
  game.settings.register(MODULE_ID, SETTINGS.SESSION, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: refreshApp
  });
  game.settings.register(MODULE_ID, SETTINGS.RIVALS, {
    scope: "world",
    config: false,
    type: Object,
    default: {},
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

/** Legacy v0.1 single-studio state; only read for migration. */
function getLegacyState() {
  return foundry.utils.mergeObject(foundry.utils.deepClone(DEFAULT_STATE),
    foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.STATE) ?? {}), { inplace: false });
}

export async function saveTree(tree) {
  if (!game.user.isGM) throw new Error("Only the GM can change the studio tree.");
  if (!isValidTree(tree)) throw new Error("Invalid tree data.");
  await game.settings.set(MODULE_ID, SETTINGS.TREE, tree);
}

/** Persist the bundled defaults on first GM login so edits have a stable base. */
export async function ensureTreeInitialized() {
  if (!game.users.activeGM?.isSelf) return;
  const stored = game.settings.get(MODULE_ID, SETTINGS.TREE);
  if (!isValidTree(stored)) await saveTree(await loadDefaultTree());
  let rivals = game.settings.get(MODULE_ID, SETTINGS.RIVALS);
  if (!isValidRivals(rivals)) {
    rivals = await loadDefaultRivals();
    await saveRivals(rivals);
  }
  await migrateLegacyState(rivals);
}

/**
 * v0.1 kept one studio's Popularita and purchases in the `state` setting. Move them
 * onto the top player studio once, so existing worlds keep their progress.
 */
async function migrateLegacyState(rivals) {
  const legacy = getLegacyState();
  if (legacy.migrated) return;
  const hasData = legacy.popularity > 0 || legacy.purchased.length || legacy.spAdjustment;
  const group = resolveActiveGroup(rivals.groups, "");
  if (hasData && group) {
    const gains = (group.history ?? []).reduce((sum, h) => sum + (Number(h.gain) || 0), 0);
    group.startScore = Math.max(0, Number(legacy.popularity) || 0) - gains;
    group.purchased = foundry.utils.deepClone(legacy.purchased);
    group.spAdjustment = Number(legacy.spAdjustment) || 0;
    await saveRivals(rivals);
    console.log(`${MODULE_ID} | Migrated studio progress to ${group.name}`);
  }
  await game.settings.set(MODULE_ID, SETTINGS.STATE, { ...legacy, migrated: true });
}

function isValidRivals(data) {
  return Array.isArray(data?.groups);
}

export async function getRivals() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.RIVALS);
  if (isValidRivals(stored)) return foundry.utils.deepClone(stored);
  return loadDefaultRivals();
}

export async function saveRivals(data) {
  if (!game.user.isGM) throw new Error("Only the GM can change the leaderboard.");
  if (!isValidRivals(data)) throw new Error("Invalid leaderboard data.");
  await game.settings.set(MODULE_ID, SETTINGS.RIVALS, data);
}

export function getActiveGroupId() {
  return game.settings.get(MODULE_ID, SETTINGS.ACTIVE_GROUP) ?? "";
}

export async function setActiveGroupId(id) {
  if (!game.user.isGM) throw new Error("Only the GM can switch studios.");
  await game.settings.set(MODULE_ID, SETTINGS.ACTIVE_GROUP, id ?? "");
}

/**
 * The player studio the window works with, plus its upgrade-tree state.
 * @returns {Promise<{rivals: object, group: object|null, state: object}>}
 */
export async function getStudio() {
  const rivals = await getRivals();
  const group = resolveActiveGroup(rivals.groups, getActiveGroupId());
  return { rivals, group, state: studioState(group) };
}

/** Mutate the active player studio and save. `fn(group, rivals)` may return false to skip saving. */
export async function updateStudio(fn) {
  const { rivals, group } = await getStudio();
  if (!group) {
    ui.notifications.warn(game.i18n.localize("SDSTUDIO.Notify.NoStudio"));
    return null;
  }
  if (await fn(group, rivals) === false) return group;
  await saveRivals(rivals);
  return group;
}

export function getSession() {
  const stored = game.settings.get(MODULE_ID, SETTINGS.SESSION);
  return stored?.active ? foundry.utils.deepClone(stored) : null;
}

export async function saveSession(session) {
  if (!game.user.isGM) throw new Error("Only the GM can run the reward session.");
  await game.settings.set(MODULE_ID, SETTINGS.SESSION, session ?? {});
}

export { isValidTree, isValidRivals };
