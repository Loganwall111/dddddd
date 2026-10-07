#!/usr/bin/env python3
"""Build docs/runtime/index.html: the gallery of real in-client captures.

Every image listed here was produced by ClientSmoke (the in-world integration
harness) inside the GitHub Actions client run -- these are unedited Minecraft
frames, not mockups.  The script is deterministic: it sorts captures by their
`beyond-NN-...` prefix and renders them relative to the gallery, so the page
works from the checked-out repository (and in the Actions run summary viewer).
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

CAPTIONS = {
    "loading-diagnostic": "Client reached the loading screen with the mod's resources resolved",
    "witness": "First witnessed frame inside a Beyond world",
    "singularity": "Singularity core, up close",
    "membrane": "Reality membrane holding the surface together",
    "generated-realm": "A generated realm plate from the multiverse table",
    "field-guide": "Field guide open in the player's hand",
    "sky-well": "Sky well -- the lens climbing out of the atmosphere",
    "spaghettification": "Tidal spaghettification: the player stretched along the well axis",
    "tear": "A reality tear opened through the membrane",
    "between": "The Between -- the space behind the surface",
    "fractal": "Arrival pad of the fractal realm",
    "labyrinth": "Labyrinth chamber, maze walls at the fixture bounds",
    "time-tunnel": "Time tunnel / wormhole corridor",
    "native-depth-occlusion": "Lens occlusion against real foreground geometry (native depth buffer)",
    "singularity-horizon": "Standing on the edge of the singularity horizon",
    "flux-storm": "Flux storm weather over a collapsing well",
}

PREFIX = re.compile(r"^beyond-(\d+)-(.+)$")


def caption(name: str) -> str:
    stem = name[:-4] if name.endswith(".png") else name
    m = PREFIX.match(stem)
    if not m:
        return html.escape(stem)
    _, slug = m.groups()
    reality = re.fullmatch(r"reality-(\d+)", slug)
    if reality:
        return f"Reality lens {reality.group(1)} -- the world recoloured through the lens grade"
    lens = re.fullmatch(r"lens-(\d+)", slug)
    if lens:
        return f"Reality lens {lens.group(1)} -- world seen through the lens post-process"
    if slug in CAPTIONS:
        return CAPTIONS[slug]
    return slug.replace("-", " ").capitalize()


def _natural(text: str):
    """Split a slug into text/number runs so reality-10 sorts after reality-9."""
    return tuple(
        (0, int(part)) if part.isdigit() else (1, part)
        for part in re.split(r"(\d+)", text)
        if part != ""
    )


def order_key(name: str):
    m = PREFIX.match(name)
    if not m:
        return (1, 0, ((1, name),))
    return (0, int(m.group(1)), _natural(m.group(2)))


def load_verification(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def render(folder: Path, images: list[str], verification: dict) -> str:
    shots = verification.get("artifacts", {})
    if not isinstance(shots, dict):
        shots = {}
    rows = []
    for name in images:
        meta = shots.get(name, {})
        size = f"{meta.get('bytes', 0) / 1000:.0f} kB" if meta.get("bytes") else ""
        rows.append(
            f"""      <figure>
        <img src="{html.escape(name)}" alt="{html.escape(caption(name))}" loading="lazy">
        <figcaption><b>{html.escape(name)}</b><br>{caption(name)}{f'<br><span class="meta">{size}</span>' if size else ''}</figcaption>
      </figure>"""
        )

    checks = verification.get("checks", {})
    check_rows = "\n".join(
        f"        <li><span>{html.escape(str(k))}</span><b>{html.escape(str(v))}</b></li>" for k, v in checks.items()
    )
    jar = shots.get("beyond-minecraft-0.1.0-alpha.jar", {})
    run_url = verification.get("run_url", "")
    commit = verification.get("source_commit", "")
    header_meta = []
    if run_url:
        header_meta.append(f'<a href="{html.escape(run_url)}">workflow run</a>')
    if commit:
        header_meta.append(f"<code>{html.escape(commit[:12])}</code>")
    if jar.get("sha256"):
        header_meta.append(f"jar sha256 <code>{html.escape(jar['sha256'][:16])}...</code>")

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Beyond the Threshold -- in-client capture gallery</title>
<style>
  :root {{ color-scheme: dark; }}
  body {{ margin: 0; padding: 2rem clamp(1rem, 4vw, 4rem) 4rem; background: #0b0a12; color: #e8e6f2;
         font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }}
  h1 {{ font-size: clamp(1.4rem, 3vw, 2.1rem); margin: 0 0 .35rem; letter-spacing: .01em; }}
  .lede {{ color: #a9a4c4; max-width: 62ch; margin: 0 0 1.2rem; }}
  .hud {{ display: flex; flex-wrap: wrap; gap: .6rem 1.2rem; align-items: center; margin: 0 0 1.6rem;
          color: #bdb8d8; font-size: .9rem; }}
  .hud a {{ color: #9fd0ff; }}
  .checks {{ display: flex; flex-wrap: wrap; gap: .5rem; list-style: none; padding: 0; margin: 0; }}
  .checks li {{ background: #181631; border: 1px solid #2b2850; border-radius: .6rem; padding: .35rem .7rem;
                 display: flex; gap: .5rem; font-size: .85rem; }}
  .checks b {{ color: #7ee2a8; }}
  .grid {{ display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 22rem), 1fr)); }}
  figure {{ margin: 0; background: #14122a; border: 1px solid #2b2850; border-radius: .9rem; overflow: hidden;
            display: flex; flex-direction: column; }}
  figure img {{ display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; object-fit: cover; background: #000; }}
  figcaption {{ padding: .7rem .85rem .85rem; color: #cfcae8; font-size: .88rem; }}
  figcaption b {{ color: #ffffff; font-size: .8rem; letter-spacing: .02em; }}
  .meta {{ color: #8d88ab; }}
</style>
</head>
<body>
  <h1>Beyond the Threshold &mdash; real in-client captures</h1>
  <p class="lede">Every frame below was taken by the mod's own integration harness running a real
     Minecraft client inside the GitHub Actions workflow (software GL, Xvfb). Nothing here is a
     mockup or an offline render: the client walked the worlds, opened the lens, tore the membrane
     and photographed what it saw.</p>
  <div class="hud">
    <span>{len(images)} captures</span>
    <ul class="checks">
{check_rows}
    </ul>
    <span>{' &middot; '.join(header_meta)}</span>
  </div>
  <div class="grid">
{chr(10).join(rows)}
  </div>
</body>
</html>
"""


def render_markdown(folder: Path, images: list[str], verification: dict) -> str:
    """GitHub renders this one, so the captures are readable without leaving the repo."""
    checks = verification.get("checks", {})
    jar = verification.get("artifacts", {}).get("beyond-minecraft-0.1.0-alpha.jar", {})
    lines = [
        "# Beyond the Threshold — real in-client captures",
        "",
        "These frames were taken by the mod's own integration harness driving a real Minecraft client",
        "inside the GitHub Actions workflow (Mesa software GL, Xvfb). Nothing here is a mockup: the",
        "client travelled the worlds, opened the lens, tore the membrane and photographed the result.",
        "",
    ]
    if verification.get("run_url"):
        lines.append(f"**Workflow run:** {verification['run_url']}")
    if verification.get("source_commit"):
        lines.append(f"**Verified source commit:** `{verification['source_commit']}`")
    if checks:
        summary = ", ".join(f"{k}={v}" for k, v in checks.items())
        lines.append(f"**Checks:** {summary}")
    if jar.get("sha256"):
        lines.append(f"**Installable alpha:** {jar.get('bytes', 0)} bytes, SHA-256 `{jar['sha256']}`")
    lines += ["", f"**{len(images)} captures**, in playtest order.", ""]
    for name in images:
        lines.append(f"### {caption(name)}")
        lines.append("")
        lines.append(f"![{caption(name)}]({name})")
        lines.append("")
        lines.append(f"`{name}`")
        lines.append("")
    return "\n".join(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("folder", nargs="?", default="docs/runtime", type=Path)
    ap.add_argument("--verification", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=None,
                    help="HTML gallery path (default: <folder>/index.html); the Markdown twin is written next to it)")

    args = ap.parse_args()

    folder: Path = args.folder
    if not folder.is_dir():
        print(f"error: {folder} is not a directory", file=sys.stderr)
        return 2

    images = sorted((p.name for p in folder.glob("beyond-*.png")), key=order_key)
    if not images:
        print(f"error: no beyond-*.png captures found in {folder}", file=sys.stderr)
        return 2

    verification = load_verification(args.verification or folder / "verification.json")
    out = args.out or folder / "index.html"
    out.write_text(render(folder, images, verification))
    markdown = out.with_name("GALLERY.md") if out.name == "index.html" else out.with_suffix(".md")
    markdown.write_text(render_markdown(folder, images, verification))

    for name in images:
        print(f"  {name}  --  {caption(name)}")
    print(f"wrote {out} and {markdown} ({len(images)} captures)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
