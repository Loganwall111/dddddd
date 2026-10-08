#!/usr/bin/env python3
"""Fast offline checks for the mod's resource pack and generated content."""
from __future__ import annotations

import json
import re
import struct
import sys
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
ASSETS = RES / "assets"
DATA = RES / "data"
errors: list[str] = []
checked_json = 0


def fail(message: str) -> None:
    errors.append(message)


def load_json(path: Path):
    global checked_json
    try:
        checked_json += 1
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        fail(f"invalid JSON {path.relative_to(ROOT)}: {exc}")
        return None


def resolve_asset(identifier: str, category: str, suffix: str) -> Path | None:
    if ":" in identifier:
        namespace, path = identifier.split(":", 1)
    else:
        namespace, path = "minecraft", identifier
    if namespace == "minecraft":
        return None
    return ASSETS / namespace / category / f"{path}{suffix}"


def check_png(path: Path) -> tuple[int, int] | None:
    try:
        payload = path.read_bytes()
        if payload[:8] != b"\x89PNG\r\n\x1a\n":
            fail(f"bad PNG signature: {path.relative_to(ROOT)}")
            return None
        width, height = struct.unpack(">II", payload[16:24])
        if width <= 0 or height <= 0:
            fail(f"empty PNG: {path.relative_to(ROOT)}")
            return None
        pos = 8
        while pos < len(payload):
            length = struct.unpack(">I", payload[pos:pos + 4])[0]
            kind = payload[pos + 4:pos + 8]
            chunk = payload[pos + 4:pos + 8 + length]
            crc = struct.unpack(">I", payload[pos + 8 + length:pos + 12 + length])[0]
            if zlib.crc32(chunk) & 0xFFFFFFFF != crc:
                fail(f"bad PNG chunk checksum: {path.relative_to(ROOT)}")
                return None
            pos += length + 12
            if kind == b"IEND":
                break
        return width, height
    except Exception as exc:
        fail(f"unreadable PNG {path.relative_to(ROOT)}: {exc}")
        return None


def main() -> int:
    metadata_path = RES / "fabric.mod.json"
    metadata = load_json(metadata_path)
    if not metadata or metadata.get("id") != "beyondlimits":
        fail("fabric.mod.json must declare id 'beyondlimits'")
    if metadata and "${version}" not in metadata.get("version", ""):
        fail("fabric.mod.json version should be expanded by Gradle")
    if metadata and "fabric-api" not in metadata.get("depends", {}):
        fail("fabric-api must be declared as a required dependency")

    for entrypoint in (metadata or {}).get("entrypoints", {}).values():
        for class_name in entrypoint:
            source_path = ROOT / "src" / ("client" if class_name.endswith("BeyondLimitsClient") else "main") / "java" / Path(*class_name.split("."))
            source_path = source_path.with_suffix(".java")
            if not source_path.exists():
                fail(f"missing entrypoint source: {source_path.relative_to(ROOT)}")

    block_source = (ROOT / "src/main/java/dev/beyondlimits/ModBlocks.java").read_text(encoding="utf-8")
    item_source = (ROOT / "src/main/java/dev/beyondlimits/ModItems.java").read_text(encoding="utf-8")
    entity_source = (ROOT / "src/main/java/dev/beyondlimits/entity/ModEntities.java").read_text(encoding="utf-8")
    block_ids = set(re.findall(r'registerWithItem\("([a-z0-9_]+)"', block_source))
    block_ids.update(re.findall(r'id\("([a-z0-9_]+)"\)', block_source))
    item_ids = set(re.findall(r'register\("([a-z0-9_]+)"', item_source)) | block_ids
    entity_ids = set(re.findall(r'register\("([a-z0-9_]+)"', entity_source))

    for path in sorted(RES.rglob("*.json")):
        load_json(path)

    recipe_dir = DATA / "beyondlimits/recipes"
    for path in sorted(recipe_dir.glob("*.json")):
        recipe = load_json(path)
        if not recipe:
            continue
        result_item = recipe.get("result", {}).get("item")
        if result_item and result_item.startswith("beyondlimits:") and result_item.split(":", 1)[1] not in item_ids:
            fail(f"recipe {path.name} outputs unregistered item {result_item}")
        for ingredient in recipe.get("key", {}).values():
            item = ingredient.get("item")
            if item and item.startswith("beyondlimits:") and item.split(":", 1)[1] not in item_ids:
                fail(f"recipe {path.name} uses unregistered item {item}")

    for path in sorted(ASSETS.rglob("*.json")):
        data = load_json(path)
        if data is None:
            continue
        if "/blockstates/" in path.as_posix():
            for variant in data.get("variants", {}).values():
                model = variant.get("model")
                if model:
                    target = resolve_asset(model, "models", ".json")
                    if target and not target.exists():
                        fail(f"missing block model {model} referenced by {path.relative_to(ROOT)}")
        if "/models/" in path.as_posix():
            parent = data.get("parent")
            if parent:
                target = resolve_asset(parent, "models", ".json")
                if target and not target.exists():
                    fail(f"missing model parent {parent} referenced by {path.relative_to(ROOT)}")
            for texture in data.get("textures", {}).values():
                if texture.startswith("#"):
                    continue
                target = resolve_asset(texture, "textures", ".png")
                if target and not target.exists():
                    fail(f"missing texture {texture} referenced by {path.relative_to(ROOT)}")

    textures = sorted(ASSETS.rglob("*.png"))
    dimensions = {path.relative_to(ASSETS).as_posix(): check_png(path) for path in textures}
    for path in sorted(ASSETS.rglob("*.png.mcmeta")):
        metadata = load_json(path)
        png_path = Path(str(path)[:-7])
        if not png_path.exists():
            fail(f"animation metadata has no texture: {path.relative_to(ROOT)}")
        if not metadata or metadata.get("animation", {}).get("frametime", 0) <= 0:
            fail(f"invalid animation metadata: {path.relative_to(ROOT)}")

    tear_frames = [dimensions.get(f"beyondlimits/textures/block/reality_tear_stage{i}.png") for i in range(4)]
    if any(dimension != (16, 64) for dimension in tear_frames):
        fail("all four reality-tear textures must be 16x64 animated vertical sheets")
    for texture in ("observer", "mirror_echo", "frayling"):
        if dimensions.get(f"beyondlimits/textures/entity/{texture}.png") != (64, 32):
            fail(f"{texture} texture must be 64x32")

    for entity in ("observer", "mirror_echo", "frayling"):
        if entity not in entity_ids:
            fail(f"missing registered entity type: {entity}")

    shader_dir = ROOT / "src/main/shaderpack/shaders"
    for required in ("composite.vsh", "composite.fsh"):
        if not (shader_dir / required).exists():
            fail(f"missing optional GLSL shader: {required}")
    fragment = (shader_dir / "composite.fsh").read_text(encoding="utf-8") if (shader_dir / "composite.fsh").exists() else ""
    for token in ("depthtex0", "frameTimeCounter", "isEyeInWater", "gl_FragColor"):
        if token not in fragment:
            fail(f"composite shader is missing expected input/effect token {token}")

    if not (ROOT / "gradle/wrapper/gradle-wrapper.jar").exists():
        fail("Gradle wrapper JAR is missing")
    wrapper_props = (ROOT / "gradle/wrapper/gradle-wrapper.properties").read_text(encoding="utf-8")
    if "gradle-8.8-bin.zip" not in wrapper_props:
        fail("wrapper should be pinned to Gradle 8.8 for Loom 1.7.4")
    gradle_properties = (ROOT / "gradle.properties").read_text(encoding="utf-8")
    if "loom_version=1.7.4" not in gradle_properties:
        fail("Loom should be pinned to the published 1.7.4 version")

    if errors:
        print(f"FAIL — {len(errors)} issue(s), {checked_json} JSON files inspected")
        for error in errors:
            print(f"  - {error}")
        return 1

    print(f"PASS — {checked_json} JSON files, {len(textures)} PNGs, model/texture links, animated tear sheets, wrapper, and GLSL pack checked")
    return 0


if __name__ == "__main__":
    sys.exit(main())
