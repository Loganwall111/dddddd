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
MATRICES = {"InverseProjection", "Projection", "CameraToWorld", "WorldToCamera", "TitanModel"}
VECTORS = {"Resolution": 2, "CameraPosition": 3, "WitnessDirection": 3, "WitnessAnchor": 4,
           "Node0": 4, "Node1": 4, "Node2": 4, "Node3": 4, "Node4": 4, "Node5": 4,
           "Style0": 4, "Style1": 4, "Style2": 4, "Style3": 4, "Style4": 4, "Style5": 4,
           "Bone0": 4, "Bone1": 4, "Bone2": 4, "Bone3": 4, "Bone4": 4, "Bone5": 4,
           "Axis0": 3, "Axis1": 3, "Axis2": 3, "Axis3": 3, "Axis4": 3, "Axis5": 3}
DEFAULTS = {"WitnessDirection": [0, 0.48, -1], "WitnessAnchor": [0, 0, 0, 0]}
# Shaders that draw their own geometry declare their own vertex stage, attributes and uniforms.
VERTICES = {
    "titan": {"vertex": "beyond:titan", "attributes": ["Position", "UV0", "Color"]},
}
DEFAULT_VERTEX = {"vertex": "beyond:fullscreen", "attributes": ["Position", "UV0"]}
# The engine always supplies these; a core-shader descriptor must never declare them.
GLOBALS = {"ModelViewMat", "ProjMat", "ModelOffset", "TextureMat", "ColorModulator", "FogStart",
           "FogEnd", "FogColor", "FogShape", "Light0_Direction", "Light1_Direction", "GlintAlpha",
           "LineWidth", "ScreenSize", "GameTime"}


def declared_in(source: str):
    return re.findall(r"^uniform\s+(\w+)\s+(\w+)\s*;", source, flags=re.MULTILINE)


def build(name: str):
    fragment = (CORE / (name + ".fsh")).read_text()
    vertex = VERTICES.get(name, DEFAULT_VERTEX)
    uniforms = declared_in(fragment)
    samplers = [uniform for kind, uniform in uniforms if kind == "sampler2D"]
    declared = [(kind, uniform) for kind, uniform in uniforms if kind != "sampler2D"]
    # The program is the vertex stage plus the fragment stage, so the descriptor must cover both.
    for kind, uniform in declared_in((CORE / (vertex["vertex"].split(":")[1] + ".vsh")).read_text()):
        if kind == "sampler2D" or uniform in GLOBALS or uniform in [name for _, name in declared]:
            continue
        declared.append((kind, uniform))
    descriptor = {
        "blend": {"func": "add", "srcrgb": "one", "dstrgb": "zero"},
        "vertex": vertex["vertex"],
        "fragment": "beyond:" + name,
        "attributes": list(vertex["attributes"]),
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
        for program in sorted(CORE.glob("*.fsh")):
            path = program.with_suffix(".json")
            if not path.is_file() or json.loads(path.read_text()) != build(program.stem):
                print(f"{path.name} is out of date; run sync_shader_json.py", file=sys.stderr)
                return 1
        print("PASS: shader descriptors match their GLSL sources.")
        return 0
    for program in sorted(CORE.glob("*.fsh")):
        path = program.with_suffix(".json")
        path.write_text(json.dumps(build(program.stem), indent=2) + "\n")
        print(f"wrote {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
