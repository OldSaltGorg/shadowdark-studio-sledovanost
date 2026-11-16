# Sledovanost — Ghostwriters' Studio

A Foundry VTT v13 module for the **Sledovanost (Popularity)** meta-progression used in a
Shadowdark campaign. The studio earns Story Points (SP) from Popularity milestones and spends
them on a shared upgrade tree, in the style of a WoW talent tree.

This release covers the **upgrade tree**. Popularity generation, rival studios and the
leaderboard will be added later.

## Features

- Three branches (Interface, Utility, Editorial) × three tiers, with orthogonal arrows for
  prerequisites. Tiers open based on SP already spent (I: 0, II: 4, III: 10 by default).
- Each upgrade shows its state: owned, available, not enough SP or locked. Select an upgrade
  to read its full effect, see why it is locked, and view what it requires or leads to.
- Header with Popularity, milestone progress, earned/spent/available SP and the number of
  owned upgrades. Milestone *n* is reached at `5 × n × (n + 3)` Popularity and grants 2 SP.
- **Czech and English** content and UI, switchable in the window (CZ/EN) per user.
- **GM only:** set Popularity, apply an SP correction, purchase upgrades (after the group
  agrees), refund mistakes, and "grant anyway" from edit mode.
- **GM edit mode:** add, edit, delete and drag upgrades (dropping on another upgrade swaps
  them); edit branches (name, colour, ID prefix, description), tiers (label, cost, unlock
  threshold) and the overview text; export, import or reset to the bundled default.

Players can open the tree from the **Token controls** (diagram icon) or the button in the
**Journal** sidebar. Macros can use `game.modules.get("shadowdark-studio-sledovanost").api.open()`.

## Installation

Manifest URL:

```
https://github.com/OldSaltGorg/shadowdark-studio-sledovanost/releases/latest/download/module.json
```

Requires Foundry VTT v13 and the Shadowdark system.

## Data

Everything is stored in world settings (`shadowdark-studio-sledovanost.tree` and `.state`).
On first GM login the bundled tree in `data/default-tree.json` is copied into the world.
After that, the world copy is authoritative, so module updates do not overwrite GM edits.
Use **Reset to default** to load a newer bundled tree. Export first if you want a backup.

Each purchase records the SP actually paid. If tier costs are changed later, earlier
purchases keep their original price.

## Development

```bash
node --test tests/*.test.mjs            # unit tests (progression rules, arrow routing)
python3 tools/build.py                  # dist/module.zip + dist/module.json
python3 -m http.server 8765             # then open http://127.0.0.1:8765/dev/harness.html
tools/deploy-test.sh                    # rsync to the test server's Data/modules folder
```

`dev/harness.html` loads the real module code against a small Foundry API stub, so layout
and interactions can be checked without a running Foundry. Get Handlebars into `dev/vendor/`
first:

```bash
curl -L https://cdn.jsdelivr.net/npm/handlebars@4.7.8/dist/handlebars.min.js -o dev/vendor/handlebars.min.js
```

### Releasing

1. Bump `version` in `module.json` and commit.
2. Tag `vX.Y.Z` with the same version and push it.
3. The release workflow runs the tests, builds the package and attaches `module.json`
   and `module.zip` to a GitHub release.

## Licence

Code under the MIT licence (see `LICENSE`). The bundled rules text belongs to the campaign author.
