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
    def test_ritual_eight_delayed_replies(self):
        for i,t in enumerate([60,84,108,132,156,180,204,228]):
            self.assertIn(f'matches {t} run function entersift:ritual/note_{i}',fn('ritual/tick'))
            self.assertIn(f'$(n{i}x)',fn(f'ritual/note_{i}'))
        self.assertIn('matches 350..',fn('ritual/tick'))
    def test_gauntlet_cost_and_cooldown(self):
        text=fn('rift/punch')
        self.assertLess(text.index('unless block'),text.index('remove @s sift.souls 10'))
        self.assertIn('sift.cooldown 60',text)
    def test_rift_expires(self):
        self.assertIn('matches 6000.. run function entersift:rift/close',fn('rift/tick'))
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
        self.assertEqual(dim['timelines'],['entersift:sift_cycle'])
        import json as _j
        tl=_j.loads((D/'timeline/sift_cycle.json').read_text())
        self.assertEqual(tl['period_ticks'],24000)
        self.assertIn('minecraft:visual/sun_angle',tl['tracks'])
        # The Sift sky stays luminous at night (teal), never black/navy.
        night=tl['tracks']['minecraft:visual/sky_color']['keyframes'][-1]['value']
        self.assertGreater(sum(int(night[i:i+2],16) for i in (1,3,5)),450)
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
    def test_eight_note_glows_follow_the_song(self):
        for i,color in enumerate(['red','yellow','purple','blue','cyan','orange','green','pink']):
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
            w,h=struct.unpack('!II',(tex/f'{name}.png').read_bytes()[16:24])
            self.assertEqual(w,32); self.assertEqual(h%32,0); self.assertGreaterEqual(h//32,16)
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
        self.assertIn('Sift-Cinematic-0.3.zip',code)
        self.assertIn('!Files.exists(target)',code)
    def test_guardian_unlock_requires_death_and_link(self):
        self.assertIn('if score @s sift.link = #dead sift.link',fn('guardian/slain'))
        self.assertIn('tag @s add sift.ready',fn('guardian/unlock'))
        self.assertNotIn('unless entity',fn('guardian/slain'))
    def test_creature_eggs_have_functions_and_models(self):
        for name in ['blub','sculker','sculkling','antlerling','drift_jelly','licker','overseer','twisted_warden','singer']:
            self.assertIn(f'summon entersift:{name}',fn(f'creature/{name}/spawn'))
            self.assertTrue((R/f'assets/entersift/items/{name}_spawn_egg.json').exists())
            self.assertTrue((R/f'assets/entersift/textures/entity/{name}.png').exists())
            self.assertTrue((R/f'assets/entersift/textures/entity/{name}_glow.png').exists())
    def test_survival_integration(self):
        import json
        for k in ['blub','sculker','sculkling','antlerling','drift_jelly','licker','overseer','twisted_warden','singer']:
            self.assertTrue((D/f'loot_table/entities/{k}.json').exists())
        self.assertIn('entersift:rift_gauntlet',(D/'loot_table/entities/twisted_warden.json').read_text())
        for r in ['spire_bricks','teal_path','reef_stone','sift_mosaic','glow_bulb','rift_pink']:
            self.assertTrue((D/f'recipe/{r}.json').exists())
        root=json.loads((D/'advancement/root.json').read_text())
        self.assertNotIn('parent',root)
        carto=json.loads((D/'advancement/cartographer.json').read_text())
        self.assertEqual(len(carto['requirements']),6)  # every biome required
    def test_new_biomes_are_in_the_dimension_and_surface_rule(self):
        import json
        dim=json.loads((D/'dimension/the_sift.json').read_text())['generator']['biome_source']['biomes']
        rule=(D/'worldgen/material_rule/the_sift.json').read_text()
        for b in ['rose_spires','pale_grove','tidepool_reef']:
            self.assertIn(f'entersift:{b}',dim)
            self.assertIn(f'entersift:{b}',rule)
    def test_portal_pixelates_through_eight_stages(self):
        for k in range(8):
            self.assertIn(f'threshold_stage_{k}',fn(f'portal/assemble_{k}'))
        self.assertIn('rift/wave_player',fn('tick'))
    def test_gauntlet_creative_use_does_not_require_souls(self):
        self.assertIn('unless entity @s[gamemode=creative] if score',fn('rift/punch'))
        self.assertIn('unless entity @s[gamemode=creative] run scoreboard players remove',fn('rift/punch'))
    def test_rift_expansion_has_real_target_transforms(self):
        self.assertEqual(fn('rift/warp').count('interpolation_duration:40'),27)
        self.assertIn('scale:[0.012f,0.15f,0.012f]',fn('rift/create'))
        self.assertIn('matches 5 run function entersift:rift/warp',fn('rift/tick'))
    def test_portal_assembly_and_simultaneous_resonance(self):
        self.assertEqual(fn('ritual/tick').count('matches 1 run function entersift:ritual/note_'),8)
        self.assertEqual(fn('portal/form').count('summon minecraft:block_display'),8)
        self.assertEqual(sum(fn(f'portal/assemble_{i}').count('interpolation_duration:40') for i in range(8)),8)
    def test_natural_rift_cycle_is_ten_minutes_total(self):
        self.assertIn('#riftcycle sift.clock matches 12000..',fn('tick'))
        self.assertIn('tag=sift.natural',fn('rift/tick'))
        self.assertIn('#riftcycle sift.clock matches 6000..',fn('rift/tick'))
    def test_generated_skies_are_wired_to_shader(self):
        shaders=ROOT/'shaderpack/shaders'
        for name in ['sift_day','sift_night']:
            self.assertTrue((shaders/f'textures/{name}.png').exists())
            self.assertIn(f'textures/{name}.png',(shaders/'shaders.properties').read_text())
    def test_new_scenery_generates_in_biomes(self):
        b=read('worldgen/biome/singer_meadow.json')
        self.assertIn('entersift:weeping_soul_tree',b['features'][9])
        self.assertIn('entersift:ruined_arch',b['features'][9])
    def test_overworld_graphics_are_dimension_scoped(self):
        shaders=ROOT/'shaderpack/shaders'
        self.assertIn('dimension.world_overworld = minecraft:overworld',(shaders/'dimension.properties').read_text())
        self.assertIn('SIFT_OVERWORLD 1',(shaders/'world_overworld/composite.fsh').read_text())
        self.assertIn('SIFT_OVERWORLD 0',(shaders/'world_sift/composite.fsh').read_text())
    def test_eight_fixture_notes_have_sonorous_support(self):
        self.assertEqual(fn('dev/arena').count('entersift:sonorous_deepslate'),8)
        for pitch in range(8):self.assertIn(f'noteblock[note={pitch}]'.replace('noteblock','note_block'),fn('dev/arena'))
if __name__=='__main__': unittest.main(verbosity=2)
