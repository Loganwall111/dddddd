#!/usr/bin/env python3
"""Compact, inspectable GitHub annotations + a verifiable evidence manifest (no credentials)."""
import hashlib
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]

def annotation(level, title, message):
    message = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::{level} title={title}::{message}")

def main():
    reports = list((ROOT / "build/test-results/test").glob("TEST-*.xml"))
    total = failures = errors = 0
    for path in reports:
        node = ET.parse(path).getroot()
        total += int(node.attrib.get("tests", 0)); failures += int(node.attrib.get("failures", 0)); errors += int(node.attrib.get("errors", 0))
    logs = {}
    for name in ("build", "server", "client"):
        path = ROOT / (name + "-smoke.log")
        logs[name] = path.read_text(errors="replace") if path.exists() else ""
    checks = {
        "junit_tests": total, "junit_failures": failures + errors,
        "server_realms_and_journey": "BEYOND_SERVER_SMOKE_PASS" in logs["server"],
        "client_native_glsl": "BEYOND_CLIENT_SHADER_SMOKE_PASS" in logs["client"],
        "client_in_world_integration": "BEYOND_CLIENT_INTEGRATION_PASS" in logs["client"],
    }
    report = {"source_commit": os.environ.get("GITHUB_SHA", "local"), "run_url": "https://github.com/" + os.environ.get("GITHUB_REPOSITORY", "Loganwall111/dddddd") + "/actions/runs/" + os.environ.get("GITHUB_RUN_ID", ""),
              "checks": checks, "artifacts": {}}
    artifacts = list((ROOT / "build/libs").glob("*.jar")) + list((ROOT / "run/screenshots").glob("beyond-*.png"))
    for path in artifacts:
        report["artifacts"][path.name] = {"bytes": path.stat().st_size, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
    out = ROOT / "build/verification.json"; out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2) + "\n")
    annotation("notice", "Beyond verification summary", json.dumps(report))
    for name, text in logs.items():
        if not text: continue
        lines = text.splitlines()
        failure_lines = [i for i, line in enumerate(lines) if any(key in line for key in ("BEYOND_SERVER_SMOKE_FAIL", "BEYOND_CLIENT_INTEGRATION_FAIL", "BEYOND_CLIENT_SHADER_SMOKE_FAIL", "error:", "Failed to load", "Couldn't parse", "Error loading", "FAILURE:"))]
        if failure_lines:
            start = max(0, failure_lines[0] - 3)
            annotation("error", "Beyond " + name + " diagnostics", "\n".join(lines[start:start + 65])[:12000])
        elif name == "client" and not checks["client_in_world_integration"]:
            annotation("warning", "Beyond incomplete client run", "\n".join(lines[-65:])[:12000])
    return 0

if __name__ == "__main__": main()
