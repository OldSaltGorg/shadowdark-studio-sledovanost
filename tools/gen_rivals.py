#!/usr/bin/env python3
"""Regenerate data/default-rivals.json from the GM roster note.

Usage: python3 tools/gen_rivals.py "Kapitola 2 - Žebříček a soupisky studií (PJ).md"

Parses the chapter-1 rolls (seeded as history so scores stay auditable), the
protagonist rosters, lore paragraphs and proposed purchases.
"""
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "data" / "default-rivals.json"
BASE = {1: 1, 2: 3, 3: 5, 4: 6, 5: 7, 6: 8}
HEADLINES = {
    1: "Nákladný nezdar nebo ústup.",
    2: "Běžný postup.",
    3: "Úspěšná výprava nebo objev.",
    4: "Výkon typický pro dané studio.",
    5: "Velký úspěch nebo obrat v rivalitě.",
    6: "Průlomová epizoda nebo dramatický zvrat.",
}
# "Tvář studia" as published on the public leaderboard.
FACES = {
    "Hráčská Redakce": "Pět protagonistů, tři dny náskoku",
    "Družina Robina Úda": "Robin Úd; za jeho zády Vrba",
}
PLAYER_NAME = "Redakce"


def slug(text):
    table = str.maketrans("áčďéěíňóřšťúůýž", "acdeeinorstuuyz")
    return re.sub(r"[^a-z0-9]+", "-", text.lower().translate(table)).strip("-")


def section(lines, start_pat):
    out, on = [], False
    for ln in lines:
        if re.match(start_pat, ln):
            on = True
            continue
        if on and ln.startswith("## "):
            break
        if on:
            out.append(ln)
    return out


def split_h3(lines):
    groups, cur = [], None
    for ln in lines:
        if ln.startswith("### "):
            cur = {"title": ln[4:].strip(), "lines": []}
            groups.append(cur)
        elif cur:
            cur["lines"].append(ln)
    return groups


def nums(text):
    return [int(x) for x in re.findall(r"\d+", text)]


def main(path):
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    rolls = {}
    for g in split_h3(section(lines, r"## Skutečné hody")):
        m = re.match(r"(.+?) — S₀ (\d+), profil ([+−-]?\d+)", g["title"])
        if not m:
            continue
        name, s0, prof = m.group(1), int(m.group(2)), int(m.group(3).replace("−", "-").replace("+", ""))
        body = "\n".join(g["lines"])
        days = nums(re.search(r"Denní k6: \*\*(.+?)\*\*", body).group(1))
        interview = int(re.search(r"Rozhovor: k6 \*\*(\d)", body).group(1))
        final = int(re.search(r"= (\d+)\.\*\*\s*$", body.strip()).group(1))
        rolls[name] = {"s0": s0, "profile": prof, "days": days, "interview": interview, "final": final}

    summary = {}
    for ln in section(lines, r"## Výsledný žebříček"):
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if len(cells) == 6 and cells[0].isdigit():
            summary[cells[1]] = re.findall(r"[IUE]\d\d", cells[5])

    groups = []
    for g in split_h3(section(lines, r"## Soupisky protagonistů")):
        name = re.sub(r"^\d+\.\s*", "", g["title"])
        body = g["lines"]
        text = "\n".join(body)
        members = []
        for ln in body:
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if len(cells) == 7 and re.fullmatch(r"\d+", cells[2] or "x"):
                anc, cls = [x.strip() for x in cells[1].split(",", 1)]
                st = nums(cells[3])
                members.append({
                    "name": cells[0], "ancestry": anc, "class": cls, "level": int(cells[2]),
                    "stats": dict(zip(["str", "dex", "con", "int", "wis", "cha"], st)),
                    "hp": int(cells[4]), "ac": int(cells[5]), "gear": cells[6]
                })

        def para(label):
            m = re.search(rf"\*\*{label}:\*\*\s*(.+)", text)
            return m.group(1).strip() if m else ""

        rep = re.search(r"Pověst: (.+?)\. Cíl: (.+?)\. Slabina: (.+?)\.?$", text, re.M)
        is_player = name == "Hráčská Redakce"
        r = rolls.get(name)
        history = []
        if r:
            for i, d in enumerate(r["days"], 1):
                gain = min(10, max(0, BASE[d] + r["profile"]))
                history.append({"chapter": 1, "day": i, "kind": "day", "roll": d, "base": BASE[d],
                                "profile": r["profile"], "gain": gain, "headline": HEADLINES[d]})
            d = r["interview"]
            history.append({"chapter": 1, "day": None, "kind": "interview", "roll": d, "base": BASE[d],
                            "profile": 0, "gain": BASE[d], "headline": HEADLINES[d]})
            total = r["s0"] + sum(h["gain"] for h in history)
            assert total == r["final"], (name, total, r["final"])
        lore_extra = "" if not is_player else "\n".join(x for x in body if x.strip() and not x.startswith("|"))
        groups.append({
            "id": slug(name),
            "name": PLAYER_NAME if is_player else name,
            "face": FACES.get(name, members[0]["name"] if members else ""),
            "isPlayer": is_player,
            "status": "active",
            "profile": r["profile"] if r else 0,
            "cap": 10,
            "authors": 5,
            "startScore": r["s0"] if r else 0,
            "reputation": rep.group(1) if rep else "",
            "goal": rep.group(2) if rep else "",
            "weakness": rep.group(3) if rep else "",
            "relationship": para("Vztah"),
            "episodes": para("Epizoda"),
            "notes": lore_extra,
            "members": members,
            "upgrades": summary.get(name, []) if not is_player else [],
            "history": history,
        })
        if is_player:
            # Working score given by the GM in the note; real worlds migrate their own value.
            groups[-1].update({"startScore": 50, "calendar": {"chapter": 2, "day": 0}, "authorRecords": {},
                               "purchased": [], "spAdjustment": 0})

    data = {"schema": 1, "title": "Žebříček Popularity", "groups": groups, "lastRanks": {}, "lastEvaluation": None}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for g in groups:
        score = g["startScore"] + sum(h["gain"] for h in g["history"])
        print(f'{g["name"]:32} {score:>6}{" PLAYER" if g["isPlayer"] else ""}  members={len(g["members"])} upgrades={g["upgrades"]}')


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
