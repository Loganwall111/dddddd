import hashlib
import json
import struct
import unittest
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
    def test_spawn_group_names_match_1_21_codec(self):
        output = gen.generate(84921603, 12)
        allowed = {"monster", "creature", "ambient", "axolotls", "underground_water_creature", "water_creature", "water_ambient", "misc"}
        biome_paths = [path for path in output if path.startswith("data/beyond/worldgen/biome/")]
        self.assertEqual(12, len(biome_paths))
        for path in biome_paths:
            biome = json.loads(output[path])
            self.assertTrue(set(biome["spawners"]).issubset(allowed), path)
            self.assertTrue(biome["spawners"], path)

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
