#!/usr/bin/env python3
"""Regenerate the core-shader descriptor JSON from the GLSL source.

The descriptor and the shader must declare exactly the same uniforms and samplers (validate.py
enforces it), so this keeps them in lockstep instead of letting two hand-edited files drift.
"""
from __future__ import annotations
import json
from pathlib import Path
import re
import sys

CORE = Path(__file__).resolve().parents[1] / "src/main/resources/assets/beyond/shaders/core"
MATRICES = {"InverseProjection", "Projection", "CameraToWorld", "WorldToCamera"}
VECTORS = {"Resolution": 2, "CameraPosition": 3, "WitnessDirection": 3, "WitnessAnchor": 4,
           "Node0": 4, "Node1": 4, "Node2": 4, "Node3": 4, "Node4": 4, "Node5": 4,
           "Style0": 4, "Style1": 4, "Style2": 4, "Style3": 4, "Style4": 4, "Style5": 4}
DEFAULTS = {"WitnessDirection": [0, 0.48, -1], "WitnessAnchor": [0, 0, 0, 0]}


def build(name: str):
    source = (CORE / (name + ".fsh")).read_text()
    uniforms = re.findall(r"^uniform\s+(\w+)\s+(\w+)\s*;", source, flags=re.MULTILINE)
    samplers = [uniform for kind, uniform in uniforms if kind == "sampler2D"]
    declared = [(kind, uniform) for kind, uniform in uniforms if kind != "sampler2D"]
    descriptor = {
        "blend": {"func": "add", "srcrgb": "one", "dstrgb": "zero"},
        "vertex": "beyond:fullscreen",
        "fragment": "beyond:" + name,
        "attributes": ["Position", "UV0"],
        "samplers": [{"name": sampler} for sampler in samplers],
        "uniforms": [],
    }
    for kind, uniform in declared:
        if uniform in MATRICES:
            count, values = 16, [1 if i % 5 == 0 else 0 for i in range(16)]
        else:
            count = VECTORS.get(uniform, 1)
            values = DEFAULTS.get(uniform, [0] * count)
        descriptor["uniforms"].append({"name": uniform, "type": "matrix4x4" if uniform in MATRICES else "float",
                                       "count": count, "values": values})
    return descriptor


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "--check":
        for path in sorted(CORE.glob("*.json")):
            expected = build(path.stem)
            if json.loads(path.read_text()) != expected:
                print(f"{path.name} is out of date; run sync_shader_json.py", file=sys.stderr)
                return 1
        print("PASS: shader descriptors match their GLSL sources.")
        return 0
    for path in sorted(CORE.glob("*.json")):
        path.write_text(json.dumps(build(path.stem), indent=2) + "\n")
        print(f"wrote {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
