#!/usr/bin/env python3
"""Compile-check every Iris program in the shaderpack with glslangValidator.

Expands `#include "/..."` the way Iris does (paths are relative to shaders/), checks that
#version is the first directive, then compiles each world_*/ and root program as GLSL 1.20.
Usage: check_shaders.py [path/to/glslangValidator]   (skips compile if the tool is missing)
"""
import re, shutil, subprocess, sys, tempfile
from pathlib import Path

FAILS = []
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


CORE_DIR = Path(__file__).resolve().parents[1] / "src/main/resources/assets/entersift/shaders/core"
DIRECTIVE = re.compile(r"^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b(.*)$")


def strip_comments(text: str):
    """Yield (line_number, code) with // and /* */ comments removed, so directives inside them are ignored."""
    block = False
    for n, line in enumerate(text.splitlines(), 1):
        s = line
        if block:
            if "*/" in s:
                s = s.split("*/", 1)[1]
                block = False
            else:
                yield n, ""
                continue
        s = s.split("//", 1)[0]
        if "/*" in s:
            head, rest = s.split("/*", 1)
            if "*/" in rest:
                s = head + rest.split("*/", 1)[1]
            else:
                s = head
                block = True
        yield n, s


def check_directives(path: Path) -> list[str]:
    """Count #if/#endif nesting. A stray #endif or an unterminated #if makes the whole program fail to
    compile inside Minecraft, which is a hard client crash at resource reload - and neither the Java
    build nor a structure-only scan can see it."""
    depth, problems = 0, []
    for n, line in strip_comments(path.read_text()):
        m = DIRECTIVE.match(line)
        if not m:
            continue
        kind = m.group(1)
        if kind in ("if", "ifdef", "ifndef"):
            depth += 1
        elif kind in ("elif", "else"):
            if depth == 0:
                problems.append(f"{path.name}:{n}: #{kind} with no #if")
        else:
            depth -= 1
            if depth < 0:
                problems.append(f"{path.name}:{n}: extra #endif (no #if to close)")
                depth = 0
    if depth:
        problems.append(f"{path.name}: {depth} unterminated #if/#ifdef (missing #endif)")
    return problems


def check_all_directives() -> int:
    errors = 0
    files = sorted(set(CORE_DIR.glob("*.[vf]sh")) | set(ROOT.rglob("*.glsl")) | set(ROOT.rglob("*.[vf]sh")))
    for prog in files:
        for problem in check_directives(prog):
            print(f"FAIL {prog.relative_to(Path(__file__).resolve().parents[1])}: {problem}")
            errors += 1
    print(f"preprocessor balance ok for {len(files)} shader files")
    return errors


def main():
    errors = check_all_directives()
    tool = sys.argv[1] if len(sys.argv) > 1 else shutil.which("glslangValidator")
    if len(sys.argv) > 1 and not (tool and Path(tool).is_file()):
        # A caller that asked for a compiler must not silently get a structure-only run: that is how a
        # broken shader shipped once already.
        print(f"FAIL: glslangValidator was requested but not found at {tool!r}")
        sys.exit(1)
    programs = sorted(p for p in ROOT.rglob("*") if p.suffix in (".vsh", ".fsh") and p.parent.name != "program")
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
                msg = f"FAIL {prog.relative_to(ROOT)}\n{r.stdout}{r.stderr}"
                print(msg)
                FAILS.append(msg)
            else:
                print(f"ok   {prog.relative_to(ROOT)}")
    errors += check_core(tool)
    if not tool:
        print(f"structure ok for {len(programs)} programs (glslangValidator not found; compile skipped)")
        sys.exit(1 if errors else 0)
    # 0.36: emit the outcome as a GitHub annotation. Log downloads are unavailable in the dev sandbox,
    # but annotations are readable through the API, so this is how the compile result is verifiable.
    version = ""
    try:
        version = subprocess.run([tool, "--version"], capture_output=True, text=True).stdout.strip().splitlines()[0]
    except Exception:
        pass
    if errors:
        # The sandbox cannot download Actions logs. Put the compiler text in the annotation.
        bits = []
        for f in FAILS[:6]:
            lines = [ln.strip() for ln in f.splitlines() if ln.strip()][:3]
            bits.append(" / ".join(lines))
        blob = " || ".join(bits).replace("%", "%25").replace("\r", "").replace("\n", " ")[:3000]
        print(f"::error title=Shader compile FAILED::{errors} problem(s). {blob}")
    else:
        print(f"::notice title=Shaders compiled::{len(programs)} programs and the core shader variants "
              f"compiled clean with {version or tool}")
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
                    msg = f"FAIL core/{prog.name} [{define or 'base'}]\n{r.stdout}{r.stderr}"
                    print(msg)
                    FAILS.append(msg)
                else:
                    print(f"ok   core/{prog.name} [{define or 'base'}]")
    return errors


if __name__ == "__main__":
    main()
