/**
 * Random rival-studio skeletons (Czech content). Pure: pass an rng for tests.
 * The output is a starting point for the GM or an LLM to flesh out.
 */

const ANCESTRIES = [
  { m: "Člověk", f: "Člověk", w: 4, bonusHp: 0 },
  { m: "Elf", f: "Elfka", w: 2, bonusHp: 0 },
  { m: "Trpaslík", f: "Trpaslice", w: 2, bonusHp: 2 },
  { m: "Půlčík", f: "Půlčice", w: 2, bonusHp: 0 },
  { m: "Půlork", f: "Půlorkyně", w: 1, bonusHp: 0 },
  { m: "Goblin", f: "Goblinka", w: 1, bonusHp: 0 }
];

const CLASSES = {
  fighter: { m: "bojovník", f: "bojovnice", prime: "str", hd: 8,
    gear: ["Meč, kroužková zbroj a štít", "Sekera a kroužková zbroj", "Kopí, kroužková zbroj a štít", "Válečné kladivo a kroužková zbroj"],
    roles: ["drží přední linii", "kryje ústup", "nese těžké vybavení", "chrání slabší členy"] },
  thief: { m: "zloděj", f: "zlodějka", prime: "dex", hd: 4,
    gear: ["Dýka, krátký luk a kožená zbroj", "Prak, dýka a kožená zbroj", "Paklíče, dýka a kožená zbroj"],
    roles: ["průzkum a pasti", "otevírá zámky", "vyjednává o průchodu", "hlídá únikové cesty"] },
  priest: { m: "kněz", f: "kněžka", prime: "wis", hd: 6,
    gear: ["Palcát, kožená zbroj a štít", "Palcát, kroužková zbroj a štít"],
    roles: ["léčí a smiřuje", "vede modlitby před výpravou", "spravuje zásoby", "zapisuje přísahy"] },
  wizard: { m: "čaroděj", f: "čarodějka", prime: "int", hd: 4,
    gear: ["Hůl a kouzelnická kniha", "Hůl, kniha a svitky", "Hůl a zašitá kniha"],
    roles: ["čte staré nápisy", "experimentuje s kouzly", "plánuje boj", "zkoumá magické stopy"] }
};

const DEITIES = ["Orda", "Madeeru", "Gede"];

const NAMES = {
  m: ["Hektor", "Borun", "Olin", "Matěj", "Hron", "Kelm", "Radan", "Vojtěch", "Bořek", "Dalibor", "Kryštof",
    "Ludvík", "Mirko", "Ota", "Přemek", "Štěpán", "Vít", "Zbyněk", "Jaromír", "Kazimír", "Lubor", "Sobek"],
  f: ["Brina", "Nela", "Edda", "Dorga", "Rilka", "Iva", "Mara", "Oda", "Tesa", "Vela", "Mína", "Dobromila",
    "Hedvika", "Lada", "Milena", "Radka", "Sylva", "Věra", "Zora", "Květa", "Agáta", "Ludmila"]
};

const NICKNAMES = ["Vex", "Puk", "Uhlík", "Niv", "Ticho", "Šmouha", "Knot", "Cvrček", "Jiskra", "Hřebík"];

const EPITHETS = ["Kamenné víčko", "Šikmý řez", "Dlouhé lano", "Tři klíče", "Poslední sirka", "Rudá čára",
  "Za odlivu", "Bez pečeti", "Dvě kotvy", "Černý inkoust", "Stará mapa", "Mokrý knot", "Zlatá jehla",
  "Pod mostem", "Tichá stopa", "Železný hrnec", "Svíčka v kapse", "Půl podpisu", "Ranní mlha",
  "Kostěný knoflík", "Zelená pečeť"];

const STUDIO_NAMES = ["Noční sazeči", "Inkoustové stíny", "Bratrstvo zlomeného pera", "Strážci okrajů",
  "Tichá kapitola", "Poslední tiskaři", "Kroužek mokrých map", "Svaz ztracených klíčů", "Zlomené pečetě",
  "Popelní kronikáři", "Šedé záložky", "Spolek pozdních dopisů", "Cech prázdných stránek",
  "Lovci tichých zvonů", "Strážci posledního mostu", "Mlžní čtenáři", "Rytíři dvojité tečky",
  "Vrány z půdy", "Sestry rudé tužky", "Bratři od lucerny", "Kartografové bláta", "Družina starého knotu"];

const REPUTATIONS = ["nováčci, kteří slibují víc, než zatím zvládnou", "opatrní sběratelé map a pověstí",
  "hluční lovci odměn s talentem pro titulky", "tichá družina, o které se mluví až po jejím odchodu",
  "bývalí strážní, kteří se dali na dobrodružství", "studio, které z každé nehody udělá komedii",
  "pečliví účetní podzemí, kteří počítají každou minci", "odvážlivci, kteří vstupují tam, kam jiní nechtějí"];

const GOALS = ["dostat se do první desítky žebříčku", "najít ztraceného člena dřívější družiny",
  "získat vlastního sponzora", "zmapovat úsek, který ostatní obcházejí", "splatit dluh u nebezpečného patrona",
  "dokázat, že poctivá práce vydělá víc než okázalost", "získat zpět ukradenou relikvii",
  "otevřít bezpečnou cestu pro civilisty"];

const WEAKNESSES = ["neumějí odmítnout sázku", "vůdce nesnáší kritiku", "hádají se o kořist",
  "příliš důvěřují cizím", "panicky se bojí tmy", "utrácejí dřív, než vydělají",
  "jeden člen tají dluhy", "přeceňují vlastní pověst"];

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function weighted(list, rng) {
  const total = list.reduce((s, x) => s + x.w, 0);
  let r = rng() * total;
  for (const x of list) {
    if ((r -= x.w) < 0) return x;
  }
  return list[list.length - 1];
}

function d6(rng) {
  return 1 + Math.floor(rng() * 6);
}

function mod(score) {
  return Math.floor((score - 10) / 2);
}

export function generateMember({ level = 1, classKey, rng = Math.random, usedNames = new Set() } = {}) {
  const gender = rng() < 0.5 ? "m" : "f";
  const ancestry = weighted(ANCESTRIES, rng);
  const cls = CLASSES[classKey ?? pick(Object.keys(CLASSES), rng)];
  const keys = ["str", "dex", "con", "int", "wis", "cha"];
  const rolls = keys.map(() => d6(rng) + d6(rng) + d6(rng));
  const stats = Object.fromEntries(keys.map((k, i) => [k, rolls[i]]));
  // Put the best roll in the class's prime ability.
  const bestKey = keys.reduce((a, b) => (stats[b] > stats[a] ? b : a));
  [stats[bestKey], stats[cls.prime]] = [stats[cls.prime], stats[bestKey]];

  let name = "";
  for (let i = 0; i < 20 && (!name || usedNames.has(name)); i++) {
    const roll = rng();
    const given = ancestry.m === "Goblin" && roll < 0.6 ? pick(NICKNAMES, rng) : pick(NAMES[gender], rng);
    name = roll < 0.55 ? `${given} ${pick(EPITHETS, rng)}` : given;
  }
  usedNames.add(name);

  const avgHd = Math.ceil(cls.hd / 2) + 1;
  const hp = Math.max(level, avgHd * level + mod(stats.con) + ancestry.bonusHp);
  const gear = pick(cls.gear, rng);
  const dex = mod(stats.dex);
  let ac = 10 + dex;
  if (gear.includes("kroužková")) ac = 13 + dex;
  else if (gear.includes("kožená")) ac = 11 + dex;
  if (gear.includes("štít")) ac += 2;
  const deity = classKey === "priest" || cls === CLASSES.priest ? `; uctívá ${pick(DEITIES, rng)}` : "";

  return {
    name,
    ancestry: ancestry[gender],
    class: cls[gender],
    level,
    stats,
    hp,
    ac,
    gear: `${gear}${deity}; ${pick(cls.roles, rng)}.`
  };
}

/** Median member level across existing rivals, used to size a new group. */
export function typicalLevel(groups) {
  const levels = groups.filter(g => !g.isPlayer).flatMap(g => (g.members ?? []).map(m => Number(m.level) || 1)).sort((a, b) => a - b);
  if (!levels.length) return 1;
  return levels[Math.floor(levels.length / 2)];
}

export function generateGroup(existingGroups = [], { rng = Math.random, id } = {}) {
  const usedStudios = new Set(existingGroups.map(g => g.name));
  const free = STUDIO_NAMES.filter(n => !usedStudios.has(n));
  const name = free.length ? pick(free, rng) : `Studio č. ${existingGroups.length + 1}`;
  const top = typicalLevel(existingGroups);
  const classes = ["fighter", "thief", "priest", "wizard", pick(["fighter", "thief", "priest", "wizard"], rng)];
  const usedNames = new Set(existingGroups.flatMap(g => (g.members ?? []).map(m => m.name)));
  const members = classes.map((classKey, i) => generateMember({
    classKey,
    level: Math.max(1, i < 2 ? top : top - Math.floor(rng() * 2)),
    rng,
    usedNames
  }));
  return {
    id: id ?? `g-${Math.floor(rng() * 1e9).toString(36)}`,
    name,
    face: members[0].name,
    isPlayer: false,
    status: "active",
    profile: -1,
    cap: 10,
    authors: 5,
    startScore: Math.floor(rng() * 6),
    reputation: pick(REPUTATIONS, rng),
    goal: pick(GOALS, rng),
    weakness: pick(WEAKNESSES, rng),
    relationship: "",
    episodes: "",
    notes: "",
    members,
    upgrades: [],
    history: [],
    generated: true
  };
}
