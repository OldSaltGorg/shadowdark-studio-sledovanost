import { LANGUAGES, MODULE_ID, MODULE_PATH, SETTINGS } from "./constants.mjs";

const dictionaries = {};

let loading = null;

/** Load both UI dictionaries once, so the in-app language toggle works without a reload. */
export function loadDictionaries() {
  loading ??= Promise.all(LANGUAGES.map(async lang => {
    try {
      const response = await fetch(foundry.utils.getRoute(`${MODULE_PATH}/lang/${lang}.json`));
      const json = await response.json();
      dictionaries[lang] = json.SDSTUDIO ?? {};
    } catch (err) {
      console.error(`${MODULE_ID} | Failed to load ${lang} dictionary`, err);
      dictionaries[lang] = {};
    }
  }));
  return loading;
}

export function currentLanguage() {
  const pref = game.settings.get(MODULE_ID, SETTINGS.LANGUAGE);
  if (LANGUAGES.includes(pref)) return pref;
  return game.i18n.lang === "cs" ? "cs" : "en";
}

export function otherLanguage(lang = currentLanguage()) {
  return lang === "cs" ? "en" : "cs";
}

/** UI dictionary for the active language, falling back to the other language. */
export function labels(lang = currentLanguage()) {
  return foundry.utils.mergeObject(
    foundry.utils.deepClone(dictionaries[otherLanguage(lang)] ?? {}),
    dictionaries[lang] ?? {},
    { inplace: false }
  );
}

export function t(key, data = {}, lang = currentLanguage()) {
  const value = foundry.utils.getProperty(dictionaries[lang], key)
    ?? foundry.utils.getProperty(dictionaries[otherLanguage(lang)], key)
    ?? key;
  return String(value).replace(/\{(\w+)\}/g, (m, k) => (k in data ? data[k] : m));
}

/** Pick the localized value of a {cs, en} content field. */
export function pick(field, lang = currentLanguage()) {
  if (!field || typeof field === "string") return field ?? "";
  return field[lang] || field[otherLanguage(lang)] || "";
}
