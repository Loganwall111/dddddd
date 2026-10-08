#!/usr/bin/env python3
"""Static checks for gameplay invariants that are easy to violate while wiring features.

The compiler cannot tell that a Fabric initializer forgot to register a command tree, that
S2C payload codecs were never registered, that there are four entrances to a dimension whose design
explicitly allows three, or that a core shader ID resolves to a doubled/missing resource path. It also verifies that
all seven dimension datapacks have registry-shaped type/generator entries before Minecraft opens
its Create World screen. This catches those integration mistakes without a Minecraft runtime.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
JAVA = ROOT / "src/main/java/com/beyondthelimits"


def read(relative):
    return (ROOT / relative).read_text()


def fail(message):
    print(f"invariant failed: {message}")
    return 1


def check_core_shaders():
    """Ensure Fabric's core-shader IDs map to complete, non-duplicated resource paths."""
    declarations = read("src/main/java/com/beyondthelimits/client/shader/BtlShaders.java")
    resource_root = ROOT / "src/main/resources/assets/beyondthelimits/shaders/core"
    shaders = {
        "RIFT_ID": "rift",
        "SKY_WARP_ID": "sky_warp",
        "GLITCH_ID": "screen_glitch",
        "SCAN_ID": "scan",
    }

    for constant, name in shaders.items():
        if f'{constant} = BeyondTheLimits.id("{name}")' not in declarations:
            return f"{constant} must use the shader path '{name}' (without a duplicate core/ prefix)"
        if declarations.count(f"context.register({constant},") != 1:
            return f"{constant} must be registered exactly once"

        descriptor_path = resource_root / f"{name}.json"
        if not descriptor_path.is_file():
            return f"missing core shader descriptor {descriptor_path.name}"
        descriptor = json.loads(descriptor_path.read_text())

        for stage in ("vertex", "fragment"):
            expected = f"beyondthelimits:{name}"
            if descriptor.get(stage) != expected:
                return f"{descriptor_path.name} {stage} must reference {expected} without repeating the core/ directory"

        for extension in ("vsh", "fsh"):
            if not (resource_root / f"{name}.{extension}").is_file():
                return f"missing core shader source {name}.{extension}"

    return None


def check_block_item_resources():
    """Keep registered BlockItems, their models, and block loot tables in sync."""
    block_source = read("src/main/java/com/beyondthelimits/registry/BtlBlocks.java")
    item_source = read("src/main/java/com/beyondthelimits/registry/BtlItems.java")
    if "new BlockItem(registered, new Item.Settings())" not in block_source:
        return "every registered block must also register its BlockItem"

    block_ids = set(re.findall(r'register[(]"([a-z0-9_]+)"', block_source))
    item_ids = set(re.findall(r'register[(]"([a-z0-9_]+)"', item_source))
    item_ids.discard("path")
    model_root = ROOT / "src/main/resources/assets/beyondthelimits/models/item"
    loot_root = ROOT / "src/main/resources/data/beyondthelimits/loot_table/blocks"

    for name in sorted(block_ids):
        model = model_root / f"{name}.json"
        if not model.is_file():
            return f"missing item model for registered block {name}"
        model_data = json.loads(model.read_text())
        if model_data.get("parent") != f"beyondthelimits:block/{name}":
            return f"item model for block {name} must inherit its block model"

        loot_table = loot_root / f"{name}.json"
        if not loot_table.is_file():
            return f"missing block loot table for registered block {name}"
        table_data = json.loads(loot_table.read_text())
        item_refs = []

        def collect_items(value):
            if isinstance(value, dict):
                if value.get("type") == "minecraft:item" and isinstance(value.get("name"), str):
                    item_refs.append(value["name"])
                for child in value.values():
                    collect_items(child)
            elif isinstance(value, list):
                for child in value:
                    collect_items(child)

        collect_items(table_data)
        if f"beyondthelimits:{name}" not in item_refs:
            return f"loot table for block {name} must drop its registered BlockItem"
        for item_id in item_refs:
            if item_id.startswith("beyondthelimits:") and item_id.split(":", 1)[1] not in item_ids | block_ids:
                return f"loot table for block {name} references unregistered item {item_id}"

    return None


def check_dimensions():
    """Validate the registry shape Minecraft expects before a world can be created."""
    data_root = ROOT / "src/main/resources/data/beyondthelimits"
    dimension_root = data_root / "dimension"
    type_root = data_root / "dimension_type"
    biome_root = data_root / "worldgen/biome"
    expected_dimensions = {
        "backrooms", "codescape", "mirrorworld", "substrata",
        "the_foglands", "the_impossible", "wrongworld",
    }
    dimensions = {path.stem: json.loads(path.read_text()) for path in dimension_root.glob("*.json")}
    dimension_types = {path.stem for path in type_root.glob("*.json")}

    if set(dimensions) != expected_dimensions:
        return f"expected 7 dimension entries, found {sorted(dimensions)}"
    if dimension_types != {"backrooms", "codescape", "foglands", "mirrorworld", "substrata", "the_impossible", "wrongworld"}:
        return f"dimension_type entries do not match Chapter One's seven worlds: {sorted(dimension_types)}"

    registered_custom_generators = {"beyondthelimits:backrooms", "beyondthelimits:codescape_shell"}

    for name, entry in dimensions.items():
        type_id = entry.get("type")
        generator = entry.get("generator")
        if not isinstance(type_id, str) or not type_id.startswith("beyondthelimits:"):
            return f"dimension/{name}.json must reference a mod dimension_type, not a chunk generator"
        if type_id.split(":", 1)[1] not in dimension_types:
            return f"dimension/{name}.json references missing dimension_type {type_id}"
        if not isinstance(generator, dict) or not isinstance(generator.get("type"), str):
            return f"dimension/{name}.json must contain a generator object"

        generator_type = generator["type"]
        if generator_type == "minecraft:flat":
            settings = generator.get("settings")
            if not isinstance(settings, dict) or not isinstance(settings.get("layers"), list) or not settings["layers"]:
                return f"dimension/{name}.json has invalid flat-generator settings"
            biome = settings.get("biome")
            if not isinstance(biome, str):
                return f"dimension/{name}.json flat generator is missing its biome"
            if biome.startswith("beyondthelimits:"):
                biome_name = biome.split(":", 1)[1]
                if not (biome_root / f"{biome_name}.json").is_file():
                    return f"dimension/{name}.json references missing biome {biome}"
            if "minecraft:villages" in settings.get("structure_overrides", []):
                return f"dimension/{name}.json uses the nonexistent plural structure key minecraft:villages"
        elif generator_type not in registered_custom_generators:
            return f"dimension/{name}.json uses unregistered chunk generator {generator_type}"
        else:
            source = generator.get("biome_source")
            biome = source.get("biome") if isinstance(source, dict) else None
            if not isinstance(biome, str) or not biome.startswith("beyondthelimits:"):
                return f"dimension/{name}.json custom generator needs a fixed mod biome source"
            if not (biome_root / f"{biome.split(':', 1)[1]}.json").is_file():
                return f"dimension/{name}.json references missing biome {biome}"

    return None


def main():
    shader_error = check_core_shaders()
    if shader_error:
        return fail(shader_error)

    block_item_error = check_block_item_resources()
    if block_item_error:
        return fail(block_item_error)

    dimension_error = check_dimensions()
    if dimension_error:
        return fail(dimension_error)

    sky_renderer = read("src/main/java/com/beyondthelimits/client/render/SkyRenderer.java")
    if "if (BtlShaders.skyWarpProgram() == null)" not in sky_renderer:
        return fail("SkyRenderer must preserve vanilla sky rendering while its shader is unavailable")

    main_initializer = read("src/main/java/com/beyondthelimits/BeyondTheLimits.java")
    events = read("src/main/java/com/beyondthelimits/world/BtlWorldEvents.java")
    commands = read("src/main/java/com/beyondthelimits/command/BtlCommands.java")
    teleport_mixin = read("src/main/java/com/beyondthelimits/mixin/TeleportCommandMixin.java")
    backrooms = read("src/main/java/com/beyondthelimits/core/engine/BackroomsEngine.java")
    dementia = read("src/main/java/com/beyondthelimits/core/engine/DementiaEngine.java")
    city = read("src/main/java/com/beyondthelimits/world/CityGenerator.java")
    rifts = read("src/main/java/com/beyondthelimits/core/engine/RiftEngine.java")
    moving_chunk = read("src/main/java/com/beyondthelimits/core/engine/MovingChunkEngine.java")

    # Main initialization must install payload codecs and the root commands, and delegate all
    # lifecycle/tick subscriptions to exactly one event-wiring class.
    for call in ("BtlNetworking.registerPayloadTypes();", "BtlCommands.register();", "BtlWorldEvents.register();"):
        if main_initializer.count(call) != 1:
            return fail(f"BeyondTheLimits must call {call} exactly once")
    if "ServerLifecycleEvents" in main_initializer or "ServerTickEvents" in main_initializer:
        return fail("server lifecycle/tick listeners are duplicated in the mod initializer")
    if events.count("ServerTickEvents.END_SERVER_TICK.register") != 1:
        return fail("BtlWorldEvents must own exactly one server-tick listener")

    # The three player entry paths: City rift, dementia-corrupted fall, and vanilla teleport branch.
    if city.count("BackroomsEngine.registerGate(") != 1:
        return fail("the City must register exactly one Backrooms gate")
    if dementia.count("BackroomsEngine.enterViaCorruptedGrass(") != 1:
        return fail("corrupted-ground dementia must be the only automatic entry call")
    if commands.count("BackroomsEngine.enterViaTeleportCommand(") != 1:
        return fail("the command entry must call the command-specific Backrooms route")
    if len(re.findall(r'CommandManager\.literal\("backrooms"\)', teleport_mixin)) != 1:
        return fail("/teleport backrooms must be the sole Backrooms command branch")
    if 'literal("backrooms")' in commands or 'case "backrooms"' in commands:
        return fail("BtlCommands exposes an additional direct Backrooms entry")
    if "enterViaNoclipDevice" in backrooms or (JAVA / "item/NoclipDeviceItem.java").exists():
        return fail("the unrequested Noclip Device adds a fourth Backrooms entrance")

    # The city gate is the only rift variant that goes into the Backrooms. Random rifts and the
    # moving-chunk scare must never silently create an additional seamless route.
    roll = rifts.split("public static int rollVariant", 1)[1].split("public static void tick", 1)[0]
    if "VARIANT_BACKROOMS" in roll or "VARIANT_BACKROOMS" in moving_chunk:
        return fail("random anomaly rifts must not lead into the Backrooms")
    if "VARIANT_BACKROOMS" in commands:
        return fail("a mod command exposes the Backrooms as a free-form dimension destination")

    print("runtime invariants: bootstrap wired once; exactly 3 Backrooms entry routes; 4 core shaders, 36 BlockItems/loot tables, and 7 dimensions resolve")
    return 0


if __name__ == "__main__":
    sys.exit(main())
