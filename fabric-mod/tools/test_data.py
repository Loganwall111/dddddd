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
        # Every rift lands on the local surface at the origin next to a return gate; the three non-Sift
        # destinations also require clear air at y=64 before the player is moved.
        for i in range(4):
            text=fn(f'travel/destination_{i}')
            self.assertIn('unless loaded',text)
            self.assertIn('positioned over motion_blocking_no_leaves',text)
            self.assertIn('function entersift:travel/arrive',text)
            self.assertNotIn('travel/pad',text)
            if i != 3:
                self.assertIn('unless block ~ ~ ~ minecraft:air run return 0',text)
            self.assertIn('unless score @s sift.return matches 1',text)
            self.assertIn('sift.cooldown 100',text)
    def test_no_floating_arrival_pads(self):
        # 0.25 removed the provisional y=300 / y=130 salt pads: arrivals use the surface plus the plaza.
        for i in range(3):
            text=fn(f'travel/destination_{i}')
            self.assertNotIn('0 300 0',text); self.assertNotIn('0 130 0',text)
        self.assertIn('function entersift:travel/arrive',fn('tunnel/exit'))
    def test_sift_arrival_has_visible_return_portal(self):
        self.assertIn('summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}',fn('travel/plaza'))
        self.assertIn('summon entersift:rift_portal ~ ~ ~ {Tags:["sift.return_anchor"],RiftType:4',fn('portal/return_tick'))
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
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['default_fluid'],'minecraft:air')
    def test_no_gamemode_or_inventory_takeover(self):
        for p in (D/'function').rglob('*.mcfunction'):
            for line in p.read_text().splitlines():
                self.assertFalse(line.startswith('gamemode '),str(p))
                self.assertFalse(line.startswith('clear '),str(p))
    def test_animated_fluid(self):
        p=R/'assets/entersift/textures/block/ichor_still.png.mcmeta'
        self.assertEqual(json.loads(p.read_text())['animation']['frametime'],3)
    def test_sift_tides_use_an_independent_clock(self):
        dim=read('dimension_type/the_sift.json')
        self.assertTrue(dim['has_skylight'])
        self.assertEqual(dim['default_clock'],'entersift:sift')
        self.assertEqual(dim['timelines'],['entersift:sift_cycle'])
        tl=read('timeline/sift_cycle.json')
        self.assertEqual(tl['clock'],'entersift:sift')
        self.assertEqual(tl['period_ticks'],24000)
        self.assertEqual({name: marker['ticks'] for name,marker in tl['time_markers'].items()},
                         {'entersift:flow':0,'entersift:thrive':6000,'entersift:endure':13000})
        self.assertIn('minecraft:visual/sun_angle',tl['tracks'])  # preserve 0.24's sky-angle track
        self.assertTrue((D/'world_clock/sift.json').exists())
        tides=(ROOT/'src/client/java/dev/logan/entersift/client/SiftTides.java').read_text()
        self.assertIn('getDefaultClockTime()',tides)
        self.assertIn('"Flow"',tides); self.assertIn('"Thrive"',tides); self.assertIn('"Endure"',tides)
        self.assertNotIn('fixed_time',dim)
    def test_sky_is_native_java_lava_lamp(self):
        sky=(ROOT/'src/client/java/dev/logan/entersift/client/SiftSky.java').read_text()
        # 0.11: private fog-free position_color types, no OIT (debugQuads made terrain flicker).
        self.assertIn('SiftRenderTypes.SKY',sky)                # 0.12: own pipeline, Iris maps it to skybasic
        self.assertIn('SiftRenderTypes.GLOW',sky)
        self.assertNotIn('debugQuads',sky)
        self.assertIn('startsWith("entersift:")',sky)          # dimension guard
        self.assertEqual(sky.count('pushPose()'),sky.count('popPose()'))
        self.assertIn('finally',sky)
        for layer in ['auroraCurtains','skyRays','worldBeams']: self.assertIn(f'void {layer}(',sky)
        self.assertNotIn('sunAndRay',sky)                       # 0.13: no sun in the Sift at all
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
        self.assertIn('SiftRenderTypes.RIFT_GLOW',client)  # 0.20: window + walls + additive rims
        self.assertNotIn('lensHalo',client)
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
        # 0.11: canyon walls / underground are rose-mauve crag rock (brick saltstone looked like a weird floor).
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['default_block'],'entersift:crag_rock')
        rule=read('worldgen/material_rule/the_sift.json')['sequence']
        self.assertEqual(rule[-1]['result_state'],'entersift:crag_rock')
        self.assertEqual(rule[-2]['then_run']['result_state'],'entersift:teal_path')  # bluish floor
        txt=json.dumps(rule)
        for b in ['entersift:blue_turf','entersift:pink_turf','entersift:pale_crust']: self.assertIn(b,txt)
        for v in ['minecraft:stone"','minecraft:calcite"','minecraft:andesite"','minecraft:tuff"']: self.assertNotIn(v,txt)
    def test_no_vanilla_blocks_in_sift_features_and_lots_of_foliage(self):
        banned=['minecraft:stone','minecraft:andesite','minecraft:tuff','minecraft:calcite','minecraft:mossy_cobblestone',
                'minecraft:pink_concrete','minecraft:orange_terracotta','minecraft:allium']
        for p in (D/'worldgen/feature').glob('*.json'):
            t=p.read_text()
            for b in banned: self.assertNotIn(f'"{b}"',t,p.name)
        meadow=read('worldgen/biome/singer_meadow.json')['features'][9]
        for f in ['blue_grass','pink_grass','glow_tuft']: self.assertIn(f'entersift:{f}_singer_meadow',meadow)
        java=(ROOT/'src/main/java/dev/logan/entersift/SiftContent.java').read_text()
        for b in ['crag_rock','blue_turf','pink_turf','blue_grass','pink_grass','glow_tuft','sift_bloom']: self.assertIn(f'"{b}"',java)
        dim=read('dimension_type/the_sift.json')['attributes']
        self.assertEqual(dim['minecraft:audio/background_music']['default']['sound'],'entersift:music.sift')
        self.assertEqual(dim['minecraft:audio/ambient_sounds']['loop'],'entersift:ambient.sift.loop')
    def test_every_creature_has_sounds(self):
        sounds=json.loads((R/'assets/entersift/sounds.json').read_text())
        for k in ['blub','sculker','sculkling','antlerling','drift_jelly','licker','overseer','twisted_warden','note_bird','singer','soul_bee','watchling']:
            for e in ['ambient','hurt','death']: self.assertIn(f'entity.{k}.{e}',sounds)
        self.assertTrue(all(s['stream'] for s in sounds['music.sift']['sounds']))
        for c in ['SiftBeast','SiftCritter']:
            j=(ROOT/f'src/main/java/dev/logan/entersift/{c}.java').read_text()
            for m in ['getHurtSound','getDeathSound','getAmbientSound']: self.assertIn(m,j)
    def test_old_shader_packs_are_removed(self):
        code=(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text()
        self.assertIn('Sift-Cinematic-',code)
        self.assertIn('deleteIfExists',code)
        # 0.18.2: the optional pack is kept up to date in place (same name) and never enabled.
        self.assertIn('Arrays.equals(Files.readAllBytes(target), bundled)',code)
        self.assertNotIn('iris.properties',code)   # never touches Iris config (pack stays off)
        self.assertIn("Dungeons-II-Overworld-0.15.zip",(ROOT/'build.gradle').read_text())
    def test_guardian_unlock_requires_death_and_link(self):
        self.assertIn('if score @s sift.link = #dead sift.link',fn('guardian/slain'))
        self.assertIn('tag @s add sift.ready',fn('guardian/unlock'))
        self.assertNotIn('unless entity',fn('guardian/slain'))
    def test_creature_eggs_have_functions_and_models(self):
        for name in ['blub','sculker','sculkling','antlerling','drift_jelly','licker','overseer','twisted_warden','singer','soul_bee','watchling']:
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
        for b in ['rose_spires','pale_grove','tidepool_reef','jelly_lands']:
            self.assertIn(f'entersift:{b}',[e['biome'] for e in dim])
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
        # 26.3 /time query takes a timeline id: the removed daytime keyword was a parse error that
        # stopped the whole function from loading, which is why every rift silently stopped working.
        # All gates now share rift/gate.
        gate=fn('rift/gate')
        self.assertIn('run time of minecraft:overworld query minecraft:day',gate)
        self.assertIn('run time of entersift:sift query entersift:sift_cycle',gate)
        self.assertIn('matches 13000..23999 run return 0',gate)
        self.assertIn('matches ..12999 run return 0',gate)
        self.assertIn('matches 23000.. run return 0',gate)
        self.assertIn('return 1',gate)
        for path in ('rift/natural','rift/create','rift/tick','rift/punch','rift/punch_at'):
            self.assertIn('function entersift:rift/gate',fn(path),path)
        self.assertIn('function entersift:rift/gate_denied',fn('rift/punch'))
        self.assertNotIn('rift/gate',fn('rift/seed'))            # creative seeds work at any hour
        self.assertIn('tag=sift.seeded] unless function entersift:rift/gate',fn('rift/tick'))
        renderer=(ROOT/'src/client/java/dev/logan/entersift/client/RiftPortalRenderer.java').read_text()
        self.assertIn('if (!s.night && s.type != RiftType.PORTAL) return;',renderer)
        self.assertNotIn('getOverworldClockTime()',renderer)
        self.assertIn('openingWindow(',renderer); self.assertIn('apertureShape(',renderer)
        self.assertIn('int k = 0; k < 9; k++',renderer)
        self.assertIn('int count = Math.round(7 *',renderer)
        self.assertIn('bolt(p, vc',renderer)  # lightning remains visible at night
    def test_rifts_are_entities_everywhere(self):
        import glob
        for path in (D/'function').rglob('*.mcfunction'):
            text=path.read_text()
            for tag in ['sift.rift_visual','sift.portal_anchor','sift.return_anchor']:
                for line in text.splitlines():
                    if tag in line and 'summon' in line:
                        self.assertIn('entersift:rift_portal',line,f'{path.name}: {line}')
        self.assertIn('matches 0 run scoreboard players set @s sift.target 3',fn('rift/create'))
        self.assertFalse((R/'assets/entersift/textures/rift').exists())   # 0.20: interiors are procedural GLSL
        self.assertIn('RIFT_PORTAL',(ROOT/'src/main/java/dev/logan/entersift/SiftEntities.java').read_text())
    def test_new_scenery_generates_in_biomes(self):
        b=read('worldgen/biome/singer_meadow.json')
        self.assertIn('entersift:weeping_soul_tree',b['features'][9])
        self.assertIn('entersift:ruined_arch',b['features'][9])
    def test_v012_iris_compat_and_accurate_rifts(self):
        c=ROOT/'src/client/java/dev/logan/entersift'
        rt=(c/'client/SiftRenderTypes.java').read_text()
        # Iris: pipelines assigned through the public API by reflection (Iris stays optional).
        for k in ['net.irisshaders.iris.api.v0.IrisApi','assignPipeline','"SKY_BASIC"','"BASIC"','isModLoaded("iris")','pipeline/sift_sky']:
            self.assertIn(k,rt)
        self.assertNotIn('import net.irisshaders',rt)
        self.assertIn('SiftRenderTypes.registerWithIris()',(c/'SiftClient.java').read_text())
        sp=ROOT/'shaderpack/shaders'
        for d in ['','world_overworld/','world_sift/']:
            self.assertIn('/program/gbuffers_color.fsh',(sp/f'{d}gbuffers_basic.fsh').read_text())
        self.assertIn('/program/gbuffers_color.vsh',(sp/'world_sift/gbuffers_skybasic.vsh').read_text())
        col=(sp/'program/gbuffers_color.fsh').read_text()
        self.assertIn('gl_FragData[0] = glcolor;',col)
        self.assertNotIn('#if SIFT_SKY_GLOW',(sp/'world_sift/composite.fsh').read_text())  # float #if is invalid GLSL
        self.assertIn('SIFT_SKY_GLOW',(sp/'shaders.properties').read_text())
        # Rifts: dimension-dependent views, inset canvas, gradient rim, distance zoom + parallax.
        rift=(c/'client/RiftPortalRenderer.java').read_text()
        for k in ['the_sift','void band(','float[] cube(']:
            self.assertIn(k,rift)
    def test_v012_soft_aurora_curtains(self):
        sky=(ROOT/'src/client/java/dev/logan/entersift/client/SiftSky.java').read_text()
        for gone in ['shardRibbons','auroraStreaks','void panel(']: self.assertNotIn(gone,sky)   # no hard rectangles
        self.assertIn('CURTAIN_ALPHA = 0.18f',sky)
        self.assertIn('smooth(0f, 0.18f, v)',sky)                                   # soft vertical margins
        self.assertIn('rgb(0x7FD3CF)',sky); self.assertIn('rgb(0x2E9AA6)',sky)       # teal-blue horizon, pale violet zenith
    def test_v013_pre_beta_fixes(self):
        c=ROOT/'src/client/java/dev/logan/entersift'
        sky=(c/'client/SiftSky.java').read_text()
        # No sun; multi-coloured god rays falling from the sky; NaN guards on every emitter.
        self.assertNotIn('sunAndRay(',sky)
        self.assertNotIn('sunDirection(tick)',sky.split('static float[] sunDirection')[0])
        for hue in ['0xFF6B7A','0xFFA54F','0x8CFF9E','0x6FF2E6','0xFF7AD9']: self.assertIn(hue,sky)
        self.assertIn('RAYS[',sky)
        self.assertGreaterEqual(sky.count('Float.isFinite'),2)
        self.assertIn('Float.isFinite',(c/'client/RiftPortalRenderer.java').read_text())
        # Overworld voxel clouds: no shader pack only, vanilla clouds restored, uniform underside.
        cl=(c/'client/SiftClouds.java').read_text()
        for k in ['shaderPackInUse()','minecraft:overworld','CloudStatus.OFF','CLIENT_STOPPING','SiftRenderTypes.CLOUDS','Float.isFinite']:
            self.assertIn(k,cl)
        self.assertEqual(cl.count('pushPose()'),cl.count('popPose()'))
        self.assertIn('SiftClouds.register()',(c/'SiftClient.java').read_text())
        self.assertIn('{CLOUD_PIPELINE, "BASIC"}',(c/'client/SiftRenderTypes.java').read_text())
        vc=(ROOT/'shaderpack/shaders/lib/voxel_clouds.glsl').read_text()
        self.assertNotIn('cloudHash(c.xz * 0.37)',vc)            # the random 0/1 base made a checkerboard
        # Blub: red eyes and mouth, wobbly waddle.
        cr=(ROOT/'tools/creatures.py').read_text()
        self.assertIn('BLUB_EYE, BLUB_MOUTH = (122, 16, 32), (122, 16, 32)',cr)
        md=(c/'client/SiftCreatureModel.java').read_text()
        self.assertIn('body.zRot += waddle',md)
        # Gigantic multi-tier trees.
        for n,lo in (('pale_tree',2000),('weeping_soul_tree',1200)):
            d=json.loads((R/f'data/entersift/worldgen/feature/{n}.json').read_text())
            self.assertGreater(len(d['features']),lo)
            for f in d['features']:
                for m in f['placement']:
                    if m['type']=='minecraft:offset': self.assertTrue(all(abs(m[k])<=16 for k in 'xyz'))
    def test_v014_soul_valley_campaign_peaks_souls_and_fog(self):
        java=(ROOT/'src/main/java/dev/logan/entersift/SiftContent.java').read_text()
        for b in ['verdant_wood','violet_wood','verdant_canopy','violet_canopy','valley_turf','ruin_bricks','mossy_ruin_bricks',
                  'ruin_tiles','cinder_rock','ash_crust','cinder_glow','ember_ore','sinter','valley_fern','violet_bloom']:
            self.assertIn(f'"{b}"',java)
            self.assertTrue((R/f'assets/entersift/blockstates/{b}.json').exists(), b)
            self.assertTrue((D/f'loot_table/blocks/{b}.json').exists(), b)
        # Proper multi-noise terrain, no checkerboard squares, amplified cliffs.
        dim=read('dimension/the_sift.json')
        src=dim['generator']['biome_source']
        self.assertEqual(src['type'],'minecraft:multi_noise')
        biomes={e['biome'] for e in src['biomes']}
        self.assertTrue({'entersift:soul_valley','entersift:campaign_peaks'} <= biomes)
        for b in biomes: self.assertTrue((D/f"worldgen/biome/{b.split(':')[1]}.json").exists(), b)
        ns=json.dumps(read('worldgen/noise_settings/the_sift.json'))
        self.assertNotIn('overworld_amplified',ns)
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['sea_level'],40)
        # Soul Valley: giant green + purple trees and ruins; Campaign Peaks: volcanoes, ore, ichor springs.
        valley=json.dumps(read('worldgen/biome/soul_valley.json')['features'])
        for f in ['verdant_tree','violet_tree','ruined_hut','ruined_tower','colossus_gate']: self.assertIn(f'entersift:{f}',valley)
        peaks=json.dumps(read('worldgen/biome/campaign_peaks.json')['features'])
        for f in ['ichor_volcano','ember_ore','ichor_spring','ichor_hot_spring','ember_shrine']: self.assertIn(f'entersift:{f}',peaks)
        rules=json.dumps(read('worldgen/material_rule/the_sift.json'))
        for b in ['valley_turf','cinder_rock','ash_crust','cinder_glow']: self.assertIn(f'entersift:{b}',rules)
        # Subtle per-biome fog: every biome tints (multiplies) a white dimension fog; the shader can switch it off.
        self.assertEqual(read('dimension_type/the_sift.json')['attributes']['minecraft:visual/fog_color'],'#ffffff')
        for f in (D/'worldgen/biome').glob('*.json'):
            self.assertIn('minecraft:visual/fog_color', json.loads(f.read_text()).get('attributes',{}), f.name)
        pack=ROOT/'shaderpack/shaders'
        self.assertIn('SIFT_DIM_FOG',(pack/'shaders.properties').read_text())
        self.assertIn('gbuffers_siftlit',(pack/'world_sift/gbuffers_terrain.fsh').read_text())
        # Wandering souls, ichor bubbles and the rift light spill.
        souls=(ROOT/'src/client/java/dev/logan/entersift/client/SiftSouls.java').read_text()
        self.assertIn('SiftRenderTypes.GLOW',souls); self.assertIn('the_sift',souls)
        self.assertIn('SiftSouls.register()',(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text())
        self.assertIn('animateTick',(ROOT/'src/main/java/dev/logan/entersift/IchorFluid.java').read_text())
        ents=(ROOT/'src/main/java/dev/logan/entersift/SiftEntities.java').read_text()
        self.assertIn('spawn("soul_valley"',ents); self.assertIn('spawn("campaign_peaks"',ents)
    def test_v0141_ritual_survives_duplicate_clicks(self):
        j=(ROOT/'src/main/java/dev/logan/entersift/EnterTheSift.java').read_text()
        self.assertIn('public static void strike(',j); self.assertIn('ticks - last < 8',j); self.assertIn('frameNear(',j)
        self.assertNotIn('AncientFrame.find(level,p',j)
        r=(ROOT/'src/main/java/dev/logan/entersift/RitualSequence.java').read_text()
        self.assertIn('Result.IGNORED',r); self.assertIn('{1, 3, 7, 6, 5, 2, 4, 8}',r)
        smoke=(ROOT/'src/main/java/dev/logan/entersift/SiftSmokeTest.java').read_text()
        self.assertIn('playRitual',smoke); self.assertIn('SIFT-SMOKE FAIL ritual',smoke)
    def test_v016_stretch_fix_transition_and_sinkhole(self):
        import re
        C=ROOT/'src/client/java/dev/logan/entersift/client'
        budget=(C/'SiftBudget.java').read_text()
        limit=int(re.search(r'MAX_VERTICES = ([0-9_]+);',budget).group(1).replace('_',''))
        self.assertLess(limit,65536); self.assertEqual(limit%4,0)          # 16-bit quad indices, whole quads only
        for f in ('SiftSky.java','SiftSouls.java','SiftClouds.java','RiftPortalRenderer.java'):
            code=(C/f).read_text()
            self.assertIn('SiftBudget.take(vc)',code,f)  # every emitter is budgeted
        clouds=(C/'SiftClouds.java').read_text()
        self.assertIn('CELL = 10',clouds); self.assertIn('SiftBudget.overworldClouds',clouds)
        client=(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text()
        self.assertLess(client.index('SiftBudget.reset()'),client.index('SiftSky.register()'))
        tr=(C/'SiftTransition.java').read_text()
        self.assertIn('RIFT_TRANSIT',tr); self.assertIn('0.55f',tr); self.assertIn('afterExtract',tr)
        self.assertIn('rift_transit',(ROOT/'src/main/java/dev/logan/entersift/SiftContent.java').read_text())
        begin=fn('travel/begin')
        self.assertIn('function entersift:tunnel/enter',begin)                # 0.17: walk the tunnel, no cutscene
        self.assertIn('effect give @s entersift:rift_transit 2 0 true',fn('travel/legacy_begin'))
        self.assertIn('matches 61..',fn('travel/transit_tick'))               # teleport at tick 60, under the flare
        for f in ('travel/warp_go','portal/cross','portal/return_tick'):   # 0.21: rifts go through travel/warp first
            self.assertIn('travel/begin {dest:',fn(f)); self.assertNotIn('travel/destination_',fn(f))
        self.assertIn('transit_tick',fn('player/tick'))
        T=ROOT/'src/main/resources/assets/entersift/textures'
        for f in ('gui/rift_flash.png','gui/rift_glitch.png','mob_effect/rift_transit.png'):
            self.assertTrue((T/f).is_file(),f)
        sky=(C/'SiftSky.java').read_text()
        self.assertIn('softPanels(',sky); self.assertIn('rgb(0xDB7840)',sky)

    def test_v015_portal_rifts_and_bundled_pack(self):
        import re
        code=(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text()
        gradle=(ROOT/'build.gradle').read_text()
        pack=re.search(r'PACK = "([^"]+)"',code).group(1)
        self.assertIn(f"archiveFileName = '{pack}'",gradle)      # 0.14 shipped mismatched names: no pack installed
        r=(ROOT/'src/client/java/dev/logan/entersift/client/RiftPortalRenderer.java').read_text()
        self.assertIn('4 ritual portal (cyan mosaic)',r)
        self.assertIn('vec3 viewPortal(',(R/'assets/entersift/shaders/core/rift.fsh').read_text())
    def test_v019_stacked_box_rifts_crack_free_and_coral_interior(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        rift=(C/'RiftPortalRenderer.java').read_text(); fsh=(S/'rift.fsh').read_text()
        # Stacked hollow boxes at different depths, with step walls and lip rims between them.
        shape=(C/'RiftShape.java').read_text()
        self.assertIn('boxes(',shape); self.assertIn('maxDepth',shape)
        # 0.20: no per-vertex jitter and no pixelated lens view; the window is sampled by view direction.
        self.assertNotIn('gameTime() * 0.4f',rift); self.assertNotIn('px(lens',fsh)
    def test_v020_clean_slate_rifts(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        rift=(C/'RiftPortalRenderer.java').read_text(); shape=(C/'RiftShape.java').read_text()
        fsh=(S/'rift.fsh').read_text(); vsh=(S/'rift.vsh').read_text(); types=(C/'SiftRenderTypes.java').read_text()
        # Everything from the old renderer is gone.
        self.assertFalse((C/'SiftLens.java').exists()); self.assertNotIn('RIFT_LENS',types)
        self.assertNotIn('SiftLens',(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text())
        self.assertNotIn('riftLens',(C/'SiftBudget.java').read_text())
        for t in ('rift_interiors.py','rift_scenes.py','preview_rifts.py'): self.assertFalse((ROOT/'tools'/t).exists())
        self.assertFalse(list((D/'function/rift').glob('pose_*.mcfunction')))
        self.assertNotIn('#riftphase',fn('rift/tick'))
        # 1. Direction-sampled window: sharp, un-warped, moves only with yaw and pitch.
        self.assertIn('worldRay = Position;',vsh)
        self.assertIn('vec3 dir = normalize(worldRay);',fsh)
        self.assertIn('float clouds(vec3 dir',fsh); self.assertIn('float ridge(float yaw',fsh)
        self.assertNotIn('Sampler0',fsh)
        # 2. Lifecycle (0.21: 0-100): ripple hard-stopped, tiered snap.
        self.assertIn('age < RIPPLE_END + 6 && age < GROWN',rift); self.assertIn('appearAt(',rift); self.assertIn('seedGlow(',rift)
        # 3. Wide soft additive night curtains replace laser poles.
        self.assertIn('private static void curtains(',rift)
        for c in ('0x2F6BFF','0x9FF6FF','0xD13CFF','0x7A3CFF'): self.assertIn(c,rift)
        self.assertIn('age >= GROWN && s.night',rift)
        # Slow crack-free wave strongest at the bottom; the geometry avoids T-junctions.
        self.assertIn('0.035f + 0.11f * low * low',rift); self.assertIn('t * 0.42f',rift)
        self.assertIn('no T-junctions',rift)
    def test_v021_biome_skies_awakening_voxels_warp_overlay(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'
        rift=(C/'RiftPortalRenderer.java').read_text(); sky=(C/'SiftSky.java').read_text(); hud=(C/'SiftTransition.java').read_text()
        # Directive 1: dimension guard, balanced push/pop, biome states A (meadow) and B (red canyons) + denser fog.
        self.assertIn('dim.equals(SiftContent.id("the_sift"))',sky)
        self.assertEqual(sky.count('pose.pushPose()'),sky.count('pose.popPose()'))
        self.assertIn('rgb(0x8FC2C4)',sky); self.assertIn('ELECTRIC_CYAN',sky); self.assertIn('BASIN_MAGENTA',sky)
        self.assertIn('"singer_meadow"',sky); self.assertIn('"rose_spires", "titan_crags"',sky)
        for b in ('rose_spires','titan_crags'):
            a=read(f'worldgen/biome/{b}.json')['attributes']
            self.assertLess(a['minecraft:visual/fog_end_distance'],200)
        # Directive 2: 100-tick awakening, one tier every 10 ticks, large dissolving voxel cubes per rift type.
        self.assertIn('RIPPLE_END = 30, SEED_START = 31, CLUSTER_START = 61, GROWN = 100',rift)
        self.assertIn('CLUSTER_START + Math.min(tier, RiftShape.TIERS - 1) * 10f',rift)
        self.assertIn('TIERS = 4',(C/'RiftShape.java').read_text())
        self.assertIn('private static void spark(',rift); self.assertIn('Math.sin(age * 2.2f)',rift)
        self.assertIn('(0.25f + 0.25f * RiftShape.hash(g, k, 7)) / 2f',rift)        # 0.25-0.5 block cubes
        self.assertIn('if (f >= 0.75f)',rift); self.assertIn('rgb(0xA8F5C8), rgb(0x3FF3FF), rgb(0xFFB8E0)',rift)
        self.assertIn('rgb(0xC0142A), rgb(0xFF6A1A), rgb(0xE0B040)',rift)
        self.assertIn('GROWN = 100',(ROOT/'src/main/java/dev/logan/entersift/RiftPortalEntity.java').read_text())
        self.assertIn('matches 100..5990',fn('rift/tick'))
        # Directive 3: direction window kept, safe rim shimmer, recessed alcove frame, warp overlay then tunnel.
        self.assertIn('float[] jit',rift); self.assertIn('private static void frame(',rift); self.assertIn('COLLAR = 0.3f',rift)
        self.assertIn('travel/warp {dest:',fn('rift/transport'))
        self.assertIn('effect give @s entersift:rift_transit 4 0 true',fn('travel/warp'))
        self.assertIn('matches 160.. run function entersift:travel/warp_go',fn('travel/transit_tick'))
        self.assertIn('matches 61..99 run function entersift:travel/transit_go',fn('travel/transit_tick'))
        self.assertIn('private static void warp(',hud); self.assertIn('Math.sin(seconds * 9.0) * 0.15f',hud)
    def test_v022_master_architecture_override(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        rift=(C/'RiftPortalRenderer.java').read_text(); shape=(C/'RiftShape.java').read_text()
        part=(C/'RiftEnergyCubeParticle.java').read_text(); hud=(C/'SiftTransition.java').read_text()
        tun=(C/'SiftTunnel.java').read_text(); fsh=(S/'rift.fsh').read_text(); tfsh=(S/'tunnel.fsh').read_text()
        # Part 1: Pure voxel geometry over spheres + 100-tick timeline + reduced downward motes
        self.assertNotIn('private static void ring(',rift); self.assertIn('hollowVoxelRect(',rift)
        self.assertIn('openingWindow(',rift); self.assertIn('apertureShape(',rift)
        self.assertNotIn('Math.cos(a)',shape); self.assertIn('rimCells',shape)
        self.assertIn('RiftEnergyCubeParticle.register()',(ROOT/'src/client/java/dev/logan/entersift/SiftClient.java').read_text())
        self.assertIn('velocity.y -= 0.04f',part); self.assertIn('currentAge >= 0.75f * totalMaxAge',part)
        self.assertIn('SIFT_PALETTE',part); self.assertIn('velocityY = -0.035f',rift)
        # Part 2: Immersive Viewport Multi-Dimension Engine (secondary FBO pass + multi-pass box-blur + emissive overlay)
        self.assertIn('renderSecondaryFboViewportPass(',rift); self.assertIn('boxBlurPass(',rift)
        self.assertIn('getYaw(',rift); self.assertIn('getPitch(',rift)
        self.assertIn('VIBRANT_PINK_DAY',rift); self.assertIn('DEEP_AMBER_NIGHT',rift)
        self.assertIn('boxBlurViewport(',fsh); self.assertIn('vibrantPinkDay',fsh); self.assertIn('deepAmberNight',fsh)
        # Part 3: Seamless Transition (Ticks 0-40 RGB split, 41-60 orange flare, Tick 60 tunnel) & Voxel Corridor
        self.assertIn('Math.sin(gameTime) * 0.15',hud)
        self.assertNotIn('private static void sphere(',tun)
        self.assertIn('voxelSkybox(',tun); self.assertIn('voxelRings(',tun)
        self.assertIn('voxelRing',tfsh)
    def test_v0182_gpu_rifts_under_iris_and_pack_updates(self):
        c=ROOT/'src/client/java/dev/logan/entersift'
        types=(c/'client/SiftRenderTypes.java').read_text()
        rend=(c/'client/RiftPortalRenderer.java').read_text()
        tun=(c/'client/SiftTunnel.java').read_text()
        # GPU rifts are no longer disabled by a shader pack; only the rift_shader option turns them off.
        self.assertNotIn('shaderPackInUseCached()',rend); self.assertNotIn('shaderPackInUseCached()',tun)
        self.assertIn('boolean gpu = SiftBudget.riftShader;',rend)
        self.assertIn('irisShadowPass()',rend); self.assertIn('irisShadowPass()',tun)
        self.assertIn('"isRenderingShadowPass"',types)
        # The GLSL rift pipelines must stay unassigned (Iris then draws them with our own shader).
        pairs=types[types.index('Object[][] pairs'):].split(';')[0]
        for p in ['RIFT_PIPELINE','RIFT_WALL_PIPELINE','RIFT_GLOW_PIPELINE','TUNNEL_PIPELINE']:
            self.assertNotIn(p,pairs)
        # Pack masks: full-bright lightmap + non-world normal on opaque passes, zeros on blended ones.
        core=ROOT/'src/main/resources/assets/entersift/shaders/core'
        for f in ['rift.fsh','tunnel.fsh']:
            t=(core/f).read_text()
            self.assertIn('layout(location = 1) out vec4 packLight;',t)
            self.assertIn('layout(location = 2) out vec4 packNormal;',t)
            self.assertIn('packNormal = vec4(0.5, 0.5, 1.0, 0.0);',t)
        self.assertIn('#if defined(RIFT_GLOW)',(core/'rift.fsh').read_text())
        # The pack composites skip pixels whose normal alpha is 0.
        pack=ROOT/'shaderpack/shaders'
        self.assertIn('if (nb.a > 0.5)',(pack/'program/composite.fsh').read_text())
        self.assertIn('if (nb.a < 0.5) return base;',(pack/'world_sift/composite.fsh').read_text())
        # Pack auto-updates in place, reproducible zip so unchanged packs are not rewritten.
        client=(c/'SiftClient.java').read_text()
        self.assertIn('StandardCopyOption.REPLACE_EXISTING',client)
        g=(ROOT/'build.gradle').read_text()
        self.assertIn('preserveFileTimestamps = false',g); self.assertIn('reproducibleFileOrder = true',g)
        self.assertIn('mod_version=0.25.0-alpha',(ROOT/'gradle.properties').read_text())
    def test_v024_trailer_accuracy_overhaul(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        shape=(C/'RiftShape.java').read_text(); rift=(C/'RiftPortalRenderer.java').read_text()
        fsh=(S/'rift.fsh').read_text(); sky=(C/'SiftSky.java').read_text()
        aura=(C/'AuraColumns.java').read_text(); clouds=(C/'SiftClouds.java').read_text()
        # Unified stepped-cross cavity + wavy side walls & wavy interior vistas
        self.assertIn('box[i][j] = 0;',shape); self.assertIn('rectSub(',rift); self.assertIn('wavySideVeils(',rift)
        self.assertIn('wavyCoords(',fsh); self.assertIn('canopyTreesAndMesas(',fsh)
        # Sift aurora panels + floating musical note glyphs inside rainbow columns
        self.assertIn('0x68FFD0',sky); self.assertIn('noteGlyphs(',aura)
        # Dungeons II Overworld stepped voxel clouds + periwinkle shadows
        self.assertIn('bottomCore',clouds)
        ow=(ROOT/'shaderpack/shaders/lib/overworld.glsl').read_text()
        self.assertIn('periwinkle',ow)
    def test_v0181_destination_viewports_jitter_and_evening_columns(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        rift=(C/'RiftPortalRenderer.java').read_text(); fsh=(S/'rift.fsh').read_text()
        for v in ('viewOverworld','viewNether','viewEnd','viewSift','viewGold','destination('): self.assertIn(v,fsh)
        self.assertIn('static int viewCode(RiftType type, boolean inSift)',rift)
        self.assertIn('clock >= 13_000L && clock < 23_000L',rift)                         # strict local night; Endure in the Sift
        self.assertIn('rgb(0x2F6BFF)',rift); self.assertIn('rgb(0xD13CFF)',rift)            # blue / magenta curtains
    def test_v018_shader_rifts_real_lens_warp_tunnel_frostbloom(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'; S=R/'assets/entersift/shaders/core'
        rift=(C/'RiftPortalRenderer.java').read_text(); types=(C/'SiftRenderTypes.java').read_text()
        # The whole rift goes through the rift GLSL program; real lensing samples a scene copy.
        for k in ('RIFT_WALL','RIFT_GLOW'): self.assertIn(k,types); self.assertIn(k,(S/'rift.fsh').read_text())
        self.assertNotIn('RIFT_HALO',types); self.assertNotIn('LENS JITTER',rift)
        self.assertIn('random value 6..9',fn('rift/style')); self.assertIn('distance=..3.0',fn('rift/transport'))
        # Warp tunnel: invisible barriers, shorter, client-drawn burst.
        self.assertIn('minecraft:barrier hollow',fn('tunnel/build')); self.assertNotIn('tunnel_rib',fn('tunnel/build'))
        self.assertIn('matches 28..',fn('tunnel/player_tick')); self.assertNotIn('particle minecraft:',fn('tunnel/player_tick'))
        self.assertIn('{v:2b}',fn('travel/begin')); self.assertIn('{v:2b}',fn('world/tick'))
        self.assertTrue((S/'tunnel.fsh').exists()); self.assertIn('TUNNEL',types)
        self.assertIn('rift_tunnel',(C/'SiftTunnel.java').read_text())
        # Frostbloom Spires and giant trees (no single-log trees).
        lang=json.loads((R/'assets/entersift/lang/en_us.json').read_text())
        self.assertEqual(lang['biome.entersift.titan_crags'],'Frostbloom Spires')
        self.assertIn('entersift:rose_spire',json.dumps(json.loads((D/'worldgen/material_rule/the_sift.json').read_text())))
        for t in ('pale_tree','weeping_soul_tree','verdant_tree','violet_tree','crag_tree'):
            n=len(json.loads((D/f'worldgen/feature/{t}.json').read_text())['features']); self.assertGreater(n,4000,t)
        self.assertNotIn('crag_rock"',(D/'worldgen/feature/titan_crag.json').read_text())
        # Shader pack: sunset god rays in both worlds; bigger sky panels.
        self.assertIn('siftRays(',(ROOT/'shaderpack/shaders/world_sift/composite.fsh').read_text())
        self.assertIn('3.5 * owDusk',(ROOT/'shaderpack/shaders/program/composite.fsh').read_text())
        self.assertIn('hw = 0.30',(C/'SiftSky.java').read_text())
    def test_v017_two_skies_gpu_rifts_tunnel_block_portal(self):
        C=ROOT/'src/client/java/dev/logan/entersift/client'
        sky=(C/'SiftSky.java').read_text()
        for k in ('SWIRL_BIOMES','swirlBlobs','softPanels','SKY_BLEND','updateMode'): self.assertIn(k,sky)
        for b in ('coral_expanse','tidepool_reef','singer_meadow','soul_valley'):
            self.assertIn(f'"{b}"',sky); self.assertTrue((D/f'worldgen/biome/{b}.json').exists(),b)
        self.assertIn('SKY_BLEND',(C/'SiftRenderTypes.java').read_text())
        # GPU rift shader with lensing, night aura and aura columns instead of beacon beams.
        S=R/'assets/entersift/shaders/core'
        self.assertTrue((S/'rift.vsh').exists()); self.assertIn('void main',(S/'rift.fsh').read_text())
        self.assertIn('RIFT',(C/'SiftRenderTypes.java').read_text())
        self.assertTrue((ROOT/'src/main/java/dev/logan/entersift/AuraColumnEntity.java').exists())
        for f in (D/'function/notes').glob('*.mcfunction'):
            self.assertNotIn('beacon',f.read_text().lower().replace('beacon_power',''),f.name)
        # Walkable rift tunnel dimension, no cutscene.
        self.assertTrue((D/'dimension/rift_tunnel.json').exists())
        self.assertIn('tunnel/enter',fn('travel/begin'))
        for f in ('build','enter','exit','player_tick'): self.assertTrue((D/f'function/tunnel/{f}.mcfunction').exists(),f)
        # Real breakable block portal with an animated texture and a glowing base.
        content=(ROOT/'src/main/java/dev/logan/entersift/SiftContent.java').read_text()
        self.assertIn('SIFT_PORTAL',content); self.assertIn('SIFT_PORTAL_BASE',content)
        self.assertIn('entersift:sift_portal',fn('portal/fill'))
        T=R/'assets/entersift/textures/block'
        for t in ('sift_portal','sift_portal_base','tunnel_wall'): self.assertTrue((T/f'{t}.png.mcmeta').exists(),t)
        # Souls: denser with blue trails.
        souls=(C/'SiftSouls.java').read_text(); self.assertIn('CELL = 32',souls)
        # Blub: matching dark eyes and mouth; twisted warden navy/teal/green.
        cr=(ROOT/'tools/creatures.py').read_text()
        self.assertIn('BLUB_EYE, BLUB_MOUTH = (122, 16, 32), (122, 16, 32)',cr); self.assertIn('"starry"',cr)
        # Shader pack: Sift shadows + sky-tinted light; iris.properties is never touched.
        sp=ROOT/'shaderpack/shaders'
        comp=(sp/'world_sift/composite.fsh').read_text()
        self.assertIn('sunVisibility',comp); self.assertIn('skyColor',comp)
        self.assertTrue((sp/'world_sift/shadow.vsh').exists())
        self.assertIn('SIFT_SIFT_LIGHT',(sp/'shaders.properties').read_text())
        self.assertIn('MAX_H = 24f',(C/'SiftClouds.java').read_text())
    def test_eight_fixture_notes_have_sonorous_support(self):
        self.assertEqual(fn('dev/arena').count('entersift:sonorous_deepslate'),8)
        for pitch in range(8):self.assertIn(f'noteblock[note={pitch}]'.replace('noteblock','note_block'),fn('dev/arena'))

    def test_sift_overhaul_025_acceptance(self):
        # Clock stays local to the Sift, and the worldgen no longer fills aquifers with Ichor.
        self.assertEqual(read('dimension_type/the_sift.json')['default_clock'],'entersift:sift')
        self.assertEqual(read('timeline/sift_cycle.json')['clock'],'entersift:sift')
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['default_fluid'],'minecraft:air')
        self.assertNotIn('overworld_amplified',json.dumps(read('worldgen/noise_settings/the_sift.json')))
        self.assertEqual(read('worldgen/noise_settings/the_sift.json')['sea_level'],40)
        for feature in ('ichor_lake','ichor_hot_spring'):
            data=read(f'worldgen/feature/{feature}.json')
            self.assertEqual(data['type'],'minecraft:delta_feature')
            self.assertLessEqual(data['size']['max_inclusive'],2)
        for feature, chance in (('ichor_lake',64),('ichor_hot_spring',96),('ichor_spring',96),('ichor_volcano',256)):
            self.assertEqual(read(f'worldgen/placed_feature/{feature}.json')['placement'][0]['chance'],chance)
        import struct
        for texture in ('ichor_still','ichor_flow','ichor_overlay'):
            data=(R/f'assets/entersift/textures/block/{texture}.png').read_bytes()
            width,height=struct.unpack('!II',data[16:24])
            self.assertEqual((width,height),(32,1536))
        # Canopy retains its old key but now places unmistakable, large visible fossil structures.
        self.assertEqual(json.loads((R/'assets/entersift/lang/en_us.json').read_text())['biome.entersift.boneyard'],'Canopy')
        skull=read('worldgen/feature/giant_skull.json')
        self.assertGreater(len(skull['features']),2000)
        self.assertIn('minecraft:bone_block',json.dumps(skull))
        canopy=json.dumps(read('worldgen/biome/boneyard.json')['features'])
        for feature in ('giant_skull','bone_tusk','boneyard_ribcage'):
            self.assertIn(f'entersift:{feature}',canopy)
        # Jelly Lands has a short blue fog range, pink ground cover, pale trees, and many Blubs.
        jelly=read('worldgen/biome/jelly_lands.json')
        attrs=jelly['attributes']
        self.assertEqual(attrs['minecraft:visual/fog_color'],'#173b95')
        self.assertLessEqual(attrs['minecraft:visual/fog_end_distance'],64)
        self.assertIn('entersift:pale_tree',jelly['features'][9])
        self.assertIn('entersift:pink_grass_pale_grove',jelly['features'][9])
        rule=json.dumps(read('worldgen/material_rule/the_sift.json'))
        self.assertIn('entersift:jelly_lands',rule); self.assertIn('entersift:pink_turf',rule)
        dim=read('dimension/the_sift.json')['generator']['biome_source']['biomes']
        self.assertIn('entersift:jelly_lands',[entry['biome'] for entry in dim])
        mobs=(ROOT/'src/main/java/dev/logan/entersift/SiftEntities.java').read_text()
        self.assertIn('spawn("jelly_lands", MobCategory.CREATURE, SiftKind.BLUB, 48, 3, 6)',mobs)
        self.assertIn('entersift:jelly_lands',fn('world/pulse'))
        # Rifts are gated to local night/Endure; the opening is circular, twisted, and less particle-heavy.
        rift=(ROOT/'src/client/java/dev/logan/entersift/client/RiftPortalRenderer.java').read_text()
        self.assertIn('SiftTides.isEndure(clock)',rift)
        self.assertIn('openingWindow(',rift); self.assertIn('rippleRing(',rift)
        self.assertIn('if (!s.night && s.type != RiftType.PORTAL) return;',rift)
        self.assertIn('int k = 0; k < 9; k++',rift)
        self.assertIn('int count = Math.round(7 *',rift)
        # Rifts are gated to local night/Endure through the shared 26.3 timeline query (rift/gate).
        self.assertIn('query entersift:sift_cycle',fn('rift/gate'))
        self.assertIn('function entersift:rift/gate',fn('rift/create'))
        self.assertIn('function entersift:rift/gate',fn('rift/tick'))
        self.assertIn('RiftType:4,Width:3f,Height:4f',fn('portal/return_tick'))
        props=(ROOT/'gradle.properties').read_text()
        self.assertIn('mod_version=0.25.0-alpha',props)
        self.assertIn('archives_base_name=sift-overhaul',props)
    def test_no_removed_time_query_keywords(self):
        # 26.x replaced "time query daytime|day" with "time query <timeline>"; only gametime survives.
        for p in (D/'function').rglob('*.mcfunction'):
            for line in p.read_text().splitlines():
                if 'run time query ' in line:
                    self.assertIn('time query gametime',line,str(p))
if __name__=='__main__': unittest.main(verbosity=2)
