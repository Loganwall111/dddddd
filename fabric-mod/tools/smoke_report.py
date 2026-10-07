#!/usr/bin/env python3
"""Turn a dedicated-server smoke-test log into GitHub annotations; exit 1 on any problem."""
import re, sys
from pathlib import Path

log = Path(sys.argv[1]).read_text(errors="replace").splitlines()
PATTERNS = [r"/ERROR\]", r"SIFT-SMOKE FAIL", r"Unknown or incomplete command", r"Incorrect argument", r"Unable to summon",
            r"Failed to (load|parse)", r"Couldn't (load|parse|place)", r"Could not (find|parse)", r"Registry loading errors",
            r"Failed to place feature", r"Unknown (function|feature|entity|biome)", r"Expected ", r"Exception"]
IGNORE = [r"SIFT-SMOKE > ", r"Failed to load properties", r"Ambiguity between arguments", r"Can't keep up", r"eula"]
problems = []
for i, line in enumerate(log):
    if any(re.search(p, line) for p in PATTERNS) and not any(re.search(p, line) for p in IGNORE):
        cmd = next((log[j] for j in range(i, max(-1, i - 4), -1) if "SIFT-SMOKE >" in log[j]), "")
        block = "\n".join(([cmd] if cmd and cmd != line else []) + log[i:i + 8])
        problems.append(block)
done = any("SIFT-SMOKE DONE" in l for l in log)
started = any("SIFT-SMOKE enabled" in l for l in log)
summary = [l for l in log if "SIFT-SMOKE" in l or "#smoke_" in l or "The nearest" in l or "Placed feature" in l
           or "Summoned new" in l or "has " in l and "scores" in l]
print("\n".join(summary[-80:]))

def annotate(title, text):
    text = text[:3500].replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error title={title}::{text}")

if not started:
    annotate("Smoke test", "SIFT-SMOKE never enabled; server did not start the mod.\n" + "\n".join(log[-60:]))
if started and not done:
    annotate("Smoke test", "Server did not reach SIFT-SMOKE DONE (hang/crash).\n" + "\n".join(log[-60:]))
compact = []
for p in problems:
    first = " | ".join(l.strip()[-170:] for l in p.splitlines()[:2])
    if first not in compact:
        compact.append(first)
if compact:
    annotate("All smoke problems (compact)", "\n".join(compact[:40]))
seen = set()
for p in problems:
    key = p.splitlines()[0][-160:]
    if key in seen:
        continue
    seen.add(key)
    annotate("Server runtime error", p)
    if len(seen) >= 7:
        break
sys.exit(1 if problems or not done else 0)
