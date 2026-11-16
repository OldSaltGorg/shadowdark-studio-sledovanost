"""Regenerate data/default-tree.json from the Obsidian rules notes.

Usage: python3 tools/gen_seed.py CS_SECTION.md EN_SECTION.md

Each input is the "Struktura stromu a vylepšení" / "Tree Structure & Nodes" section
(heading through the three upgrade tables) copied from the Czech and English notes.
Layout positions are kept in LAYOUT below.
"""
import json, re, sys, html
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "default-tree.json"


def inline(md):
    s = html.escape(md.strip(), quote=False)
    s = s.replace("&lt;br&gt;", "<br>")
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])", r"<em>\1</em>", s)
    return s


def paragraphs(lines):
    out, buf = [], []
    for ln in lines + [""]:
        if ln.strip():
            buf.append(ln.strip())
        elif buf:
            out.append("<p>" + inline(" ".join(buf)) + "</p>")
            buf = []
    return "".join(out)


def effect_html(cell):
    parts = [p for p in re.split(r"(?:<br>\s*){2,}", cell.strip()) if p.strip()]
    return "".join("<p>" + inline(p) + "</p>" for p in parts)


def parse(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    intro, sections, cur = [], [], None
    for ln in lines[1:]:
        if ln.startswith("### "):
            cur = {"title": ln[4:].strip(), "text": [], "rows": []}
            sections.append(cur)
        elif ln.startswith("|"):
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if cur is not None and re.fullmatch(r"[IUE]\d\d", cells[0]):
                cur["rows"].append(cells)
        elif cur is None:
            intro.append(ln)
        else:
            cur["text"].append(ln)
    return paragraphs(intro), sections[:3]


if len(sys.argv) != 3:
    sys.exit(__doc__)
cs_intro, cs = parse(Path(sys.argv[1]))
en_intro, en = parse(Path(sys.argv[2]))

BRANCHES = [
    ("interface", "I", "#5cb8b2"),
    ("utility", "U", "#d0607f"),
    ("editorial", "E", "#4cb782"),
]
TIER = {"I": 1, "II": 2, "III": 3}

# Layout inspired by the mock-up: (row, col) inside each branch/tier cell.
LAYOUT = {
    "I11": (0, 0), "I12": (0, 1), "I13": (0, 2),
    "I21": (0, 0), "I22": (0, 1), "I24": (0, 2), "I23": (1, 1),
    "I31": (0, 0), "I32": (0, 1), "I33": (0, 2), "I34": (1, 0), "I35": (1, 1), "I36": (1, 2),
    "U11": (0, 0), "U12": (0, 1), "U13": (0, 2),
    "U21": (0, 0), "U22": (0, 1), "U23": (0, 2), "U24": (1, 0), "U25": (1, 1), "U26": (1, 2),
    "U31": (0, 1), "U32": (0, 0), "U33": (0, 2), "U34": (1, 2), "U35": (1, 0), "U36": (1, 1),
    "E11": (0, 0), "E12": (0, 1), "E13": (0, 2),
    "E23": (0, 0), "E22": (0, 1), "E24": (0, 2), "E21": (1, 0),
    "E31": (0, 0), "E32": (0, 1), "E33": (1, 0), "E34": (1, 1),
}

branches, talents = [], []
for (bid, prefix, color), cs_sec, en_sec in zip(BRANCHES, cs, en):
    branches.append({
        "id": bid, "prefix": prefix, "color": color,
        "name": {"cs": cs_sec["title"], "en": en_sec["title"]},
        "description": {"cs": paragraphs(cs_sec["text"]), "en": paragraphs(en_sec["text"])},
    })
    en_rows = {r[0]: r for r in en_sec["rows"]}
    for r in cs_sec["rows"]:
        tid, tier, name_cs, pre_cs, eff_cs = r
        e = en_rows[tid]
        ids = re.findall(r"[IUE]\d\d", pre_cs)
        cond_cs = re.sub(r"^[—\-;\s]+", "", re.sub(r"[IUE]\d\d", "", pre_cs)).strip(" ;")
        cond_en = re.sub(r"^[—\-;\s]+", "", re.sub(r"[IUE]\d\d", "", e[3])).strip(" ;")
        row, col = LAYOUT[tid]
        talents.append({
            "id": tid, "branch": bid, "tier": TIER[tier], "row": row, "col": col,
            "name": {"cs": name_cs, "en": e[2]},
            "description": {"cs": effect_html(eff_cs), "en": effect_html(e[4])},
            "prereqs": ids,
            "condition": {"cs": cond_cs, "en": cond_en},
        })

assert len(talents) == 39, len(talents)
tree = {
    "schema": 1,
    "intro": {"cs": cs_intro, "en": en_intro},
    "rules": {"spPerMilestone": 2},
    "tiers": [
        {"id": 1, "label": "I", "cost": 1, "unlockSpent": 0},
        {"id": 2, "label": "II", "cost": 2, "unlockSpent": 4},
        {"id": 3, "label": "III", "cost": 3, "unlockSpent": 10},
    ],
    "branches": branches,
    "talents": talents,
}
OUT.write_text(json.dumps(tree, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("wrote", OUT, len(talents), "talents; total cost",
      sum(t["tier"] for t in talents))
