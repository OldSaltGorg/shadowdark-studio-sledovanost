import { APP_ID, MODULE_ID } from "./constants.mjs";
import { loadDictionaries } from "./i18n.mjs";
import * as progression from "./progression.mjs";
import { ensureTreeInitialized, getRivals, getStudio, getTree, registerSettings } from "./store.mjs";
import { StudioApp } from "./apps/studio-app.mjs";

function openStudio() {
  const existing = foundry.applications.instances.get(APP_ID);
  if (existing) {
    existing.bringToFront?.();
    return existing.render({ force: true });
  }
  return new StudioApp().render({ force: true });
}

function toggleStudio() {
  const existing = foundry.applications.instances.get(APP_ID);
  if (existing?.rendered) return existing.close();
  return openStudio();
}

Hooks.once("init", () => {
  registerSettings();
  game.modules.get(MODULE_ID).api = { open: openStudio, toggle: toggleStudio, getTree, getStudio, getRivals, progression };
});

Hooks.once("ready", async () => {
  await loadDictionaries();
  try {
    await ensureTreeInitialized();
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to initialise the studio tree`, err);
  }
});

Hooks.on("getSceneControlButtons", controls => {
  const tokens = controls.tokens;
  if (!tokens) return;
  tokens.tools.sdstudioTree = {
    name: "sdstudioTree",
    title: "SDSTUDIO.Control",
    icon: "fa-solid fa-diagram-project",
    order: Object.keys(tokens.tools).length,
    button: true,
    visible: true,
    onChange: () => toggleStudio()
  };
});

Hooks.on("renderJournalDirectory", (app, html) => {
  const root = html instanceof HTMLElement ? html : html?.[0];
  const actions = root?.querySelector(".header-actions");
  if (!actions || actions.querySelector(".sdstudio-open")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("sdstudio-open");
  button.innerHTML = `<i class="fa-solid fa-diagram-project"></i> <span>${game.i18n.localize("SDSTUDIO.Control")}</span>`;
  button.addEventListener("click", () => openStudio());
  actions.append(button);
});
