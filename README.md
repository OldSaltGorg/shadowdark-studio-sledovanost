# Sledovanost — Ghostwriters' Studio

> The in-game term is now **Popularita** (Popularity); the module id still says *sledovanost*.

A Foundry VTT v13 module for the **Popularita (Popularity)** meta-progression used in a
Shadowdark campaign. One window with a shared XP-style progress header and three tabs:

1. **Daily awards** — a round-robin for end-of-day (or chapter interview) author awards.
2. **Upgrades** — the studio's WoW-style upgrade tree, bought with Story Points (SP).
3. **Leaderboard** — the public top 10 plus GM management and simulation of rival studios.

## Daily awards (tab 1)

- The GM picks which players take part (online players with an assigned character are
  preselected), chooses *End of day* or *Chapter interview*, and starts. The order is shuffled.
- The author in focus is shown to everyone with their protagonist, level and career record.
  Others call out their best moment; the GM picks 0/1/2 points, adjusts the record-level bonus
  and notes the moment, then moves on. The rubric, guidance and prompts are always visible.
- **Career records** are tracked per player. A first-time author's record starts at their
  current level (no retrospective award). When the assigned Shadowdark character's level
  (`system.level.value`) exceeds the record, +1 per level is suggested automatically.
- After everyone, a summary allows final edits. **Commit** adds the total to the player
  studio's Popularita (as a history entry), updates its author records, advances its day
  counter (days only) and rolls the rivals for the same date.
- Player and character names, portraits and levels come live from Foundry: each non-GM
  user's name and their assigned character.

## Leaderboard (tab 3)

- Competition ranking (1, 2, 2, 4) by Popularita; ties display alphabetically. Players see the
  top 10; the GM also sees studios below the line and cancelled (frozen) studios.
- Each studio keeps a full history of gains per date (seeded with chapter 1's logged rolls),
  so scores are always `opening score + Σ gains`.
- **Player studios** (any number) are never auto-rolled; they gain through Daily awards. Each
  has its own Popularita, SP, upgrades, chapter/day counter and author records. The window works
  with the top player studio by default; the GM can pick another from a small dropdown in
  Daily awards (e.g. a rotating table). The choice applies to all tabs for everyone.
- Tick rival rows to **evaluate only the selected studios**.
- **Evaluate rivals** rolls d6 per active rival using the profile modifier (−1 to +2), clamped
  to the daily cap; interviews ignore the profile. A date is never processed twice.
- **New studio** generates a complete skeleton (Czech name, five protagonists with ancestry,
  class, level, stats, HP, AC and gear, reputation, goal and weakness).
- Double-click a studio to edit everything: lore, protagonists, owned upgrades and history.
- **Export/Import** the leaderboard as JSON, e.g. to have an LLM flesh out lore and re-import.
  Tab 3's interface is English; studio content stays Czech.

## Upgrades (tab 2)

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

Everything is stored in world settings: `.tree`, `.rivals` (all studios, including player
progress), `.activeGroup`, `.session` (the live round-robin). v0.1's `.state` (one studio's
Popularita and purchases) is migrated onto the top player studio on first GM login.
On first GM login the bundled tree (`data/default-tree.json`) and the chapter 2 roster
(`data/default-rivals.json`) are copied into the world.
After that, the world copy is authoritative, so module updates do not overwrite GM edits.
Use **Reset to default** to load a newer bundled tree. Export first if you want a backup.

World settings are readable by every connected client, so GM-only leaderboard details are
hidden in the UI but not cryptographically secret.

Each purchase records the SP actually paid. If tier costs are changed later, earlier
purchases keep their original price.

## Development

```bash
node --test tests/*.test.mjs            # unit tests (progression rules, arrow routing)
python3 tools/build.py                  # dist/module.zip + dist/module.json
python3 tools/gen_rivals.py ROSTER.md   # rebuild data/default-rivals.json from the GM roster note
python3 dev/serve.py                    # then open http://127.0.0.1:8765/dev/harness.html
tools/deploy-test.sh                    # rsync to the test server's Data/modules folder
```

`dev/harness.html` loads the real module code against a small Foundry API stub, so layout
and interactions can be checked without a running Foundry. It fakes five players; add
`?gm=0` for the player view and e.g. `?lv=Glatnig:4` to test a new career-level record. Get Handlebars into `dev/vendor/`
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
