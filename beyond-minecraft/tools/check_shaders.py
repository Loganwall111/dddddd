#!/usr/bin/env python3
"""Compile AND link native GLSL 150 programs. Missing validator is a failure, never a fake pass."""
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1] / "src/main/resources/assets/beyond/shaders/core"

def main():
    tool = sys.argv[1] if len(sys.argv) > 1 else shutil.which("glslangValidator")
    if not tool:
        print("BLOCKED: glslangValidator is not installed. GLSL compilation was NOT run.", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory(prefix="beyond-glsl-") as directory:
        for descriptor in sorted(ROOT.glob("*.json")):
            data = json.loads(descriptor.read_text())
            stages = []
            for key, extension in (("vertex", "vert"), ("fragment", "frag")):
                source = ROOT / (data[key].split(":")[1] + (".vsh" if key == "vertex" else ".fsh"))
                output = Path(directory) / f"{descriptor.stem}.{extension}"
                output.write_text(source.read_text()); stages.append(str(output))
            result = subprocess.run([tool, "-l", *stages], text=True, capture_output=True)
            if result.returncode:
                print(result.stdout, result.stderr); return 1
            print(f"PASS native GLSL 150 compile + link: {descriptor.stem}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
