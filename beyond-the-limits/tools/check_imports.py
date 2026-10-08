#!/usr/bin/env python3
"""Static import checks for the mod's Java sources.

Two things are checked, both of which have cost a CI round before:

1. every `com.beyondthelimits.*` import points at a class that actually exists in the source tree;
2. every vanilla class used as `Foo.bar(...)` is imported, which is javac's "cannot find symbol".

Run it after adding a class or a call site; it takes a second and needs no JDK.
"""
import os
import re
import sys

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "java")
PREFIX = "com.beyondthelimits."
SKIP_SIMPLE = ("Math", "System")


def collect_types():
    """Every top-level and nested type name the mod defines, fully qualified."""
    types = set()

    for root, _, files in os.walk(SRC):
        for name in files:
            if not name.endswith(".java"):
                continue
            text = open(os.path.join(root, name)).read()
            match = re.search(r"^package\s+([\w.]+);", text, re.M)
            package = match.group(1) if match else None

            for found in re.finditer(r"^\s*(?:public\s+|abstract\s+|final\s+|sealed\s+|static\s+)*"
                                     r"(?:class|interface|enum|record)\s+(\w+)", text, re.M):
                if package:
                    types.add(f"{package}.{found.group(1)}")
    return types


def check_mod_imports(types):
    problems = []
    checked = 0

    for root, _, files in os.walk(SRC):
        for name in files:
            if not name.endswith(".java"):
                continue
            path = os.path.join(root, name)

            for number, line in enumerate(open(path).readlines(), 1):
                match = re.match(r"\s*import\s+(?:static\s+)?(" + re.escape(PREFIX) + r"[\w.]+);", line)
                if not match:
                    continue

                checked += 1
                target = match.group(1)

                while target not in types and "." in target[len(PREFIX):]:
                    target = target.rsplit(".", 1)[0]

                if target not in types:
                    problems.append((path, number, match.group(1)))

    return checked, problems


def vanilla_simple_names():
    """Simple names of every vanilla class, from the local yarn index."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

    try:
        import yarn_index
    except ImportError:
        return set()

    return {name.rsplit("/", 1)[-1] for name in yarn_index.load()["classes"]
            if name.startswith("net/minecraft/")}


def check_vanilla_imports(vanilla, mod_types):
    problems = []
    string_literal = re.compile(r'"(?:[^"\\]|\\.)*"')
    usage = re.compile(r'(?<![\w."])([A-Z][A-Za-z0-9_]*)(?=\.)')

    for root, _, files in os.walk(SRC):
        for name in files:
            if not name.endswith(".java"):
                continue
            path = os.path.join(root, name)
            lines = open(path).readlines()
            imported = set()

            for line in lines:
                match = re.match(r"\s*import\s+(?:static\s+)?[\w.]+?([A-Za-z]\w*)\s*;", line)
                if match:
                    imported.add(match.group(1))

            seen = set()

            for number, line in enumerate(lines, 1):
                stripped = line.lstrip()
                if stripped.startswith(("import ", "package ", "//", "*", "/*")):
                    continue

                code = string_literal.sub('""', line)

                for found in usage.finditer(code):
                    simple = found.group(1)

                    if simple in imported or simple in mod_types or simple in SKIP_SIMPLE:
                        continue
                    if simple not in vanilla or simple in seen:
                        continue

                    seen.add(simple)
                    problems.append((path, number, simple))

    return problems


def main():
    types = collect_types()
    checked, problems = check_mod_imports(types)

    for path, number, target in problems:
        print(f"{os.path.relpath(path, SRC)}:{number}: unresolved import {target}")

    vanilla = check_vanilla_imports(vanilla_simple_names(), {n.rsplit(".", 1)[-1] for n in types})

    for path, number, simple in vanilla:
        print(f"{os.path.relpath(path, SRC)}:{number}: {simple} is used but never imported")

    print(f"imports checked: {checked}, unresolved: {len(problems)}, unimported vanilla: {len(vanilla)}")
    return 1 if problems or vanilla else 0


if __name__ == "__main__":
    sys.exit(main())
