#!/usr/bin/env python3
"""Offline integrity checks for Beyond the Threshold:
- every .json parses
- post pipelines reference existing program jsons + fragment shaders
- program jsons reference existing fragment shaders (and minecraft vertex shaders by name only)
- models' textures/parents resolve to files (or vanilla parents)
- fabric.mod.json entrypoint classes exist
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
errors = []


def jload(p: Path):
    try:
        return json.loads(p.read_text())
    except Exception as e:
        errors.append(f"{p.relative_to(ROOT)}: {e}")
        return None


for p in sorted(RES.rglob("*.json")):
    jload(p)

# post -> program -> fragment
for post in sorted((RES / "assets/beyondthreshold/shaders/post").glob("*.json")):
    d = jload(post)
    if not d:
        continue
    for t in d.get("targets", []):
        if t not in ("minecraft:main", "minecraft:alt") and not isinstance(t, dict):
            pass  # named swap targets are fine
    for pas in d.get("passes", []):
        name = pas["name"]
        if name.startswith("minecraft:"):
            continue
        pj = RES / "assets" / name.split(":")[0] / "shaders/program" / (name.split(":")[1] + ".json")
        if not pj.exists():
            errors.append(f"{post.name}: missing program {name}")
            continue
        prog = jload(pj)
        frag = prog.get("fragment", "")
        fp = RES / "assets" / frag.split(":")[0] / "shaders/program" / (frag.split(":")[1] + ".fsh")
        if not fp.exists():
            errors.append(f"{pj.relative_to(ROOT)}: missing fragment {frag}")

# every raw GL shader has both stages
for name in ["sky/cosmic", "fx/blackhole", "fx/eye", "fx/tear"]:
    for ext in (".vsh", ".fsh"):
        if not (RES / "assets/beyondthreshold/shaders" / (name + ext)).exists():
            errors.append(f"missing raw shader {name}{ext}")

# models resolve
for m in sorted((RES / "assets/beyondthreshold/models").rglob("*.json")):
    d = jload(m)
    if not d:
        continue
    parent = d.get("parent", "")
    if parent.startswith("beyondthreshold:"):
        pp = RES / "assets/beyondthreshold/models" / (parent.split(":", 1)[1] + ".json")
        if not pp.exists():
            errors.append(f"{m.relative_to(ROOT)}: missing parent {parent}")
    for t in d.get("textures", {}).values():
        if t.startswith("beyondthreshold:"):
            tp = RES / "assets/beyondthreshold/textures" / (t.split(":", 1)[1] + ".png")
            if not tp.exists():
                errors.append(f"{m.relative_to(ROOT)}: missing texture {t}")

# entrypoints exist
fm = jload(RES / "fabric.mod.json")
for ep_list in fm.get("entrypoints", {}).values():
    for ep in ep_list:
        cls = ep.replace(".", "/") + ".java"
        if not (ROOT / "src/main/java" / cls).exists():
            errors.append(f"missing entrypoint class {ep}")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("validate.py: all integrity checks passed")
