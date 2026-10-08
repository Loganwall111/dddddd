#!/usr/bin/env python3
"""Generates the mod's datapack half: dimensions, dimension types, biomes, loot tables and tags.

This is the part of the mod that is data rather than code, and it is generated for the same reason
the textures are: seven dimensions is a lot of JSON to keep consistent by hand, and every one of
them has to agree with a RegistryKey in BtlDimensions plus a biome id in a chunk generator. The
script is the single place where all three are tied together.
"""
import json
import os

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                    "src", "main", "resources", "data", "beyondthelimits")
MINECRAFT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                         "src", "main", "resources", "data", "minecraft")

BLOCKS = [
    "corrupted_grass", "corrupted_soil", "corrupted_stone", "bleeding_vein", "bleed_pool",
    "rift_anchor", "rift_frame", "void_glass", "sky_shard", "gravity_core",
    "memory_stone", "memory_lamp", "mirror_block",
    "code_monolith", "code_brick", "code_panel",
    "backrooms_carpet", "backrooms_wall", "backrooms_ceiling", "backrooms_light",
    "pool_tile", "pool_tile_dark", "store_shelf", "warehouse_concrete", "warehouse_floor",
    "wrong_grass", "impossible_grass", "impossible_leaves", "impossible_log",
    "ancient_brick", "ancient_pillar", "ancient_statue",
    "signal_casing", "signal_machine",
    "fog_moss", "fog_stone",
]

ITEMS = [
    "guidebook", "reality_scanner", "dimensional_gauge", "memory_shard",
    "signal_receiver", "rift_stabilizer", "void_lens", "storm_beacon", "ancient_tablet",
    "reality_warhead", "reality_fragment", "black_sun_fragment", "code_key",
]


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as handle:
        json.dump(data, handle, indent=2)
        handle.write("\n")


# ---------------------------------------------------------------------------------------
# biomes
# ---------------------------------------------------------------------------------------

def biome(precipitation=True, temperature=0.5, downfall=0.5, sky=0x78A7FF, fog=0xC0D8FF,
          water=0x3F76E4, water_fog=0x050533, creature=None, monster=None):
    return {
        "has_precipitation": precipitation,
        "temperature": temperature,
        "downfall": downfall,
        "spawners": {
            "monster": monster or [],
            "creature": creature or [],
        },
        "spawn_costs": {},
        "carvers": {},
        "effects": {
            "sky_color": sky,
            "fog_color": fog,
            "water_color": water,
            "water_fog_color": water_fog,
        },
        # 11 decoration steps, all left to the mod's own generators and structures.
        "features": [[] for _ in range(11)],
    }


def spawn(entity, weight, minimum, maximum):
    return {"type": entity, "weight": weight, "minCount": minimum, "maxCount": maximum}


BIOMES = {
    # The Fog Dimension: visual range is the biome. Nothing here wants to be seen clearly.
    "foglands": biome(temperature=0.2, downfall=0.9, sky=0x9AA3A6, fog=0xB8C0C2,
                      water=0x5A6A6E, water_fog=0x3A4446,
                      monster=[spawn("beyondthelimits:fog_shade", 60, 1, 2),
                               spawn("beyondthelimits:fog_walker", 40, 1, 1)]),
    # The Code Verse: no terrain, no weather, a permanent green glare from nowhere.
    "codescape": biome(precipitation=False, temperature=0.5, downfall=0.0, sky=0x07120B,
                       fog=0x0A2415, water=0x0F3A22, water_fog=0x05170D,
                       monster=[spawn("beyondthelimits:code_wraith", 70, 1, 3)]),
    # The Backrooms: warm, dry, lit, and not a place.
    "backrooms": biome(precipitation=False, temperature=0.9, downfall=0.0, sky=0xD9D2A8,
                       fog=0x6E6647, water=0x3F76E4, water_fog=0x1A1A0F,
                       monster=[spawn("beyondthelimits:smiler", 30, 1, 1),
                                spawn("beyondthelimits:hound", 25, 1, 2),
                                spawn("beyondthelimits:skin_stealer", 15, 1, 1),
                                spawn("beyondthelimits:partygoer", 20, 1, 2),
                                spawn("beyondthelimits:faceling", 25, 1, 3)]),
    # Under the bedrock: no light, no sky, and things that were already here.
    "substrata": biome(precipitation=False, temperature=0.1, downfall=0.0, sky=0x000000,
                       fog=0x040303, water=0x1B2A3A, water_fog=0x05090F,
                       monster=[spawn("beyondthelimits:faceling", 20, 1, 2),
                                spawn("beyondthelimits:memory_echo", 10, 1, 1)]),
    # The Mirror World: the same colours as home, one shade colder.
    "mirrorworld": biome(temperature=0.5, downfall=0.5, sky=0x6E7A96, fog=0xA8B4C4,
                         water=0x3A5E8C, water_fog=0x0A1424,
                         monster=[spawn("beyondthelimits:mirror_double", 5, 1, 1)]),
    # The Wrong Minecraft: recognisable, and a degree off in every direction.
    "wrongworld": biome(temperature=0.7, downfall=0.4, sky=0x2E4A38, fog=0x8A9A7A,
                        water=0x2F5A3A, water_fog=0x102010),
    # The Impossible: black grass, white leaves, gravity with opinions.
    "the_impossible": biome(precipitation=False, temperature=0.4, downfall=0.0, sky=0x2A0C3A,
                            fog=0x3A1050, water=0x6B2FA0, water_fog=0x1A0A28,
                            monster=[spawn("beyondthelimits:giant_insect", 40, 1, 2)]),
}

# ---------------------------------------------------------------------------------------
# dimension types
# ---------------------------------------------------------------------------------------

def dimension_type(**kwargs):
    base = {
        "ultrawarm": False,
        "natural": False,
        "coordinate_scale": 1.0,
        "has_skylight": True,
        "has_ceiling": False,
        "ambient_light": 0.0,
        "monster_spawn_light_level": 0,
        "monster_spawn_block_light_limit": 0,
        "piglin_safe": False,
        "bed_works": False,
        "respawn_anchor_works": False,
        "has_raids": False,
        "logical_height": 256,
        "min_y": 0,
        "height": 256,
        "infiniburn": "#minecraft:infiniburn_overworld",
        "effects": "minecraft:overworld",
    }
    base.update(kwargs)
    return base


DIMENSION_TYPES = {
    # Foglands: low ceiling, dim, so the fog has somewhere to sit.
    "foglands": dimension_type(min_y=0, height=192, logical_height=192, ambient_light=0.12,
                               natural=True, effects="minecraft:overworld"),
    # Code Verse: no sky light at all. The world is the skybox and the skybox is lit from inside.
    "codescape": dimension_type(min_y=0, height=256, logical_height=256, has_skylight=False,
                                ambient_light=0.35, fixed_time=6000, effects="minecraft:the_end"),
    # Backrooms: a ceiling, fluorescent light, no weather, no time.
    "backrooms": dimension_type(min_y=0, height=128, logical_height=128, has_ceiling=True,
                                has_skylight=False, ambient_light=0.28, natural=True,
                                monster_spawn_light_level=7, monster_spawn_block_light_limit=15),
    # Substrata: no light enters, none is generated, none is missed.
    "substrata": dimension_type(min_y=0, height=384, logical_height=384, has_skylight=False,
                                ambient_light=0.02),
    # Mirrorworld: the overworld's geometry, with the sky turned down.
    "mirrorworld": dimension_type(min_y=-64, height=384, logical_height=384, natural=True,
                                  ambient_light=0.05),
    # Wrongworld: everything vanilla, and slightly off.
    "wrongworld": dimension_type(min_y=-64, height=384, logical_height=384, natural=True),
    # The Impossible: a high ceiling because the trees need it, and a sick violet light.
    "the_impossible": dimension_type(min_y=0, height=384, logical_height=384, ambient_light=0.22,
                                     fixed_time=18000, effects="minecraft:the_end"),
}

# ---------------------------------------------------------------------------------------
# dimensions
# ---------------------------------------------------------------------------------------

def flat(layers, biome_id, features=False, lakes=False, structure_overrides=None):
    settings = {
        "layers": layers,
        "biome": biome_id,
        "features": features,
        "lakes": lakes,
    }
    if structure_overrides is not None:
        settings["structure_overrides"] = structure_overrides
    return {"type": "minecraft:flat", "settings": settings}


def layer(block, height):
    return {"block": block, "height": height}


DIMENSIONS = {
    # A floor, a ceiling of fog, and shapes crossing the gap.
    "the_foglands": flat([
        layer("minecraft:bedrock", 1),
        layer("beyondthelimits:fog_stone", 28),
        layer("beyondthelimits:fog_moss", 2),
    ], "beyondthelimits:foglands", features=True),

    # No terrain: the Code Verse is a shell of floating monoliths over nothing, placed by the
    # CodescapeChunkGenerator. The flat base is the void floor you fall to if you stop reading.
    "codescape": {
        "type": "beyondthelimits:codescape",
        "generator": {
            "type": "beyondthelimits:codescape_shell",
            "biome_source": {"type": "minecraft:fixed", "biome": "beyondthelimits:codescape"},
        },
    },

    # Procedural architecture, straight out of the chunk generator.
    "backrooms": {
        "type": "beyondthelimits:backrooms",
        "generator": {
            "type": "beyondthelimits:backrooms",
            "biome_source": {"type": "minecraft:fixed", "biome": "beyondthelimits:backrooms"},
        },
    },

    # Six layers under the bedrock, stacked as a single tall column of everything that leaked down.
    "substrata": flat([
        layer("minecraft:bedrock", 1),
        layer("minecraft:deepslate", 24),
        layer("beyondthelimits:corrupted_stone", 12),
        layer("minecraft:blackstone", 10),
        layer("beyondthelimits:memory_stone", 8),
        layer("minecraft:white_concrete", 6),
        layer("minecraft:bedrock", 2),
    ], "beyondthelimits:substrata"),

    # The overworld's shape, one shade colder, with its own villages to find.
    "mirrorworld": flat([
        layer("minecraft:bedrock", 1),
        layer("minecraft:deepslate", 24),
        layer("minecraft:stone", 60),
        layer("minecraft:dirt", 3),
        layer("beyondthelimits:mirror_block", 1),
    ], "minecraft:plains", features=True,
       structure_overrides=["minecraft:villages", "minecraft:ruined_portal"]),

    # Recognisable Minecraft, built wrong: stone above the dirt, grass under the grass.
    "wrongworld": flat([
        layer("minecraft:bedrock", 1),
        layer("minecraft:dirt", 4),
        layer("minecraft:stone", 40),
        layer("beyondthelimits:wrong_grass", 2),
        layer("minecraft:stone", 8),
        layer("minecraft:grass_block", 1),
    ], "beyondthelimits:wrongworld", features=True,
       structure_overrides=["minecraft:villages"]),

    # Black grass, white leaves, and a floor that keeps its own counsel about which way is down.
    "the_impossible": flat([
        layer("minecraft:bedrock", 1),
        layer("minecraft:deepslate", 16),
        layer("beyondthelimits:impossible_grass", 24),
        layer("minecraft:white_concrete", 3),
        layer("beyondthelimits:impossible_grass", 1),
    ], "beyondthelimits:the_impossible", features=False),
}


def main():
    for name, body in BIOMES.items():
        write(os.path.join(DATA, "worldgen", "biome", f"{name}.json"), body)
    for name, body in DIMENSION_TYPES.items():
        write(os.path.join(DATA, "dimension_type", f"{name}.json"), body)
    for name, body in DIMENSIONS.items():
        write(os.path.join(DATA, "dimension", f"{name}.json"), body)

    # ---- loot tables: every block drops itself -------------------------------------------
    for name in BLOCKS:
        write(os.path.join(DATA, "loot_table", "blocks", f"{name}.json"), {
            "type": "minecraft:block",
            "pools": [{
                "rolls": 1,
                "bonus_rolls": 0,
                "entries": [{
                    "type": "minecraft:item",
                    "name": f"beyondthelimits:{name}",
                }],
                "conditions": [{"condition": "minecraft:survives_explosion"}],
            }],
        })

    # ---- tags ---------------------------------------------------------------------------
    # Physics tags: what corruption eats, what bleeds, what a rift can see through, and what
    # the Backrooms' generator is allowed to carve.
    write(os.path.join(DATA, "tags", "block", "corruption_immune.json"), {
        "replace": False,
        "values": [
            {"id": "beyondthelimits:rift_anchor", "required": False},
            {"id": "beyondthelimits:rift_frame", "required": False},
            {"id": "beyondthelimits:code_monolith", "required": False},
            {"id": "beyondthelimits:signal_machine", "required": False},
            {"id": "beyondthelimits:ancient_statue", "required": False},
            "#minecraft:portals",
        ],
    })
    write(os.path.join(DATA, "tags", "block", "bleedable.json"), {
        "replace": False,
        "values": [
            "#minecraft:dirt", "#minecraft:stone_bricks", "#minecraft:base_stone_overworld",
            {"id": "beyondthelimits:corrupted_stone", "required": False},
            {"id": "beyondthelimits:corrupted_soil", "required": False},
            "#minecraft:leaves",
        ],
    })
    write(os.path.join(DATA, "tags", "block", "rift_transparent.json"), {
        "replace": False,
        "values": [
            "minecraft:glass", "minecraft:glass_pane", "minecraft:ice", "minecraft:water",
            {"id": "beyondthelimits:void_glass", "required": False},
            {"id": "beyondthelimits:mirror_block", "required": False},
            {"id": "beyondthelimits:sky_shard", "required": False},
        ],
    })
    write(os.path.join(DATA, "tags", "block", "backrooms_structure.json"), {
        "replace": False,
        "values": [
            {"id": "beyondthelimits:backrooms_wall", "required": False},
            {"id": "beyondthelimits:backrooms_ceiling", "required": False},
            {"id": "beyondthelimits:backrooms_light", "required": False},
            {"id": "beyondthelimits:backrooms_carpet", "required": False},
        ],
    })
    write(os.path.join(DATA, "tags", "item", "rift_tools.json"), {
        "replace": False,
        "values": [
            {"id": "beyondthelimits:rift_stabilizer", "required": False},
            {"id": "beyondthelimits:void_lens", "required": False},
            {"id": "beyondthelimits:reality_scanner", "required": False},
        ],
    })

    # Vanilla interop: the mod's blocks should be mineable with the tools that make sense.
    write(os.path.join(MINECRAFT, "tags", "block", "mineable", "pickaxe.json"), {
        "replace": False,
        "values": [{"id": f"beyondthelimits:{name}", "required": False} for name in [
            "corrupted_stone", "rift_anchor", "rift_frame", "memory_stone", "memory_lamp",
            "code_monolith", "code_brick", "pool_tile", "pool_tile_dark", "warehouse_concrete",
            "warehouse_floor", "ancient_brick", "ancient_pillar", "ancient_statue",
            "signal_casing", "signal_machine", "fog_stone", "gravity_core", "mirror_block",
            "backrooms_ceiling", "store_shelf", "impossible_log"]],
    })
    write(os.path.join(MINECRAFT, "tags", "block", "mineable", "shovel.json"), {
        "replace": False,
        "values": [{"id": f"beyondthelimits:{name}", "required": False} for name in [
            "corrupted_grass", "corrupted_soil", "backrooms_carpet", "wrong_grass",
            "impossible_grass", "fog_moss"]],
    })
    write(os.path.join(MINECRAFT, "tags", "block", "mineable", "hoe.json"), {
        "replace": False,
        "values": [{"id": "beyondthelimits:impossible_leaves", "required": False}],
    })
    write(os.path.join(MINECRAFT, "tags", "block", "needs_stone_tool.json"), {
        "replace": False,
        "values": [{"id": f"beyondthelimits:{name}", "required": False} for name in [
            "rift_frame", "code_monolith", "signal_machine", "gravity_core", "warehouse_concrete"]],
    })
    write(os.path.join(MINECRAFT, "tags", "block", "needs_diamond_tool.json"), {
        "replace": False,
        "values": [{"id": "beyondthelimits:rift_frame", "required": False}],
    })
    write(os.path.join(MINECRAFT, "tags", "block", "dragon_immune.json"), {
        "replace": False,
        "values": [{"id": "beyondthelimits:rift_frame", "required": False}],
    })

    print(f"datapack: {len(BIOMES)} biomes, {len(DIMENSION_TYPES)} dimension types, "
          f"{len(DIMENSIONS)} dimensions, {len(BLOCKS)} loot tables, 12 tag files")


if __name__ == "__main__":
    main()
