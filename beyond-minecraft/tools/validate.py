#!/usr/bin/env python3
"""Resource integrity checks. Not a substitute for Java compilation or a Minecraft launch."""
import json
from pathlib import Path
import re
import struct
import sys
import generate_multiverse

ROOT = Path(__file__).resolve().parents[1]
RES = ROOT / "src/main/resources"
GEN = ROOT / "src/main/generated"
TOOLS = ("reality_knife", "shattered_relic", "reality_tear", "radiate_reality_glasses", "field_guide", "scale_prism")
CUSTOM = {"between", "labyrinth", "fractal"}


def validate():
    count = 0
    metadata = json.loads((RES / "fabric.mod.json").read_text())
    assert metadata["depends"]["minecraft"] == "1.21.1", "Do not advertise untested 1.21.x compatibility"
    assert metadata["id"] == "beyond"
    for directory in (RES, GEN):
        for path in directory.rglob("*"):
            if path.suffix in (".json", ".mcmeta"):
                json.loads(path.read_text()); count += 1
            if path.suffix == ".png":
                b = path.read_bytes(); assert b[:8] == b"\x89PNG\r\n\x1a\n", path
                w, h = struct.unpack(">II", b[16:24]); assert w > 0 and h > 0, path
    catalog = json.loads((GEN / "assets/beyond/catalog.json").read_text())
    assert catalog["schema"] == 2, "catalog schema is the Java content contract"
    all_blocks, all_items = set(), set(TOOLS)
    realms = catalog["realms"]
    assert 1 <= len(realms) <= 32
    for i, realm in enumerate(realms):
        key = realm["id"]; assert key == f"realm_{i:02}"
        kinds = generate_multiverse.KINDS
        assert len(realm["blocks"]) == len(kinds), "every realm declares five materials"
        for block, kind in zip(realm["blocks"], kinds):
            assert block == f"{key}_{kind}", block
        all_blocks.update(realm["blocks"]); all_items.update(realm["blocks"]); all_items.add(key + "_echo")
        assert (GEN / f"data/beyond/dimension/{key}.json").is_file()
        dimension = json.loads((GEN / f"data/beyond/dimension/{key}.json").read_text())
        if realm["terrain"] in CUSTOM:
            assert dimension["generator"]["type"] == f"beyond:{realm['terrain']}_generator", key
            assert dimension["type"] == "beyond:void", "generated spaces use the unlit dimension type"
        else:
            assert dimension["generator"]["type"] == "minecraft:noise", key
            settings = json.loads((GEN / f"data/beyond/worldgen/noise_settings/{key}.json").read_text())
            assert settings["default_block"]["Name"] in [f"beyond:{b}" for b in realm["blocks"]]
            assert settings["noise"]["height"] == 384 and settings["noise"]["min_y"] == -64
            assert "final_density" in settings["noise_router"]
            for suffix in ("_terrain", "_detail"):
                assert (GEN / f"data/beyond/worldgen/noise/{key}{suffix}.json").is_file(), key
        biome = json.loads((GEN / f"data/beyond/worldgen/biome/{key}.json").read_text())
        assert biome["spawners"], "every realm declares its own creature roster"
        for group in biome["spawners"].values():
            for entry in group:
                assert entry["type"].startswith(("beyond:", "minecraft:"))
        decoration = list((GEN / "data/beyond/worldgen/placed_feature").glob(f"{key}_*.json"))
        assert len(decoration) >= 2, f"{key} needs realm-specific decoration"
        for path in (GEN / "data/beyond/worldgen/placed_feature").glob(f"{key}_*.json"):
            link = json.loads(path.read_text())
            assert (GEN / f"data/beyond/worldgen/configured_feature/{link['feature'].split(':')[1]}.json").is_file(), path
    for item in all_items:
        model = GEN / f"assets/beyond/models/item/{item}.json"; assert model.exists(), item
    for block in all_blocks:
        assert (GEN / f"assets/beyond/blockstates/{block}.json").is_file()
        assert (GEN / f"data/beyond/loot_table/blocks/{block}.json").is_file()
    for variant in range(4):
        assert (GEN / f"assets/beyond/textures/entity/realm_critter_{variant}.png").is_file()
    for path in (GEN / "assets/beyond/models").rglob("*.json"):
        data = json.loads(path.read_text())
        for texture in data.get("textures", {}).values():
            if texture.startswith("beyond:"):
                assert (GEN / "assets/beyond/textures" / (texture.split(":")[1] + ".png")).is_file(), (path, texture)
    for path in (GEN / "data/beyond/recipe").glob("*.json"):
        data = json.loads(path.read_text())
        assert data["result"]["id"].removeprefix("beyond:") in all_items, path
        for item in data.get("ingredients", []) + list(data.get("key", {}).values()):
            if item.get("item", "").startswith("beyond:"): assert item["item"][7:] in all_items, path
    core = RES / "assets/beyond/shaders/core"
    for path in core.glob("*.json"):
        desc = json.loads(path.read_text())
        source = (core / (desc["fragment"].split(":")[1] + ".fsh")).read_text()
        declarations = dict((name, kind) for kind, name in re.findall(r"uniform\s+(\w+)\s+(\w+)\s*;", source))
        provided = {x["name"] for x in desc["uniforms"] + desc["samplers"]}
        assert provided == declarations.keys(), (path, provided ^ declarations.keys())
        for uniform in desc["uniforms"]:
            assert uniform["count"] == len(uniform["values"]), uniform
        assert source.startswith("#version 150"), path
    mixins = json.loads((RES / "beyond.mixins.json").read_text())
    for mixin in mixins["mixins"]:
        assert (RES.parent / "java/dev/logan/beyond/mixin" / (mixin + ".java")).is_file(), mixin
    for entry in json.loads((RES / "fabric.mod.json").read_text())["entrypoints"].values():
        for target in entry:
            relative = target.replace(".", "/") + ".java"
            candidates = [ROOT / "src/main/java" / relative, ROOT / "src/client/java" / relative]
            assert any(path.is_file() for path in candidates), target
    manifest = json.loads((GEN / "beyond-generated.json").read_text())
    expected = generate_multiverse.generate(manifest["seed"], manifest["realms"])
    actual = {p.relative_to(GEN).as_posix() for p in GEN.rglob("*") if p.is_file()}
    assert actual == expected.keys(), "untracked/stale generated assets"
    for key, value in expected.items(): assert (GEN / key).read_bytes() == value, f"non-reproducible: {key}"
    print(f"PASS: {count} JSON/metadata documents, {len(realms)} realms, {len(all_blocks)} blocks, {len(all_items)} items; "
          f"texture, decoration, spawner, shader, mixin and generator contracts.")


if __name__ == "__main__":
    validate()
