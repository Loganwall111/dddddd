#!/usr/bin/env python3
"""Checks that every translation key the Java references exists in en_us.json.

The Java side builds most keys by concatenation, so this looks for the literal prefixes that appear in
the sources ("beyondthelimits.<something>", "beyondthelimits:<something>" for sounds) and for whole keys,
then reports anything the language file does not define. Run it after adding a message.
"""
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
JAVA = os.path.join(ROOT, "src", "main", "java")
LANG = os.path.join(ROOT, "src", "main", "resources", "assets", "beyondthelimits", "lang", "en_us.json")

# Keys whose suffix is computed at runtime: the Java builds them from an index, so the prefix, not the
# literal, is what has to appear in the language file. Each entry lists every key the code can produce.
DYNAMIC = {
    "message.beyondthelimits.codescape.monolith.": [f"message.beyondthelimits.codescape.monolith.{i}" for i in range(6)],
    "lore.beyondthelimits.statue.": [f"lore.beyondthelimits.statue.{i}" for i in range(6)],
    "hud.beyondthelimits.band.": [f"hud.beyondthelimits.band.{i}" for i in range(5)],
    "rift.beyondthelimits.variant.": [f"rift.beyondthelimits.variant.{i}" for i in range(6)],
}


# Only these namespaces are translation keys. Anything else that mentions "beyondthelimits" in a string
# literal (the mod id, saved-data file names, render layer names) is not translatable and must not be
# reported as a missing key.
NAMESPACES = ("block", "item", "entity", "message", "command", "hud", "book", "screen", "dimension",
              "effect", "lore", "dementia", "rift", "key", "category", "itemGroup", "biome",
              "subtitles", "container", "stat", "death", "text")


def is_translation_key(candidate):
    head = candidate.split(".", 1)[0]
    return head in NAMESPACES


def main():
    with open(LANG) as handle:
        lang = json.load(handle)

    referenced = set()
    for root, _, files in os.walk(JAVA):
        for name in files:
            if not name.endswith(".java"):
                continue
            text = open(os.path.join(root, name)).read()
            for match in re.finditer(r'"(beyondthelimits[.:][A-Za-z0-9_.]+)"', text):
                referenced.add(match.group(1))
            # Prefixes built by concatenation, e.g. "message.beyondthelimits.hud." + index.
            for prefix, keys in DYNAMIC.items():
                if f'"{prefix.rstrip(".")}.' in text:
                    referenced.update(keys)

    missing = []
    for key in sorted(referenced):
        if key.startswith("subtitles"):
            continue
        if ":" in key:
            # A sound event: the language file carries it as a subtitle key.
            normalised = "subtitles.beyondthelimits." + key.split(":", 1)[1]
            if normalised not in lang:
                missing.append(normalised)
            continue
        if not is_translation_key(key):
            continue
        if key not in lang:
            missing.append(key)

    for key in missing:
        print(f"missing lang key: {key}")
    print(f"lang: {len(lang)} keys, referenced {len(referenced)}, missing {len(missing)}")
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
