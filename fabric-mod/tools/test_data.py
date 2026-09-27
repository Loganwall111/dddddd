"""Offline contract tests for authored resources. Minecraft codecs still need runtime testing."""
import json, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
R=ROOT/'src/main/resources'
D=R/'data/entersift'
def fn(name): return (D/f'function/{name}.mcfunction').read_text()
def read(path): return json.loads((D/path).read_text())
class DataContracts(unittest.TestCase):
    def test_load_does_not_reset_existing_souls(self):
        self.assertNotIn('scoreboard players set @a sift.souls',fn('load'))
    def test_four_destinations_are_guarded(self):
        for i in range(4):
            text=fn(f'travel/destination_{i}')
            self.assertIn('unless loaded',text)
            self.assertIn('unless block ~ ~ ~ minecraft:air run return 0',text)
            self.assertIn('unless score @s sift.return matches 1',text)
            self.assertIn('sift.cooldown 100',text)
    def test_travel_returns_to_original_dimension(self):
        text=fn('travel/return')
        for dim in ['minecraft:overworld','minecraft:the_nether','minecraft:the_end','entersift:the_sift']:
            self.assertIn(dim,text)
        self.assertIn('$(dimension)',fn('travel/return_macro'))
    def test_ritual_six_delayed_replies(self):
        for i,t in enumerate([80,104,128,152,176,200]):
            self.assertIn(f'matches {t} run function entersift:ritual/note_{i}',fn('ritual/tick'))
            self.assertIn(f'$(n{i}x)',fn(f'ritual/note_{i}'))
        self.assertIn('matches 220..',fn('ritual/tick'))
    def test_gauntlet_cost_and_cooldown(self):
        text=fn('rift/punch')
        self.assertLess(text.index('unless block'),text.index('remove @s sift.souls 10'))
        self.assertIn('sift.cooldown 60',text)
    def test_rift_expires(self):
        self.assertIn('matches 900.. run function entersift:rift/close',fn('rift/tick'))
        self.assertIn('kill @s',fn('rift/close'))
        self.assertIn('tag=sift.rift_visual',fn('rift/close'))
    def test_haunting_is_opt_in(self):
        self.assertIn('#haunt sift.roll 0',fn('load'))
        self.assertIn('if score #haunt sift.roll matches 1',fn('soul/ghost_tick'))
    def test_biomes_have_distinct_content(self):
        a=read('worldgen/biome/carapace.json'); b=read('worldgen/biome/singer_meadow.json'); c=read('worldgen/biome/saltwound_expanse.json')
        self.assertNotEqual(a['features'],b['features']); self.assertNotEqual(b['features'],c['features'])
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['default_fluid'],'entersift:ichor')
    def test_no_gamemode_or_inventory_takeover(self):
        for p in (D/'function').rglob('*.mcfunction'):
            for line in p.read_text().splitlines():
                self.assertFalse(line.startswith('gamemode '),str(p))
                self.assertFalse(line.startswith('clear '),str(p))
    def test_animated_fluid(self):
        p=R/'assets/entersift/textures/block/ichor_still.png.mcmeta'
        self.assertEqual(json.loads(p.read_text())['animation']['frametime'],2)
    def test_day_night_clock_is_not_frozen(self):
        dim=read('dimension_type/the_sift.json')
        self.assertTrue(dim['has_skylight'])
        self.assertEqual(dim['default_clock'],'minecraft:overworld')
        self.assertEqual(dim['timelines'],'#minecraft:in_overworld')
        self.assertNotIn('fixed_time',dim)
    def test_sky_is_dimension_scoped(self):
        shaders=ROOT/'shaderpack/shaders'
        self.assertIn('dimension.world_sift = entersift:the_sift',(shaders/'dimension.properties').read_text())
        self.assertIn('SIFT_DIMENSION 0',(shaders/'composite.fsh').read_text())
        self.assertIn('SIFT_DIMENSION 1',(shaders/'world_sift/composite.fsh').read_text())
        self.assertIn('depth >= 0.999999',(shaders/'program/composite.fsh').read_text())
    def test_shader_includes_resolve(self):
        import re
        shaders=ROOT/'shaderpack/shaders'
        for path in shaders.rglob('*'):
            if path.suffix in ['.fsh','.vsh','.glsl']:
                for inc in re.findall(r'#include "(/[^"\n]+)"',path.read_text()):
                    self.assertTrue((shaders/inc.lstrip('/')).is_file(),inc)
    def test_six_note_glows_follow_the_song(self):
        for i,color in enumerate(['red','magenta','pink','cyan','blue','purple']):
            self.assertIn(f'function entersift:notes/{color}',fn(f'ritual/note_{i}'))
            self.assertIn('entersift:resonance_'+color,fn('notes/create_'+color))
        self.assertIn('matches 80.. run function entersift:notes/clear',fn('notes/tick'))
    def test_glows_do_not_replace_note_blocks(self):
        for path in (D/'function/notes').glob('*.mcfunction'):
            self.assertNotIn('setblock',path.read_text())
            self.assertNotIn('fill ',path.read_text())
    def test_rift_has_bounded_geometry_and_animated_shards(self):
        self.assertEqual(fn('rift/create').count('id:"minecraft:block_display"'),27)
        for phase in [0,20,40,60]:
            self.assertEqual(fn(f'rift/pose_{phase}').count('interpolation_duration:20'),4)
        self.assertIn('tag=sift.rift_visual',fn('world/tick'))
    def test_portal_and_rift_have_different_textures(self):
        tex=R/'assets/entersift/textures/block'
        self.assertNotEqual((tex/'threshold.png').read_bytes(),(tex/'rift_membrane.png').read_bytes())
        import struct
        for name in ['threshold','rift_membrane','ichor_still']:
            self.assertEqual(struct.unpack('!II',(tex/f'{name}.png').read_bytes()[16:24]),(32,2048))
    def test_soul_effects_are_budgeted_and_recipient_local(self):
        text=fn('atmosphere/souls')
        self.assertEqual(len(text.splitlines()),3)
        for line in text.splitlines():
            self.assertIn('#souls_fx',line)
            self.assertTrue(line.endswith('normal @s'))
    def test_saltstone_under_salt_surface(self):
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['default_block'],'entersift:saltstone')
        rule=read('worldgen/material_rule/the_sift.json')['sequence']
        self.assertEqual(rule[-1]['result_state'],'entersift:saltstone')
        self.assertEqual(rule[-2]['then_run']['result_state'],'entersift:salt')
    def test_shader_upgrade_is_non_destructive(self):
        code=(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text()
        self.assertIn('Sift-Cinematic-0.2.zip',code)
        self.assertIn('!Files.exists(target)',code)
if __name__=='__main__': unittest.main(verbosity=2)
