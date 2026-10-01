# Toolchain contract (0.25)

**The shipped tree is the source of truth.** `fabric-mod/src/main/resources` (plus the Java sources,
gradle files and `docs/`) is what the game is built from. The generators in `tools/` exist to *reproduce*
that tree — never to overwrite it silently.

Since 0.25 the resources are maintained in three ways:

1. **Live generators** — deterministic, standard-library-only scripts that reproduce part of the shipped
   tree exactly. `tools/regen_check.py` re-runs them in a scratch copy on every CI build.
2. **Hand-authored files** — the 0.25 rift/travel/portal functions, textures and codecs that were edited
   directly. No script owns them; they are changed by hand and covered by `tools/validate.py` and
   `tools/test_data.py`.
3. **Historical scripts** — the 0.17–0.24 phase chain. They produced older revisions, several of them now
   crash, and several would *revert* 0.25 content if re-run. They are kept for reference only.

The contract lives in [`tools/baseline.json`](baseline.json) and is enforced by
[`tools/regen_check.py`](regen_check.py):

```sh
python3 tools/regen_check.py            # verify (CI runs this)
python3 tools/regen_check.py --report   # also run the dead scripts and show what they do
python3 tools/regen_check.py --update   # re-record known_drift after a deliberate change
python3 tools/regen_check.py -v         # print the full diff of every changed file
```

A build fails when

* a live generator no longer reproduces the shipped files (unexpected drift), or
* a documented known-drift entry stops differing (a stale manifest: the generator was fixed but the note
  was not), or
* a live generator exits non-zero.

## Live pipeline (order matters)

| # | script | owns |
|---|--------|------|
| 1 | `creatures.py` | `SiftModelDefs.java`, entity textures, spawn eggs |
| 2 | `phase5.py` | mob loot, block recipes, advancement tab |
| 3 | `expansion.py` | rift waves, illager encounters, `world/roll` |
| 4 | `visual_pass.py` | reference-driven textures, note glow, early rift authoring |
| 5 | `phase24_textures.py` | 0.24 trailer-accurate block textures, ichor sheets |
| 6 | `phase19.py` | 0.25 tides, dry terrain, Canopy bones, Jelly Lands, Blub, ichor, cyan return portal |

Rules for a live generator: pure standard library (CI has no PIL/numpy), deterministic output, no
network, and it must leave the tree byte-identical when re-run. New or changed files must be reported by
`regen_check.py` and either fixed or added to `known_drift` with a reason.

## Known drift (documented, checked)

| file | why it differs | how to resolve |
|------|----------------|----------------|
| `assets/entersift/textures/entity/licker.png` | `creatures.py` draws a slightly different Licker (542/16384 pixels, head/face region) than the committed 0.24 art. The shipped texture is the reviewed art. | Compare both in game, then either ship the generator output or update the sprite spec, and re-run `--update`. |
| `worldgen/feature/crag_spire.json` | `phase19.py`'s Crag generator produces 320/619 placement entries with different offsets (mostly 1 block lower) than the shipped file. | Review the crag silhouette in game; the shipped file stays until then, because re-running changes worldgen for new chunks. |
| `worldgen/feature/titan_crag.json` | Same as `crag_spire.json` (1167/1776 entries differ). | As above. |

## Manual / informational scripts (never checked)

| script | purpose |
|--------|---------|
| `make_asset_sheet.py` | `docs/visual-assets.png` review sheet. Needs ImageMagick and writes non-deterministic bytes. |
| `preview_creatures.py`, `preview_features.py`, `preview_sky.py` | software preview renders for `docs/`. |
| `check_shaders.py` | CI: compiles the bundled shaderpack with a `glslangValidator` path argument. |
| `smoke_report.py` | CI: turns the dedicated-server smoke log into GitHub annotations. |

## Historical scripts (do not run)

Kept in the repository for provenance. `regen_check.py --report` lists what each one would do; running
them on a working tree rewrites data.

| script | why it is dead |
|--------|----------------|
| `generate_data.py` | Crashes: calls `visual_pass`, which expects only the original three biomes (`KeyError: 'boneyard'`). Superseded by the phase chain. |
| `extract_textures.py` | Needs PIL and the original reference screenshots; the sampled textures have shipped. |
| `item_art.py` | Needs PIL; item art has shipped. |
| `audio11.py` | Needs numpy; ritual/music audio has shipped. |
| `phase4.py` | Needs PIL; its content was extended and partly replaced by later phases. |
| `phase6.py` | Superseded: rewrites 9 rift/portal functions and reverts 0.25 content. |
| `phase8.py` | Superseded: rewrites the 16 note beam/shaft functions. |
| `phase9.py` | Superseded: its loot-data precondition no longer exists (`StopIteration`). |
| `phase10.py` – `phase18.py` | Need numpy; superseded by phase14/17/19. |

## Regenerating deliberately

1. Fix or extend the owning live script (or add a new one and list it in `baseline.json`).
2. `python3 tools/regen_check.py -v` and read the diff.
3. If the new output is intended, re-run the full pipeline in place and update the gameplay tests
   (`tools/test_data.py`) that describe the changed content.
4. `python3 tools/regen_check.py --update`, then replace any `TODO` reasons with real ones.
5. Never regenerate worldgen or textures for a live world without a backup: the change applies to newly
   generated chunks and to freshly built assets.
