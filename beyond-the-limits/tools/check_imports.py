#!/usr/bin/env python3
"""Resolves every com.beyondthelimits import against the files that actually exist.

This is the check that would have caught `import com.beyondthelimits.registry.BtlFluids` before the
compiler did: a mod-internal import must point at a real source file (or a nested type inside one).
Run it after adding a class, and before pushing.
"""
import os
import re
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "java")
PREFIX = "com.beyondthelimits."


def collect_types():
    """Every top-level and nested type name the mod defines, keyed by fully qualified name."""
    types = set()

    for root, _, files in os.walk(SRC):
        for name in files:
            if not name.endswith(".java"):
                continue
            path = os.path.join(root, name)
            package = None
            with open(path) as handle:
                text = handle.read()
            match = re.search(r"^package\s+([\w.]+);", text, re.M)
            if match:
                package = match.group(1)
            for type_match in re.finditer(r"^\s*(?:public\s+|abstract\s+|final\s+|sealed\s+|static\s+)*"
                                          r"(?:class|interface|enum|record)\s+(\w+)", text, re.M):
                if package:
                    types.add(f"{package}.{type_match.group(1)}")
    return types


def main():
    types = collect_types()
    problems = []
    checked = 0

    for root, _, files in os.walk(SRC):
        for name in files:
            if not name.endswith(".java"):
                continue
            path = os.path.join(root, name)
            with open(path) as handle:
                lines = handle.readlines()
            for number, line in enumerate(lines, 1):
                match = re.match(r"\s*import\s+(?:static\s+)?(" + re.escape(PREFIX) + r"[\w.]+);", line)
                if not match:
                    continue
                checked += 1
                target = match.group(1)
                # A static import ends at the member name: strip trailing members until it resolves.
                while target not in types and "." in target[len(PREFIX):]:
                    target = target.rsplit(".", 1)[0]
                if target not in types:
                    problems.append((path, number, match.group(1)))

    for path, number, target in problems:
        print(f"{os.path.relpath(path, SRC)}:{number}: unresolved import {target}")
    print(f"imports checked: {checked}, unresolved: {len(problems)}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
