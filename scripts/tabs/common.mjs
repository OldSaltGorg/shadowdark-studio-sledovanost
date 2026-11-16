import { t } from "../i18n.mjs";

/** Label for a chapter/day/kind date in the active language. */
export function dateLabel(date, lang) {
  if (!date) return "";
  if (date.kind === "interview") return t("Rewards.DateInterview", { chapter: date.chapter }, lang);
  if (date.kind === "manual") return t("Rewards.DateManual", { chapter: date.chapter }, lang);
  return t("Rewards.DateDay", { chapter: date.chapter, day: date.day }, lang);
}

/** Fair d6 from Foundry's configured RNG, falling back to Math.random outside Foundry. */
export function rollD6() {
  const u = globalThis.CONFIG?.Dice?.randomUniform?.() ?? Math.random();
  return Math.min(6, 1 + Math.floor(u * 6));
}
