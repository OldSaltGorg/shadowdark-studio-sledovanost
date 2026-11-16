// Minimal stand-ins for the Foundry v13 APIs this module uses, so the UI can be
// previewed in a plain browser. Development only; not shipped in module.zip.
/* global Handlebars */

const MODULE_PREFIX = "modules/shadowdark-studio-sledovanost/";
const params = new URLSearchParams(location.search);

function deepClone(o) {
  if (typeof o === "function" || o === null || typeof o !== "object") return o;
  if (Array.isArray(o)) return o.map(deepClone);
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepClone(v)]));
}
function getProperty(obj, key) {
  return key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function isObj(v) { return v && typeof v === "object" && !Array.isArray(v); }
function mergeObject(a, b, { inplace = true } = {}) {
  const target = inplace ? a : deepClone(a);
  for (const [k, v] of Object.entries(b ?? {})) {
    if (isObj(v) && isObj(target[k])) target[k] = mergeObject(target[k], v, { inplace: true });
    else target[k] = deepClone(v);
  }
  return target;
}
function expandObject(flat) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    const parts = k.split(".");
    let o = out;
    parts.slice(0, -1).forEach(p => { o = o[p] ??= {}; });
    o[parts.at(-1)] = v;
  }
  return out;
}
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const instances = new Map();
const templateCache = new Map();
Handlebars.registerHelper("eq", (a, b) => a === b);

async function loadTemplate(path) {
  if (!templateCache.has(path)) {
    const src = await (await fetch(getRoute(path))).text();
    templateCache.set(path, Handlebars.compile(src));
  }
  return templateCache.get(path);
}

function getRoute(path) {
  return `${globalThis.HARNESS_PREFIX ?? ""}/${path.replace(MODULE_PREFIX, "")}`;
}

class ApplicationV2 {
  static DEFAULT_OPTIONS = {};
  constructor(options = {}) {
    const chain = [];
    for (let c = this.constructor; c && c !== Object; c = Object.getPrototypeOf(c)) chain.unshift(c);
    this.options = chain.reduce((acc, c) => mergeObject(acc, Object.hasOwn(c, "DEFAULT_OPTIONS") ? c.DEFAULT_OPTIONS : {}), {});
    this.options = mergeObject(this.options, options);
    this.id = this.options.id ?? `app-${Math.random().toString(36).slice(2)}`;
    this.element = null;
    this.rendered = false;
  }
  get title() { return ""; }
  async _prepareContext() { return {}; }
  async _onRender() {}
  _onClose() {}
  bringToFront() {}
  async render() {
    const context = await this._prepareContext({});
    if (!this.element) {
      const win = document.createElement("div");
      win.className = ["app", "window-app", ...(this.options.classes ?? [])].join(" ");
      win.id = this.id;
      const pos = this.options.position ?? {};
      win.style.width = `${pos.width ?? 600}px`;
      win.style.height = pos.height ? `${pos.height}px` : "auto";
      const tag = this.options.tag === "form" ? "form" : "section";
      win.innerHTML = `<header class="window-header"><h1>${escapeHTML(this.title)}</h1><a class="close">✕</a></header>`
        + `<${tag} class="window-content"></${tag}>`;
      win.querySelector(".close").addEventListener("click", () => this.close());
      document.getElementById("windows").append(win);
      this.element = win;
      instances.set(this.id, this);
      win.addEventListener("click", ev => {
        const target = ev.target.closest("[data-action]");
        if (!target || !win.contains(target)) return;
        const handler = this.options.actions?.[target.dataset.action];
        if (handler) { ev.preventDefault(); handler.call(this, ev, target); }
      });
      if (this.options.tag === "form") {
        win.querySelector("form").addEventListener("submit", async ev => {
          ev.preventDefault();
          try {
            await this.options.form.handler.call(this, ev, ev.target, null);
            if (this.options.form.closeOnSubmit) this.close();
          } catch (err) { console.warn(err); }
        });
      }
    }
    const html = [];
    for (const part of Object.values(this.constructor.PARTS ?? {})) {
      html.push((await loadTemplate(part.template))(context, { allowProtoPropertiesByDefault: true }));
    }
    const content = this.element.querySelector(".window-content");
    const scroll = [...content.querySelectorAll(".sds-board-scroll, .sds-detail")].map(e => [e.scrollLeft, e.scrollTop]);
    content.innerHTML = html.join("");
    [...content.querySelectorAll(".sds-board-scroll, .sds-detail")].forEach((e, i) => {
      if (scroll[i]) [e.scrollLeft, e.scrollTop] = scroll[i];
    });
    this.element.querySelector(".window-header h1").textContent = this.title;
    this.element.dataset.app = this.constructor.name;
    this.rendered = true;
    await this._onRender(context, {});
    return this;
  }
  async close() {
    this._onClose({});
    this.element?.remove();
    this.element = null;
    this.rendered = false;
    instances.delete(this.id);
  }
}

const HandlebarsApplicationMixin = Base => class extends Base {};

function dialogHTML(content, buttons) {
  const dlg = document.createElement("dialog");
  dlg.className = "app sdstudio-dialog";
  dlg.innerHTML = `<form>${content}<footer>${buttons.map(b => `<button type="button" data-a="${b.action}">${b.label}</button>`).join("")}</footer></form>`;
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

const DialogV2 = {
  async confirm({ content }) {
    return new Promise(resolve => {
      const dlg = dialogHTML(content, [{ action: "yes", label: "Yes" }, { action: "no", label: "No" }]);
      dlg.addEventListener("click", ev => {
        const a = ev.target.closest("[data-a]")?.dataset.a;
        if (!a) return;
        dlg.remove();
        resolve(a === "yes");
      });
    });
  },
  async wait({ content, buttons, render }) {
    return new Promise(resolve => {
      const dlg = dialogHTML(content, buttons);
      render?.(new Event("render"), { element: dlg });
      dlg.addEventListener("click", ev => {
        const a = ev.target.closest("[data-a]")?.dataset.a;
        if (!a) return;
        const b = buttons.find(x => x.action === a);
        const result = b.callback ? b.callback(ev, { form: dlg.querySelector("form") }) : a;
        dlg.remove();
        resolve(result);
      });
    });
  }
};

// <prose-mirror> stand-in: a textarea-like editable element exposing .value
class ProseMirrorStub extends HTMLElement {
  connectedCallback() {
    if (this.querySelector("textarea")) return;
    const ta = document.createElement("textarea");
    ta.value = this._initial ?? this.getAttribute("value") ?? "";
    ta.style.width = "100%";
    ta.style.height = "100%";
    this.append(ta);
  }
  get value() { return this.querySelector("textarea")?.value ?? ""; }
  get name() { return this.getAttribute("name"); }
  static create({ name, value, height }) {
    const el = document.createElement("prose-mirror");
    el.setAttribute("name", name);
    el._initial = value;
    el.style.display = "block";
    el.style.height = `${height}px`;
    return el;
  }
}
customElements.define("prose-mirror", ProseMirrorStub);

// Settings store
const registry = new Map();
const store = new Map(JSON.parse(localStorage.getItem("sds-harness") ?? "[]"));
const settings = {
  register(ns, key, cfg) { registry.set(`${ns}.${key}`, cfg); },
  get(ns, key) {
    const k = `${ns}.${key}`;
    return store.has(k) ? deepClone(store.get(k)) : deepClone(registry.get(k)?.default);
  },
  async set(ns, key, value) {
    const k = `${ns}.${key}`;
    store.set(k, deepClone(value));
    localStorage.setItem("sds-harness", JSON.stringify([...store]));
    registry.get(k)?.onChange?.(value);
    return value;
  }
};

const hooks = { once: new Map(), on: new Map() };
globalThis.Hooks = {
  once(name, fn) { (hooks.once.get(name) ?? hooks.once.set(name, []).get(name)).push(fn); },
  on(name, fn) { (hooks.on.get(name) ?? hooks.on.set(name, []).get(name)).push(fn); },
  async callAll(name, ...args) {
    for (const fn of hooks.once.get(name) ?? []) await fn(...args);
    hooks.once.delete(name);
    for (const fn of hooks.on.get(name) ?? []) await fn(...args);
  }
};

globalThis.foundry = {
  utils: { deepClone, getProperty, mergeObject, expandObject, escapeHTML, getRoute,
    randomID: n => Math.random().toString(36).slice(2, 2 + n),
    saveDataToFile: (data, type, name) => console.log("saveDataToFile", name, data.length) },
  applications: {
    api: { ApplicationV2, HandlebarsApplicationMixin, DialogV2 },
    elements: { HTMLProseMirrorElement: ProseMirrorStub },
    instances,
    ux: { TextEditor: { implementation: { enrichHTML: async html => html } } }
  }
};

const isGM = params.get("gm") !== "0";

function avatar(text, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="hsl(${hue},45%,30%)"/>`
    + `<text x="60" y="74" font-size="44" text-anchor="middle" fill="#fff" font-family="sans-serif">${text}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
// Harness players: level overrides via ?lv=Glatnig:4 to test record-level bonuses.
const levelOverrides = Object.fromEntries((params.get("lv") ?? "").split(",").filter(Boolean).map(x => x.split(":")));
const players = [
  ["u1", "Petr", "Glatnig", 3, true], ["u2", "Jana", "Mubgnat", 3, true], ["u3", "Tomáš", "Murloc", 3, true],
  ["u4", "Eva", "Thrur", 3, true], ["u5", "Ondra", "Melg", 3, true], ["u6", "Host", null, null, false]
].map(([id, name, char, level, active], i) => ({
  id, name, isGM: false, active, avatar: avatar(name[0], i * 60), color: { css: `hsl(${i * 60},60%,55%)` },
  character: char ? { id: `a-${id}`, name: char, img: avatar(char.slice(0, 2), i * 60 + 20),
    system: { level: { value: Number(levelOverrides[char] ?? level) } } } : null
}));
const gmUser = { id: "gm", name: "PJ", isGM: true, active: true };
const users = [gmUser, ...players];
users.activeGM = { isSelf: isGM };

globalThis.game = {
  user: isGM ? gmUser : players[0],
  users,
  i18n: { lang: params.get("lang") ?? "cs", localize: k => k },
  settings,
  modules: new Map([["shadowdark-studio-sledovanost", {}]])
};
globalThis.ui = { notifications: { info: console.info, warn: m => alert(m), error: m => alert(m) } };
