#!/usr/bin/env python3
"""Compile-check every GLSL program of Beyond the Threshold with glslangValidator.
Usage: check_shaders.py [path/to/glslangValidator]   (skips compile if missing)"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "src/main/resources"


def main():
    tool = sys.argv[1] if len(sys.argv) > 1 else shutil.which("glslangValidator")
    programs = sorted(p for p in ROOT.rglob("*") if p.suffix in (".vsh", ".fsh"))
    errors = 0
    with tempfile.TemporaryDirectory() as tmp:
        for prog in programs:
            lines = prog.read_text().splitlines()
            directives = [l.strip() for l in lines if l.strip() and not l.strip().startswith("//")]
            if not directives or not directives[0].startswith("#version"):
                print(f"FAIL {prog.relative_to(ROOT)}: #version must be first directive")
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
    if not tool:
        print(f"structure ok for {len(programs)} programs (glslangValidator not found; compile skipped)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
