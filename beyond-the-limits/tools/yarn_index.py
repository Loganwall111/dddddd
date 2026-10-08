#!/usr/bin/env python3
"""
yarn_index.py - build a queryable index of the Minecraft 1.21.1 Yarn mappings.

Why this exists
---------------
Beyond the Limits is written against Minecraft 1.21.1 / Yarn 1.21.1+build.3.
Because this machine cannot run Gradle (no Minecraft jar can be downloaded in the
build sandbox), we instead verify every Minecraft API call we write against the
*authoritative* Yarn mapping files, which contain the real obfuscated ->
intermediary -> named mapping for every class, field, method, parameter and
descriptor.

Usage
-----
    python3 tools/yarn_index.py build   [path-to-yarn-clone]     # writes tools/.yarn_index.json
    python3 tools/yarn_index.py class   net.minecraft.world.World
    python3 tools/yarn_index.py method  World.spawnParticles
    python3 tools/yarn_index.py desc    "(Lnet/minecraft/class_1937;DDDI)V"
    python3 tools/yarn_index.py audit   src/main/java            # scan sources, report unknown members
"""

from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
INDEX_PATH = os.path.join(HERE, ".yarn_index.json")
DEFAULT_YARN = os.environ.get("YARN_CLONE", "/tmp/ref/yarn")

CLASS_RE = re.compile(r"^CLASS\s+(\S+)(?:\s+(\S+))?")
INNER_CLASS_RE = re.compile(r"^\tCLASS\s+(\S+)(?:\s+(\S+))?")
MEMBER_RE = re.compile(r"^\t+(METHOD|FIELD)\s+(\S+)\s+(\S+)(?:\s+(\S+))?")
ARG_RE = re.compile(r"^\t+ARG\s+(\d+)(?:\s+(\S+))?")


def _looks_like_descriptor(token: str) -> bool:
    if not token:
        return False
    if token.startswith("(") or token.startswith("[") or token.startswith("L"):
        return True
    return token in ("V", "Z", "B", "C", "S", "I", "J", "F", "D")


def _split_descriptor(desc: str):
    """Very small JVM descriptor splitter: '(DDDLnet/minecraft/class_1;)V' -> ([...], ret)."""
    out, ret = [], ""
    i = 0
    while i < len(desc):
        c = desc[i]
        if c == "(":
            i += 1
            while desc[i] != ")":
                t, i = _one(desc, i)
                out.append(t)
            i += 1
            ret, i = _one(desc, i)
            break
        i += 1
    return out, ret


def _one(desc: str, i: int):
    depth = 0
    while desc[i] == "[":
        depth += 1
        i += 1
    if desc[i] == "L":
        j = desc.index(";", i)
        t = desc[i + 1: j]
        return ("[" * depth) + t, j + 1
    return ("[" * depth) + desc[i], i + 1


def build(yarn_dir: str):
    classes = {}
    method_names = defaultdict(set)      # simple name -> [class, descriptor]
    field_names = defaultdict(set)
    root = os.path.join(yarn_dir, "mappings")
    if not os.path.isdir(root):
        sys.exit(f"no mappings directory in {yarn_dir}")
    for dirpath, _dirs, files in os.walk(root):
        for fn in files:
            if not fn.endswith(".mapping"):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, "r", encoding="utf-8") as fh:
                cls = None
                outer = None
                member = None
                for raw in fh:
                    line = raw.rstrip("\n")
                    m = CLASS_RE.match(line)
                    if m:
                        # `CLASS <intermediary> <named>` normally, but unobfuscated classes
                        # (e.g. net/minecraft/server/MinecraftServer) only carry their real name
                        obf, named = (m.group(1), m.group(2)) if m.group(2) else (m.group(1), m.group(1))
                        cls = {
                            "obf": obf,
                            "named": named,
                            "methods": {},
                            "fields": {},
                            "path": os.path.relpath(path, yarn_dir),
                        }
                        classes[named] = cls
                        outer = cls
                        continue
                    m = INNER_CLASS_RE.match(line)
                    if m and cls is not None:
                        # inner classes are declared inside the outer class's file
                        simple = m.group(2) or m.group(1)
                        obf_inner = m.group(1)
                        inner = f"{outer['named'] if outer else cls['named']}${simple}"
                        cls = {
                            "obf": obf_inner,
                            "named": inner,
                            "methods": {},
                            "fields": {},
                            "path": os.path.relpath(path, yarn_dir),
                        }
                        classes[inner] = cls
                        continue
                    m = MEMBER_RE.match(line)
                    if m and cls is not None:
                        parts = line.strip().split()
                        kind = parts[0]
                        rest = parts[1:]

                        # mapping file columns: <kind> [<intermediary>] <named> [descriptor]
                        # constructors have no intermediary name, so the descriptor is what tells
                        # us which token is the member name.
                        if len(rest) >= 2 and _looks_like_descriptor(rest[-1]):
                            name, desc = rest[-2], rest[-1]
                        else:
                            name, desc = rest[-1], ""
                        if kind == "METHOD":
                            cls["methods"].setdefault(name, []).append(desc)
                            method_names[name].add(f"{cls['named']}|{desc}")
                        else:
                            cls["fields"].setdefault(name, []).append(desc)
                            field_names[name].add(f"{cls['named']}|{desc}")
                        member = (kind, name)
                        continue
                    m = ARG_RE.match(line)
                    if m and cls is not None and member is not None:
                        cls.setdefault("args", {}).setdefault(f"{member[1]}", {})[m.group(1)] = m.group(2)
    index = {
        "classes": classes,
        "method_names": {k: sorted(v) for k, v in method_names.items()},
        "field_names": {k: sorted(v) for k, v in field_names.items()},
        "obf_to_named": {c["obf"]: n for n, c in classes.items()},
    }
    with open(INDEX_PATH, "w", encoding="utf-8") as fh:
        json.dump(index, fh)
    print(f"indexed {len(classes)} classes, {len(method_names)} method names, "
          f"{len(field_names)} field names -> {INDEX_PATH}")


def load():
    if not os.path.exists(INDEX_PATH):
        sys.exit("run `python3 tools/yarn_index.py build` first")
    with open(INDEX_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def readable(desc: str, idx):
    """Turn an obfuscated JVM descriptor into readable types using the mapping index."""
    def ty(t: str) -> str:
        if t.startswith("["):
            return ty(t[1:]) + "[]"
        if t in ("V", "Z", "B", "C", "S", "I", "J", "F", "D"):
            return {"V": "void", "Z": "boolean", "B": "byte", "C": "char", "S": "short",
                    "I": "int", "J": "long", "F": "float", "D": "double"}[t]
        if t.startswith("net/minecraft/class_"):
            return idx["obf_to_named"].get(t, t)
        return t.replace("/", ".")
    if "(" not in desc:
        return ty(desc)
    args, ret = _split_descriptor(desc)
    return "(" + ", ".join(ty(a) for a in args) + ") -> " + ty(ret)


def cmd_class(idx, needle: str):
    hits = [n for n in idx["classes"] if needle.lower() in n.lower().replace("/", ".")]
    for n in sorted(hits)[:40]:
        c = idx["classes"][n]
        print(f"# {n}   (obf {c['obf']})")
        for name, descs in sorted(c["methods"].items()):
            for d in descs:
                print(f"    {name}{readable(d, idx)}")
        for name, descs in sorted(c["fields"].items()):
            for d in descs:
                print(f"    {name}: {readable(d, idx)}")
        print()


def cmd_method(idx, needle: str):
    name = needle.split(".")[-1]
    owner = needle.split(".")[0] if "." in needle else None
    for entry in idx["method_names"].get(name, [])[:60]:
        cls, desc = entry.split("|", 1)
        if owner and owner.lower() not in cls.lower():
            continue
        print(f"{cls.split('/')[-1]}.{name}{readable(desc, idx)}")


def cmd_field(idx, needle: str):
    name = needle.split(".")[-1]
    owner = needle.split(".")[0] if "." in needle else None
    for entry in idx["field_names"].get(name, [])[:60]:
        cls, desc = entry.split("|", 1)
        if owner and owner.lower() not in cls.lower():
            continue
        print(f"{cls.split('/')[-1]}.{name}: {readable(desc, idx)}")


def cmd_desc(idx, desc: str):
    print(readable(desc, idx))


def cmd_audit(idx, src: str):
    """Crude but useful: report Minecraft members referenced from Java sources that do not exist."""
    known_classes = set(idx["classes"])
    known_simple = {n.split("/")[-1]: n for n in known_classes}
    unknown = []
    for dirpath, _dirs, files in os.walk(src):
        for fn in files:
            if not fn.endswith(".java"):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, "r", encoding="utf-8") as fh:
                text = fh.read()
            for imp in re.findall(r"^import\s+(net\.minecraft\.[\w.$]+);", text, re.M):
                cls = imp.replace("$", "").replace(".", "/")
                inner_guesses = [cls] + [f"{cls}${i}" for i in re.findall(r"\$(\w+)", imp)]
                if not any(g in known_classes for g in inner_guesses):
                    unknown.append((path, "import", imp))
    for path, kind, what in unknown:
        print(f"{path}: unknown {kind}: {what}")
    print(f"audited: {len(unknown)} suspicious reference(s)")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "build":
        build(sys.argv[2] if len(sys.argv) > 2 else DEFAULT_YARN)
        return
    idx = load()
    if cmd == "class":
        cmd_class(idx, sys.argv[2])
    elif cmd == "method":
        cmd_method(idx, sys.argv[2])
    elif cmd == "field":
        cmd_field(idx, sys.argv[2])
    elif cmd == "desc":
        cmd_desc(idx, sys.argv[2])
    elif cmd == "audit":
        cmd_audit(idx, sys.argv[2])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
