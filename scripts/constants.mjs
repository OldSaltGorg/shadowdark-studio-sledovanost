export const MODULE_ID = "shadowdark-studio-sledovanost";
export const MODULE_PATH = `modules/${MODULE_ID}`;
export const APP_ID = "sledovanost-studio-tree";
export const LANGUAGES = ["cs", "en"];

export const SETTINGS = {
  TREE: "tree",
  STATE: "state",
  LANGUAGE: "language"
};

export const DEFAULT_STATE = Object.freeze({
  popularity: 0,
  spAdjustment: 0,
  purchased: []
});
