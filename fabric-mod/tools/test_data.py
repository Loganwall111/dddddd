"""Offline contract tests for authored resources. Minecraft codecs still need runtime testing."""
import json, re, unittest
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
            if i == 3:  # the Sift: surface arrival next to the return portal (0.9)
                self.assertIn('positioned over motion_blocking_no_leaves',text)
            else:
                self.assertIn('unless block ~ ~ ~ minecraft:air run return 0',text)
            self.assertIn('unless score @s sift.return matches 1',text)
            self.assertIn('sift.cooldown 100',text)
    def test_sift_arrival_has_visible_return_portal(self):
        self.assertIn('summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}',fn('travel/plaza'))
        self.assertIn('summon entersift:rift_portal ~ ~ ~ {Tags:["sift.return_anchor"],RiftType:0',fn('portal/return_tick'))
        self.assertIn('travel/arrive',fn('travel/sift'))
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
        text=fn('rift/punch')+fn('rift/punch_at')
        # Placement is validated (open air) before any souls are spent.
        self.assertLess(text.index('#entersift:rift_passable'),text.index('remove @s sift.souls 10'))
        self.assertIn('sift.cooldown 60',text)
    def test_rift_expires(self):
        self.assertIn('sift.age matches 6000.. run function entersift:rift/close',fn('rift/tick'))
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
        self.assertEqual(json.loads(p.read_text())['animation']['frametime'],3)
    def test_day_night_clock_is_not_frozen(self):
        dim=read('dimension_type/the_sift.json')
        self.assertTrue(dim['has_skylight'])
        self.assertEqual(dim['default_clock'],'minecraft:overworld')
        self.assertEqual(dim['timelines'],['entersift:sift_cycle'])
        import json as _j
        tl=_j.loads((D/'timeline/sift_cycle.json').read_text())
        self.assertEqual(tl['period_ticks'],24000)
        self.assertIn('minecraft:visual/sun_angle',tl['tracks'])
        # The Sift sky stays luminous at night (amber-gold), never black/navy.
        night=tl['tracks']['minecraft:visual/sky_color']['keyframes'][-1]['value']
        self.assertGreater(sum(int(night[i:i+2],16) for i in (1,3,5)),400)
        self.assertNotIn('fixed_time',dim)
    def test_sky_is_native_java_lava_lamp(self):
        sky=(ROOT/'src/client/java/dev/logan/entersift/client/SiftSky.java').read_text()
        # 0.11: private fog-free position_color types, no OIT (debugQuads made terrain flicker).
        self.assertIn('SiftRenderTypes.SOLID',sky)
        self.assertIn('SiftRenderTypes.GLOW',sky)
        self.assertNotIn('debugQuads',sky)
        self.assertIn('startsWith("entersift:")',sky)          # dimension guard
        self.assertEqual(sky.count('pushPose()'),sky.count('popPose()'))
        self.assertIn('finally',sky)
        for layer in ['auroraStreaks','shardRibbons','sunAndRay','worldBeams']: self.assertIn(f'void {layer}(',sky)
        self.assertIn('0.35f',sky)                              # single sun god ray alpha
        rift=(ROOT/'src/client/java/dev/logan/entersift/client/RiftPortalRenderer.java').read_text()
        self.assertNotIn('debugQuads',rift)
        self.assertEqual(rift.count('pushPose()'),rift.count('popPose()'))
        # Shader pack: Overworld only; the Sift composite is a passthrough and no Sift sky code remains.
        sp=ROOT/'shaderpack/shaders'
        self.assertFalse((sp/'lib/sift_sky.glsl').exists())
        self.assertFalse((sp/'textures').exists())
        self.assertNotIn('SIFT_DIMENSION',(sp/'program/composite.fsh').read_text())
        self.assertIn('texture2D(colortex0, texcoord)',(sp/'world_sift/composite.fsh').read_text())
        self.assertFalse((ROOT/'src/client/java/dev/logan/entersift/client/SiftSkyLayer.java').exists())
        self.assertFalse((R/'assets/entersift/textures/environment').exists())
        # Java stage table and timeline keyframes must agree, or the horizon shows a seam.
        tl=json.loads((D/'timeline/sift_cycle.json').read_text())['tracks']['minecraft:visual/fog_color']['keyframes']
        ticks=[int(x) for x in re.search(r'STAGE_TICKS = \{([^}]*)\}',sky).group(1).split(',')]
        self.assertEqual([k['ticks'] for k in tl],ticks)
        hz=re.findall(r'rgb\(0x([0-9A-F]{6})\)',sky.split('HORIZON =')[1].split(';')[0])
        self.assertEqual(sorted({k['value'].lower() for k in tl}),sorted('#'+h.lower() for h in hz))
    def test_ichor_is_swimmable_water(self):
        tag=json.loads((R/'data/minecraft/tags/fluid/water.json').read_text())
        self.assertFalse(tag['replace'])
        self.assertIn('entersift:ichor',tag['values']); self.assertIn('entersift:flowing_ichor',tag['values'])
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
        self.assertNotIn('id:"minecraft:block_display"',fn('rift/create'))  # no solid block rig
        self.assertIn('sift.rift_visual',fn('rift/anchor'))
        client=(ROOT/'src/client/java/dev/logan/entersift/client/RiftPortalRenderer.java').read_text()
        self.assertIn('submitCustomGeometry',client)
        self.assertIn('Math.sin(s.ageInTicks * 0.4f) * 0.05f',client)  # lens jitter shell
        self.assertFalse((ROOT/'src/client/java/dev/logan/entersift/client/RiftRenderer.java').exists())
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
        self.assertEqual(rule[-2]['then_run']['result_state'],'entersift:teal_path')  # bluish floor
    def test_old_shader_packs_are_removed(self):
        code=(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text()
        self.assertIn('Sift-Cinematic-',code)
        self.assertIn('deleteIfExists',code)
        # The optional Overworld pack is installed only if absent and never enabled.
        self.assertIn('if (Files.exists(target)) return;',code)
        self.assertNotIn('iris.properties',code)   # never touches Iris config (pack stays off)
        self.assertIn("Dungeons-II-Overworld-0.11.zip",(ROOT/'build.gradle').read_text())
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
    def test_no_feature_order_cycle_between_biomes(self):
        import json, itertools
        edges = {}
        for f in (D/'worldgen/biome').glob('*.json'):
            steps = json.loads(f.read_text())['features']
            for s, step in enumerate(steps):
                for a, b in itertools.combinations(step, 2):
                    edges.setdefault((s, a), set()).add((s, b))
        # Cycle detection (DFS) over the per-step precedence graph.
        state = {}
        def visit(n):
            state[n] = 1
            for m in edges.get(n, ()):
                if state.get(m) == 1: self.fail(f'feature order cycle via {n} -> {m}')
                if m not in state: visit(m)
            state[n] = 2
        for n in list(edges):
            if n not in state: visit(n)
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
        self.assertIn('unless entity @s[gamemode=creative] run scoreboard players remove',fn('rift/punch_at'))
    def test_rift_expansion_has_real_target_transforms(self):
        # Rifts are one invisible anchor display; the client draws the opening + warp animation.
        self.assertIn('function entersift:rift/style',fn('rift/create'))
        self.assertIn('function entersift:rift/anchor with storage entersift:rift',fn('rift/style'))
        self.assertIn('summon entersift:rift_portal',fn('rift/anchor'))
        self.assertIn('RiftType:$(style),Width:$(w)f,Height:$(h)f',fn('rift/anchor'))
        self.assertNotIn('rift/warp',fn('rift/tick'))
    def test_portal_assembly_and_simultaneous_resonance(self):
        self.assertEqual(fn('ritual/tick').count('matches 1 run function entersift:ritual/note_'),8)
        # One client-rendered anchor that pixelates inward (style 5 = portal), sized from the frame.
        self.assertIn('summon entersift:rift_portal',fn('portal/form'))
        self.assertIn('RiftType:4,Width:$(pw)f,Height:$(sy)f',fn('portal/form'))
        self.assertEqual(sum(fn(f'portal/assemble_{i}').count('interpolation_duration:40') for i in range(8)),8)
    def test_natural_rift_cycle_is_five_minutes_and_gated(self):
        self.assertIn('#riftcycle sift.clock matches 6000..',fn('tick'))
        self.assertIn('tag=sift.awakened] at @s run function entersift:rift/wave_player',fn('tick'))
        self.assertIn('tag=sift.natural',fn('rift/tick'))
        self.assertIn('#riftcycle sift.clock matches 2400..',fn('rift/tick'))
        self.assertIn('tag @s add sift.awakened',fn('rift/punch'))
        self.assertIn('@s[tag=sift.awakened]',fn('world/roll'))
        self.assertIn('if dimension minecraft:the_nether',fn('rift/wave_player'))
    def test_rifts_are_entities_everywhere(self):
        import glob
        for path in (D/'function').rglob('*.mcfunction'):
            text=path.read_text()
            for tag in ['sift.rift_visual','sift.portal_anchor','sift.return_anchor']:
                for line in text.splitlines():
                    if tag in line and 'summon' in line:
                        self.assertIn('entersift:rift_portal',line,f'{path.name}: {line}')
        self.assertIn('matches 0 run scoreboard players set @s sift.target 3',fn('rift/create'))
        for t in ['overworld','nether','end','sift','portal']:
            self.assertTrue((R/f'assets/entersift/textures/rift/interior_{t}.png').exists())
        self.assertIn('RIFT_PORTAL',(ROOT/'src/main/java/dev/logan/entersift/SiftEntities.java').read_text())
    def test_new_scenery_generates_in_biomes(self):
        b=read('worldgen/biome/singer_meadow.json')
        self.assertIn('entersift:weeping_soul_tree',b['features'][9])
        self.assertIn('entersift:ruined_arch',b['features'][9])
    def test_eight_fixture_notes_have_sonorous_support(self):
        self.assertEqual(fn('dev/arena').count('entersift:sonorous_deepslate'),8)
        for pitch in range(8):self.assertIn(f'noteblock[note={pitch}]'.replace('noteblock','note_block'),fn('dev/arena'))
if __name__=='__main__': unittest.main(verbosity=2)
