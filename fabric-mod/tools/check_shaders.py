#!/usr/bin/env python3
"""Compile-check every Iris program in the shaderpack with glslangValidator.

Expands `#include "/..."` the way Iris does (paths are relative to shaders/), checks that
#version is the first directive, then compiles each world_*/ and root program as GLSL 1.20.
Usage: check_shaders.py [path/to/glslangValidator]   (skips compile if the tool is missing)
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "shaderpack/shaders"
INC = re.compile(r'^\s*#include\s+"([^"]+)"\s*$')


def expand(path: Path, seen=()) -> list[str]:
    if path in seen:
        raise SystemExit(f"include cycle: {path}")
    out = []
    for line in path.read_text().splitlines():
        m = INC.match(line)
        if m:
            target = ROOT / m.group(1).lstrip("/") if m.group(1).startswith("/") else path.parent / m.group(1)
            if not target.exists():
                raise SystemExit(f"{path.relative_to(ROOT)}: missing include {m.group(1)}")
            out += expand(target, seen + (path,))
        else:
            out.append(line)
    return out


def main():
    tool = sys.argv[1] if len(sys.argv) > 1 else shutil.which("glslangValidator")
    programs = sorted(p for p in ROOT.rglob("*") if p.suffix in (".vsh", ".fsh") and p.parent.name != "program")
    errors = 0
    with tempfile.TemporaryDirectory() as tmp:
        for prog in programs:
            lines = expand(prog)
            directives = [l.strip() for l in lines if l.strip() and not l.strip().startswith("//")]
            if not directives or not directives[0].startswith("#version"):
                print(f"FAIL {prog.relative_to(ROOT)}: #version must be the first directive (got {directives[:1]})")
                errors += 1
                continue
            if sum(1 for l in lines if l.strip().startswith("#version")) != 1:
                print(f"FAIL {prog.relative_to(ROOT)}: more than one #version after includes")
                errors += 1
                continue
            if not tool:
                continue
            stage = "vert" if prog.suffix == ".vsh" else "frag"
            out = Path(tmp) / (prog.relative_to(ROOT).as_posix().replace("/", "__") + "." + stage)
            out.write_text("\n".join(lines) + "\n")
            r = subprocess.run([tool, str(out)], capture_output=True, text=True)
            if r.returncode != 0:
                errors += 1
                print(f"FAIL {prog.relative_to(ROOT)}\n{r.stdout}{r.stderr}")
            else:
                print(f"ok   {prog.relative_to(ROOT)}")
    errors += check_core(tool)
    if not tool:
        print(f"structure ok for {len(programs)} programs (glslangValidator not found; compile skipped)")
    sys.exit(1 if errors else 0)


CORE = Path(__file__).resolve().parents[1] / "src/main/resources/assets/entersift/shaders/core"
VANILLA = Path(__file__).resolve().parent / "vanilla_includes"
CORE_INC = re.compile(r'^\s*#include\s+<minecraft:([a-z_]+\.glsl)>\s*$')


def check_core(tool) -> int:
    """0.17: compile the mod's own core shaders (rift) as GLSL 330, with vanilla includes expanded.

    A core shader that fails to compile crashes the game when its pipeline is first used, so this
    runs in CI. Every program is checked with and without each #ifdef variant it uses."""
    errors = 0
    with tempfile.TemporaryDirectory() as tmp:
        for prog in sorted(CORE.glob("*.[vf]sh")):
            lines = []
            for line in prog.read_text().splitlines():
                m = CORE_INC.match(line)
                if m:
                    inc = VANILLA / m.group(1)
                    if not inc.exists():
                        print(f"FAIL core/{prog.name}: vanilla include {m.group(1)} not vendored in tools/vanilla_includes")
                        errors += 1
                        break
                    lines += inc.read_text().splitlines()
                else:
                    lines.append(line)
            if not tool:
                continue
            variants = [None] + sorted(set(re.findall(r'(?:#ifdef\s+|defined\s*\(\s*)((?:RIFT|TUNNEL)_[A-Z_]+)', prog.read_text())))
            for define in variants:
                src = list(lines)
                if define:
                    src.insert(2, f"#define {define}")
                stage = "vert" if prog.suffix == ".vsh" else "frag"
                out = Path(tmp) / f"core__{prog.stem}__{define or 'base'}.{stage}"
                out.write_text("\n".join(src) + "\n")
                r = subprocess.run([tool, str(out)], capture_output=True, text=True)
                if r.returncode != 0:
                    errors += 1
                    print(f"FAIL core/{prog.name} [{define or 'base'}]\n{r.stdout}{r.stderr}")
                else:
                    print(f"ok   core/{prog.name} [{define or 'base'}]")
    return errors


if __name__ == "__main__":
    main()
