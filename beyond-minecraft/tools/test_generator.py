import hashlib
import json
import struct
import re
import unittest
from pathlib import Path
import generate_multiverse as gen

class GeneratorTests(unittest.TestCase):
    def test_byte_stable(self):
        self.assertEqual(gen.generate(123, 2), gen.generate(123, 2))
    def test_seed_changes_content(self):
        first, second = gen.generate(12, 1), gen.generate(13, 1)
        self.assertNotEqual(first["assets/beyond/textures/block/realm_00_stratum.png"], second["assets/beyond/textures/block/realm_00_stratum.png"])
    def test_identifiers_stable_across_seeds(self):
        self.assertEqual(gen.generate(12, 2).keys(), gen.generate(999, 2).keys())
    def test_catalog_budget(self):
        for count in (0, -1, 33, 1000000):
            with self.assertRaises(ValueError): gen.generate(1, count)
    def test_maximum_catalog(self):
        output = gen.generate(1, 32)
        catalog = json.loads(output["assets/beyond/catalog.json"])
        self.assertEqual(32, len(catalog["realms"]))
        self.assertEqual(32, len({x["id"] for x in catalog["realms"]}))
    def test_five_materials_and_distinct_patterns_per_realm(self):
        output = gen.generate(7, 12)
        catalog = json.loads(output["assets/beyond/catalog.json"])
        self.assertEqual(12, len(catalog["realms"]))
        for realm in catalog["realms"]:
            self.assertEqual(5, len(realm["blocks"]))
            for kind in gen.KINDS:
                self.assertIn(f"{realm['id']}_{kind}", realm["blocks"])
        textures = {realm["id"]: output[f"assets/beyond/textures/block/{realm['blocks'][0]}.png"] for realm in catalog["realms"]}
        self.assertEqual(len(catalog["realms"]), len(set(textures.values())), "every realm must own a distinct material")
    def test_manifest_hashes_every_artifact(self):
        output = gen.generate(13, 2)
        manifest = json.loads(output["beyond-generated.json"])
        self.assertEqual(len(output) - 1, len(manifest["files"]))
        for path, digest in manifest["files"].items(): self.assertEqual(digest, hashlib.sha256(output[path]).hexdigest())
    def test_crystals_have_four_animation_frames(self):
        output = gen.generate(5, 1)
        image = output["assets/beyond/textures/block/realm_00_crystal.png"]
        self.assertEqual((16, 64), struct.unpack(">II", image[16:24]))
        meta = json.loads(output["assets/beyond/textures/block/realm_00_crystal.png.mcmeta"])
        self.assertEqual(8, meta["animation"]["frametime"])
    def test_generated_spaces_use_java_generators(self):
        catalog = json.loads(gen.generate(5, 12)["assets/beyond/catalog.json"])
        by_terrain = {realm["terrain"]: realm for realm in catalog["realms"]}
        for terrain in ("between", "labyrinth", "fractal"):
            self.assertIn(terrain, by_terrain)
            self.assertEqual(f"beyond:{terrain}", by_terrain[terrain]["generator"])
    def test_creature_skins_exist_for_every_family(self):
        output = gen.generate(9, 12)
        for variant in range(4):
            self.assertIn(f"assets/beyond/textures/entity/realm_critter_{variant}.png", output)
    def test_no_executable_generated_scripts(self):
        for path in gen.generate(5, 1): self.assertTrue(path.endswith((".png", ".json", ".mcmeta")), path)
    def test_root_vanilla_dimension_is_untouched(self):
        output = gen.generate(5, 1)
        self.assertFalse(any(p.startswith("data/minecraft/dimension") for p in output))
    def test_no_generated_function_force_loads_chunks(self):
        self.assertFalse(any(p.endswith(".mcfunction") for p in gen.generate(5, 1)))

if __name__ == "__main__": unittest.main()

    def test_spawn_categories_are_lower_case(self):
        """1.21 serialises spawn categories by name; "CREATURE" is a registry load failure."""
        output = gen.generate(3, 12)
        for path, data in output.items():
            if "/worldgen/biome/" not in path:
                continue
            for group in json.loads(data)["spawners"]:
                self.assertIn(group, {"monster", "creature", "ambient", "axolotls", "underground_water_creature",
                                      "water_creature", "water_ambient", "misc"})

    def test_every_feature_type_is_a_real_vanilla_type(self):
        """The registry only knows the ids the game ships: unknown ones abort world load."""
        import validate
        output = gen.generate(3, 12)
        seen = set()
        for path, data in output.items():
            if "/worldgen/configured_feature/" not in path and "/worldgen/placed_feature/" not in path:
                continue
            for literal in re.findall(r'"type":\s*"(minecraft:[a-z_]+)"', data.decode()):
                seen.add(literal)
            if "/worldgen/placed_feature/" in path:
                self.assertIsInstance(json.loads(data)["feature"], str, path)
        unknown = seen - (validate.FEATURE_TYPES | validate.PLACEMENT_TYPES | validate.NESTED_TYPES)
        self.assertEqual(set(), unknown)

    def test_every_configured_feature_matches_its_type(self):
        import validate
        output = gen.generate(3, 12)
        for path, data in output.items():
            if "/worldgen/configured_feature/" not in path:
                continue
            validate.check_nested_types(Path(path), json.loads(data)["config"])

