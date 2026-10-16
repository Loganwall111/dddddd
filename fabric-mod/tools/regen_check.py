#!/usr/bin/env python3
"""Regeneration-baseline check: the shipped resources are the source of truth.

The 0.25 overhaul was authored partly by hand, and the historical phase scripts
(generate_data.py, phase4..phase18, ...) no longer reproduce it - several of them crash or
revert newer content (see tools/baseline.json -> "dead"). So instead of pretending the whole
pipeline still regenerates the game, this check pins the *live* generators: it copies the mod
tree to a scratch directory, re-runs every script listed in baseline.json -> "live" in the
declared order, and compares the result with the shipped tree.

    clean            every live script is idempotent for the shipped tree
    known_drift      the only differing paths are the ones documented in baseline.json
                     (with a reason), so nothing changes behind our back
    unexpected       a live script now changes a file that is not documented -> FAIL
    stale            a documented known-drift entry no longer differs -> FAIL (manifest lies)

Usage:
    python3 tools/regen_check.py             # verify (CI)
    python3 tools/regen_check.py --report     # also run the dead scripts and print what they do
    python3 tools/regen_check.py --update     # re-record known_drift after a deliberate change
    python3 tools/regen_check.py -v           # print the full unified diff of every change

Pure standard library, offline, no PIL/numpy needed: it only runs the live scripts.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
MOD = TOOLS.parent
BASELINE = TOOLS / "baseline.json"
SKIP_DIRS = {"build", ".gradle", "run", "__pycache__", ".git"}


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshot(root: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for p in root.rglob("*"):
        if not p.is_file():
            continue
        rel = p.relative_to(root)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        out[rel.as_posix()] = digest(p)
    return out


def run_script(copy: Path, name: str) -> tuple[int, str]:
    script = copy / "tools" / name
    if not script.exists():
        return 127, f"missing script {name}"
    try:
        proc = subprocess.run([sys.executable, name], cwd=copy / "tools",
                              capture_output=True, text=True, timeout=600)
    except subprocess.TimeoutExpired:
        return 124, "timeout after 600s"
    tail = (proc.stderr or proc.stdout).strip().splitlines()
    return proc.returncode, tail[-1] if tail else ""


def diff_tree(before: dict[str, str], after: dict[str, str]) -> dict[str, str]:
    """Paths that differ, mapped to a one-word reason (changed/added/removed)."""
    out: dict[str, str] = {}
    for path in sorted(set(before) | set(after)):
        if before.get(path) != after.get(path):
            out[path] = "added" if path not in before else ("removed" if path not in after else "changed")
    return out


def unified(copy: Path, path: str) -> str:
    """Best-effort unified diff of a changed text file (PNG/JSON binaries are summarised)."""
    original = MOD / path
    working = copy / path
    if not (original.exists() and working.exists()):
        return ""
    a, b = original.read_bytes(), working.read_bytes()
    if b"\x00" in a[:4096] or a[:8] == b"\x89PNG\r\n\x1a\n":
        return f"    binary: {len(a)} -> {len(b)} bytes"
    try:
        al = a.decode("utf-8").splitlines(keepends=True)
        bl = b.decode("utf-8").splitlines(keepends=True)
    except UnicodeDecodeError:
        return f"    binary: {len(a)} -> {len(b)} bytes"
    return "".join(difflib.unified_diff(al, bl, f"shipped/{path}", f"regenerated/{path}", n=1))


def main() -> int:
    ap = argparse.ArgumentParser(description="Verify the live generators reproduce the shipped tree.")
    ap.add_argument("--update", action="store_true", help="re-record known_drift (then document the new entries)")
    ap.add_argument("--report", action="store_true", help="also run the scripts marked dead and report what they change")
    ap.add_argument("-v", "--verbose", action="store_true", help="print a unified diff for every changed file")
    args = ap.parse_args()

    manifest = json.loads(BASELINE.read_text())
    live = [step["script"] for step in manifest["live"]]
    drift_doc = manifest["known_drift"]
    problems: list[str] = []

    with tempfile.TemporaryDirectory(prefix="sift-regen-") as tmp:
        copy = Path(tmp) / "mod"
        shutil.copytree(MOD, copy, ignore=shutil.ignore_patterns(*SKIP_DIRS))
        before = snapshot(copy)

        print(f"live pipeline: {' -> '.join(live)}")
        for name in live:
            rc, note = run_script(copy, name)
            status = "ok" if rc == 0 else f"FAILED rc={rc}"
            print(f"  {name:<24} {status}" + (f"  ({note})" if note else ""))
            if rc != 0:
                problems.append(f"{name} exited {rc}: {note}")

        changed = diff_tree(before, snapshot(copy))

        if args.report:
            print("\ndead scripts (never part of the shipped tree; informational only):")
            for name, reason in manifest["dead"].items():
                rc, note = run_script(copy, name)
                print(f"  {name:<24} rc={rc:<4} {reason}")
                if note:
                    print(f"      last line: {note}")

    unexpected = {p: how for p, how in changed.items() if p not in drift_doc}
    stale = [p for p in drift_doc if p not in changed]

    if changed:
        print("\ndifferences from the shipped tree:")
        for path, how in sorted(changed.items()):
            tag = "documented" if path in drift_doc else "UNEXPECTED"
            print(f"  [{tag}] {path} ({how})")
            if path in drift_doc:
                print(f"      reason: {drift_doc[path]}")
            if args.verbose:
                print(unified(copy, path))

    if args.update:
        resolved = {p: drift_doc.get(p, "TODO: document why this file is not reproduced") for p in changed}
        manifest["known_drift"] = resolved
        BASELINE.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"\nbaseline.json updated: {len(resolved)} known-drift entries")
        for p, reason in resolved.items():
            if reason.startswith("TODO"):
                print(f"  ! {p} needs a reason")
        return 0

    if unexpected:
        problems.append("live generators changed undocumented files: " + ", ".join(sorted(unexpected)))
    if stale:
        problems.append("known_drift entries no longer reproduce: " + ", ".join(stale)
                        + " (fix baseline.json or the generator, then re-run --update)")

    if problems:
        print("\nregen check FAILED:")
        for p in problems:
            print(f"  - {p}")
        print("\nThe shipped resources are the baseline. Fix the generator so it reproduces them, or -"
              " if the new output is intended - review the change, then record it with --update.")
        return 1

    print(f"\nPASS: {len(live)} live generators reproduce the shipped tree"
          + (f" ({len(drift_doc)} documented known-drift files)" if drift_doc else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
