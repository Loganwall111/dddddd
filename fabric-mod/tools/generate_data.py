"""Deterministic data/resource authoring. Run from any directory; no network required."""
from pathlib import Path
import json, math, struct, zlib, colorsys, random
ROOT = Path(__file__).resolve().parents[1]
RES = ROOT/'src/main/resources'
DATA = RES/'data/entersift'
def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True); path.write_text(text.strip()+'\n')
def js(path, obj): write(path, json.dumps(obj, indent=2))
def fn(name, text): write(DATA/'function'/f'{name}.mcfunction', text)
def asset(path, obj): js(RES/'assets/entersift'/path, obj)
js(RES/'pack.mcmeta', {'pack': {'description':'Enter the Sift • salt, souls and thresholds', 'min_format':[97,1], 'max_format':[121,0]}})
for tag in ['load','tick']: js(RES/f'data/minecraft/tags/function/{tag}.json', {'values':[f'entersift:{tag}']})
objectives = ['souls','ghost','cooldown','age','target','clock','roll','rx','ry','rz','rdim','return','deaths','seen']
fn('load', '\n'.join(f'scoreboard objectives add sift.{o} '+('deathCount' if o=='deaths' else 'dummy') for o in objectives)+'''
scoreboard players add #time sift.clock 0
execute unless score #rifts sift.roll matches 0..1 run scoreboard players set #rifts sift.roll 1
execute unless score #haunt sift.roll matches 0..1 run scoreboard players set #haunt sift.roll 0
''')
dims=['minecraft:overworld','minecraft:the_nether','minecraft:the_end','entersift:the_sift']
load_file=DATA/'function/load.mcfunction'
write(load_file, load_file.read_text()+'\n'+ '\n'.join(f'execute in {d} run forceload add -4 -4 4 4' for d in dims))
fn('admin/release_chunks', '\n'.join(f'execute in {d} run forceload remove -4 -4 4 4' for d in dims))
fn('tick', '''
scoreboard players add #time sift.clock 1
execute as @a at @s run function entersift:player/tick
'''+ '\n'.join(f'execute in {d} run function entersift:world/tick' for d in dims)+'''
execute if score #time sift.clock matches 600.. run function entersift:world/pulse
''')
fn('player/init', '''
scoreboard players set @s sift.souls 20
scoreboard players set @s sift.ghost 0
scoreboard players set @s sift.cooldown 0
scoreboard players set @s sift.return 0
scoreboard players set @s sift.deaths 0
scoreboard players set @s sift.seen 0
tag @s add sift.player
tellraw @s {"text":"Enter the Sift • The city remembers six colours. Red → Magenta → Pink → Cyan → Blue → Purple.","color":"aqua"}
''')
fn('player/tick', '''
execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.deaths > @s sift.seen run function entersift:player/death
scoreboard players operation @s sift.seen = @s sift.deaths
scoreboard players remove @s[scores={sift.cooldown=1..}] sift.cooldown 1
scoreboard players remove @s[scores={sift.ghost=1..}] sift.ghost 1
execute if score @s sift.ghost matches 1.. run function entersift:soul/ghost_tick
execute if score @s sift.ghost matches 0 if entity @s[tag=sift.ghost] run function entersift:soul/end
execute store result score #second sift.roll run time query gametime
scoreboard players set #twenty sift.roll 20
scoreboard players operation #second sift.roll %= #twenty sift.roll
execute if score #second sift.roll matches 0 if block ~ ~ ~ entersift:ichor run function entersift:soul/ichor
execute if score #second sift.roll matches 0 if dimension entersift:the_sift run function entersift:player/second
''')
fn('player/death', '''
scoreboard players set @s sift.ghost 0
scoreboard players set @s sift.return 0
scoreboard players set @s sift.souls 20
tag @s remove sift.ghost
''')
fn('player/second', '''
execute if dimension entersift:the_sift run particle minecraft:soul ~ ~1 ~ 7 3 7 0.015 6 normal @s
execute if dimension entersift:the_sift run title @s actionbar [{"text":"THE SIFT  ◇  Souls: ","color":"aqua"},{"score":{"name":"@s","objective":"sift.souls"}},{"text":"  •  Keep away from ichor.","color":"gray"}]
execute if block ~ ~-1 ~ entersift:soul_salt if score @s sift.souls matches ..99 run scoreboard players add @s sift.souls 1
''')
fn('soul/ichor', '''
damage @s 2 minecraft:magic
scoreboard players remove @s sift.souls 3
execute if score @s sift.souls matches ..-1 run scoreboard players set @s sift.souls 0
effect give @s minecraft:weakness 3 0 true
execute if score @s sift.souls matches 0 run effect give @s minecraft:wither 2 0 true
particle minecraft:witch ~ ~0.5 ~ 0.4 0.4 0.4 0.01 12 normal
''')
fn('soul/drink', '''
scoreboard players add @s sift.souls 40
execute if score @s sift.souls matches 101.. run scoreboard players set @s sift.souls 100
scoreboard players set @s sift.ghost 600
tag @s add sift.ghost
effect give @s minecraft:invisibility 30 0 true
effect give @s minecraft:slow_falling 30 0 true
playsound minecraft:entity.allay.ambient_without_item player @s ~ ~ ~ 0.8 0.7
title @s actionbar {"text":"Your body fades. 30 seconds between worlds.","color":"aqua"}
''')
fn('soul/ghost_tick', '''
particle minecraft:soul ~ ~0.7 ~ 0.2 0.4 0.2 0.002 1 normal
execute if score #haunt sift.roll matches 1 as @a[distance=0.1..3,gamemode=!spectator] run effect give @s minecraft:glowing 1 0 true
''')
fn('soul/end', '''
tag @s remove sift.ghost
playsound minecraft:block.amethyst_block.chime player @s ~ ~ ~ 0.4 0.5
title @s actionbar {"text":"Your soul returns to its vessel.","color":"gray"}
''')
# Persist source coordinates in scores. A function-local macro compound is filled only at return time.
fn('travel/save', '''
execute store result score @s sift.rx run data get entity @s Pos[0] 1
execute store result score @s sift.ry run data get entity @s Pos[1] 1
execute store result score @s sift.rz run data get entity @s Pos[2] 1
'''+ '\n'.join(f'execute if dimension {d} run scoreboard players set @s sift.rdim {i}' for i,d in enumerate(dims))+'''
scoreboard players set @s sift.return 1
''')
fn('travel/return', '''
execute unless score @s sift.return matches 1 run return 0
execute store result storage entersift:transit x double 1 run scoreboard players get @s sift.rx
execute store result storage entersift:transit y double 1 run scoreboard players get @s sift.ry
execute store result storage entersift:transit z double 1 run scoreboard players get @s sift.rz
'''+ '\n'.join(f'execute if score @s sift.rdim matches {i} run data modify storage entersift:transit dimension set value "{d}"' for i,d in enumerate(dims))+'''
function entersift:travel/return_macro with storage entersift:transit
scoreboard players set @s sift.return 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 10 0 true
''')
fn('travel/return_macro', '$execute in $(dimension) run tp @s $(x) $(y) $(z)')
fn('travel/sift', '''
execute in entersift:the_sift unless loaded 0 300 0 run return 0
execute in entersift:the_sift positioned 0 300 0 unless block ~ ~ ~ minecraft:air run return 0
execute in entersift:the_sift positioned 0 301 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in entersift:the_sift positioned 0 300 0 run function entersift:travel/pad
execute in entersift:the_sift run tp @s 0 300 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 120 0 true
title @s title {"text":"THE SIFT","color":"aqua"}
title @s subtitle {"text":"Everything lost eventually settles here.","color":"gray"}
''')
# High-altitude arrival pads leave existing terrain untouched. Nether uses the roof, explicitly alpha.
for i,d in enumerate(dims):
    y=130 if i==1 else 300
    fn(f'travel/destination_{i}', f'''
execute in {d} unless loaded 0 {y} 0 run return 0
execute in {d} positioned 0 {y} 0 unless block ~ ~ ~ minecraft:air run return 0
execute in {d} positioned 0 {y+1} 0 unless block ~ ~ ~ minecraft:air run return 0
execute unless score @s sift.return matches 1 run function entersift:travel/save
execute in {d} positioned 0 {y} 0 run function entersift:travel/pad
execute in {d} run tp @s 0 {y} 0
scoreboard players set @s sift.cooldown 100
effect give @s minecraft:slow_falling 120 0 true
''')
fn('travel/pad', '''
fill ~-4 ~-1 ~-4 ~4 ~-1 ~4 entersift:salt replace minecraft:air
execute unless entity @e[type=minecraft:marker,tag=sift.return_gate,distance=..5] run summon minecraft:marker ~3 ~ ~ {Tags:["sift.return_gate"]}
''')
fn('world/tick', '''
execute as @e[type=minecraft:marker,tag=sift.ritual] at @s run function entersift:ritual/tick
execute as @e[type=minecraft:marker,tag=sift.portal] at @s run function entersift:portal/tick
execute as @e[type=minecraft:marker,tag=sift.return_gate] at @s run function entersift:portal/return_tick
execute as @e[type=minecraft:marker,tag=sift.rift] at @s run function entersift:rift/tick
execute as @e[type=minecraft:rabbit,tag=sift.blub] at @s run function entersift:blub/tick
execute as @e[type=minecraft:evoker,tag=sift.riftcaller] at @s run function entersift:illager/tick
execute as @e[type=minecraft:block_display,tag=sift.blub_visual] at @s unless entity @e[type=minecraft:rabbit,tag=sift.blub,distance=..2] run kill @s
''')
# Unique local visuals: no broad kill/select that could affect a different city.
fn('ritual/begin', '''
execute if entity @e[type=minecraft:marker,tag=sift.portal,distance=..2] run return 0
execute if entity @e[type=minecraft:marker,tag=sift.ritual,distance=..2] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.ritual"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.ritual,distance=..1,limit=1,sort=nearest] sift.age 0
function entersift:ritual/singer
playsound minecraft:block.sculk_shrieker.shriek ambient @a[distance=..32] ~ ~ ~ 0.6 0.6
''')
# Block display rigs use custom textures and local transformations (no global vanilla texture replacement).
def display(block, translation, scale, tags, light=12):
    def fl(v): return '['+','.join(f'{float(x)}f' for x in v)+']'
    return '{id:"minecraft:block_display",Tags:['+','.join('"'+t+'"' for t in tags)+'],block_state:{id:"'+block+'"},brightness:{block:'+str(light)+',sky:0},transformation:{translation:'+fl(translation)+',scale:'+fl(scale)+',left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}'
def summon_display(block, t, scale, tag):
    return 'summon minecraft:block_display ~ ~ ~ '+display(block,t,scale,[tag]).replace('id:"minecraft:block_display",','',1)
fn('ritual/singer', '\n'.join([
    summon_display('entersift:carapace',[-.25,-1.6,-.18],[.5,1.6,.36],'sift.singer'),
    summon_display('entersift:carapace',[-.5,0,-.35],[1,.65,.7],'sift.singer'),
    summon_display('entersift:soul_salt',[-.33,.22,-.39],[.18,.1,.05],'sift.singer'),
    summon_display('entersift:soul_salt',[.15,.22,-.39],[.18,.1,.05],'sift.singer'),
    summon_display('entersift:carapace',[-.7,-1.4,-.12],[.17,1.4,.24],'sift.singer'),
    summon_display('entersift:carapace',[.53,-1.4,-.12],[.17,1.4,.24],'sift.singer'),
]))
ritual='''
scoreboard players add @s sift.age 1
execute if score @s sift.age matches 1..80 as @e[type=minecraft:block_display,tag=sift.singer,distance=..5] at @s run tp @s ~ ~0.025 ~
particle minecraft:soul ~ ~ ~ 1 0.3 1 0.01 2 normal
'''
for index,(tick,pitch) in enumerate(zip([80,104,128,152,176,200],[.5,.63,.75,1,1.12,1.5])):
    ritual+=f'execute if score @s sift.age matches {tick} run function entersift:ritual/note_{index} with entity @s data\n'
    fn(f'ritual/note_{index}', f'$execute positioned $(n{index}x) $(n{index}y) $(n{index}z) run playsound minecraft:block.note_block.chime ambient @a[distance=..40] ~ ~ ~ 2 {pitch}\n$execute positioned $(n{index}x) $(n{index}y) $(n{index}z) run particle minecraft:soul ~0.5 ~1 ~0.5 0.1 0.2 0.1 0.01 8 normal')
    ritual+=f'execute if score @s sift.age matches {tick} run particle minecraft:sonic_boom ~ ~1 ~ 0 0 0 0 1 normal\n'
for tick in range(160,220,8): ritual+=f'execute if score @s sift.age matches {tick} run particle minecraft:reverse_portal ~ ~2 ~ 2 2 0.2 0.1 80 normal\n'
ritual+='execute if score @s sift.age matches 220.. run function entersift:portal/open'
fn('ritual/tick',ritual)
fn('portal/open', '''
kill @e[type=minecraft:block_display,tag=sift.singer,distance=..6]
tag @s remove sift.ritual
tag @s add sift.portal
playsound minecraft:block.end_portal.spawn ambient @a[distance=..48] ~ ~ ~ 0.7 0.7
'''+'function entersift:portal/visual with entity @s data')
fn('portal/visual', '$summon minecraft:block_display ~ ~ ~ {Tags:["sift.portal_visual"],block_state:{id:"entersift:threshold"},brightness:{block:15,sky:0},transformation:{translation:[$(tx)f,0f,$(tz)f],scale:[$(sx)f,$(sy)f,$(sz)f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}')
fn('portal/tick', '''
particle minecraft:reverse_portal ~ ~2 ~ 1.5 2 0.1 0.025 5 normal
function entersift:portal/cross with entity @s data
''')
fn('portal/cross', '''
# The Agency Portal is two-way: enter the Sift from outside, return through it from inside.
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0},gamemode=!spectator] at @s if dimension entersift:the_sift if score @s sift.return matches 1 run function entersift:travel/begin {dest:5}
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0,sift.return=0},gamemode=!spectator] at @s if dimension entersift:the_sift run function entersift:travel/begin {dest:0}
$execute positioned ~$(tx) ~ ~$(tz) as @a[dx=$(sx),dy=$(sy),dz=$(sz),scores={sift.cooldown=0},gamemode=!spectator] at @s unless dimension entersift:the_sift run function entersift:travel/begin {dest:4}
''')
fn('portal/return_tick', '''
particle minecraft:end_rod ~ ~2 ~ 0.2 1.6 1.2 0.01 2 normal
execute as @a[distance=..1.8,scores={sift.cooldown=0,sift.return=1},gamemode=!spectator] at @s run function entersift:travel/begin {dest:5}
execute as @a[distance=..1.8,scores={sift.cooldown=0,sift.return=0},gamemode=!spectator] at @s run function entersift:travel/begin {dest:0}
execute unless entity @e[type=entersift:rift_portal,tag=sift.return_anchor,distance=..1] run summon entersift:rift_portal ~ ~ ~ {Tags:["sift.return_anchor"],RiftType:0,Width:3f,Height:4f,Rotation:[90f,0f]}
''')
fn('rift/punch', '''
execute unless entity @s[tag=sift.player] run function entersift:player/init
execute if score @s sift.cooldown matches 1.. run return 0
execute if score @s sift.souls matches ..9 run title @s actionbar {"text":"The gauntlet needs 10 souls.","color":"red"}
execute if score @s sift.souls matches ..9 run return 0
execute anchored eyes positioned ^ ^-0.8 ^3 unless block ~ ~ ~ minecraft:air run return 0
execute anchored eyes positioned ^ ^-0.8 ^3 if entity @e[type=minecraft:marker,tag=sift.rift,distance=..12] run return 0
scoreboard players remove @s sift.souls 10
scoreboard players set @s sift.cooldown 60
execute anchored eyes positioned ^ ^-0.8 ^3 run function entersift:rift/create
''')
fn('rift/create', '''
execute if entity @e[type=minecraft:marker,tag=sift.rift,distance=..12] run return 0
summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] sift.age 0
execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] store result score @s sift.target run random value 0..3
tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift
playsound minecraft:entity.enderman.teleport ambient @a[distance=..24] ~ ~ ~ 0.8 0.5
''')
fn('rift/tick', '''
scoreboard players add @s sift.age 1
particle minecraft:reverse_portal ~ ~0.7 ~ 0.15 1 0.15 0.1 6 normal
execute if score @s sift.age matches 40..850 run function entersift:rift/transport
execute if score @s sift.age matches 900.. run kill @s
''')
fn('rift/transport', '\n'.join(f'execute if score @s sift.target matches {i} as @a[distance=..1.5,scores={{sift.cooldown=0}},gamemode=!spectator] at @s run function entersift:travel/destination_{i}' for i in range(4)))
fn('world/pulse', '''
scoreboard players set #time sift.clock 0
execute if score #rifts sift.roll matches 1 as @a[gamemode=survival] at @s run function entersift:world/roll
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[tag=sift.blub,distance=..48] positioned ~4 ~ ~4 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:blub/spawn
''')
fn('world/roll', '''
execute store result score #chance sift.roll run random value 0..11
execute if score #chance sift.roll matches 0 positioned ~8 ~ ~8 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:rift/create
execute if dimension minecraft:overworld if score #chance sift.roll matches 1 unless entity @e[tag=sift.riftcaller,distance=..96] positioned ~16 ~ ~16 if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:illager/spawn
''')
fn('illager/spawn', '''
summon minecraft:evoker ~ ~ ~ {Tags:["sift.riftcaller"],CustomName:{text:"Riftcaller",color:"dark_purple"}}
scoreboard players set @e[type=minecraft:evoker,tag=sift.riftcaller,distance=..1,limit=1] sift.age 0
''')
fn('illager/tick', '''
scoreboard players add @s sift.age 1
execute if score @s sift.age matches 100 run particle minecraft:block{block_state:"minecraft:deepslate"} ~ ~0.2 ~ 1 0.2 1 0.1 30 normal
execute if score @s sift.age matches 100 run playsound minecraft:entity.evoker.prepare_attack hostile @a[distance=..24] ~ ~ ~ 1 0.5
execute if score @s sift.age matches 120 positioned ~2 ~ ~ run function entersift:rift/create
execute if score @s sift.age matches 200.. run scoreboard players set @s sift.age 0
''')
# Rabbit root supplies health, sounds and persistence; display passengers give a low jelly silhouette.
parts=[display('entersift:blub_jelly',[-.3,-.2,-.4],[.6,.35,.8],['sift.blub_visual']),
       display('entersift:blub_jelly',[-.25,.1,-.25],[.15,.45,.13],['sift.blub_visual']),
       display('entersift:blub_jelly',[.1,.1,-.25],[.15,.35,.13],['sift.blub_visual']),
       display('minecraft:redstone_block',[-.23,-.02,-.43],[.1,.1,.05],['sift.blub_visual'],15),
       display('minecraft:redstone_block',[.13,-.02,-.43],[.1,.1,.05],['sift.blub_visual'],15)]
fn('blub/spawn', 'summon minecraft:rabbit ~ ~ ~ {Tags:["sift.blub"],NoAI:1b,PersistenceRequired:1b,Silent:1b,CustomName:{text:"Blub",color:"aqua"},Passengers:['+','.join(parts)+']}\n'+'''
effect give @e[type=minecraft:rabbit,tag=sift.blub,distance=..1] minecraft:invisibility infinite 0 true
''')
fn('blub/tick', '''
execute if entity @p[distance=2..8,gamemode=!spectator] facing entity @p[distance=..8,gamemode=!spectator] feet run tp @s ~ ~ ~ ~ 0
execute if entity @p[distance=2..8,gamemode=!spectator] positioned ^ ^ ^0.035 if block ~ ~ ~ minecraft:air unless block ~ ~-0.3 ~ minecraft:air run tp @s ~ ~ ~
''')
fn('dev/kit', '''
give @s entersift:rift_gauntlet
give @s entersift:soul_potion 8
give @s entersift:ichor_bucket
give @s entersift:soul_salt 16
give @s entersift:salt 64
''')
fn('dev/arena', '''
# Destructive test fixture; use only in an empty creative test area.
fill ~-5 ~-1 ~-2 ~5 ~-1 ~8 entersift:salt
fill ~-4 ~ ~5 ~4 ~6 ~5 minecraft:reinforced_deepslate
fill ~-3 ~1 ~5 ~3 ~5 ~5 minecraft:air
'''+ '\n'.join(f'setblock ~{i-3} ~ ~ minecraft:{c}_wool\nsetblock ~{i-3} ~1 ~ minecraft:note_block[note={n}]' for i,(c,n) in enumerate(zip(['red','magenta','pink','cyan','blue','purple'],[0,4,7,12,14,19])))+'''
function entersift:dev/kit
tellraw @s {"text":"Left-click the six notes from left to right. The Singer will answer.","color":"aqua"}
''')
# Worldgen: use exact 26.3 material-rule / environment-attribute schemas, not older pack layouts.
dim=json.loads((ROOT/'tools/templates/dimension-26.3.json').read_text())
dim.update(ambient_light=.09, has_skylight=False)
dim['attributes']={'minecraft:visual/fog_color':'#102536','minecraft:visual/sky_color':'#030810','minecraft:visual/ambient_light_color':'#203946','minecraft:audio/ambient_sounds':{'loop':'minecraft:ambient.soul_sand_valley.loop'},'minecraft:gameplay/bed_rule':{'can_set_spawn':'never','can_sleep':'never','error_message':{'text':'The Sift does not dream.'}}}
dim.pop('timelines',None)
js(DATA/'dimension_type/the_sift.json',dim)
js(DATA/'dimension/the_sift.json',{'type':'entersift:the_sift','generator':{'type':'minecraft:noise','settings':'entersift:the_sift','biome_source':{'type':'minecraft:checkerboard','biomes':['entersift:carapace','entersift:singer_meadow','entersift:saltwound_expanse'],'scale':5}}})
noise=json.loads((ROOT/'tools/templates/overworld-26.3.json').read_text());noise.update(default_block='entersift:salt',default_fluid='entersift:ichor',material_rule='entersift:the_sift',sea_level=52)
js(DATA/'worldgen/noise_settings/the_sift.json',noise)
rule={'type':'minecraft:sequence','sequence':['minecraft:bedrock_floor']}
for name,block in [('carapace','carapace'),('singer_meadow','singer_moss')]:
    rule['sequence'].append({'type':'minecraft:condition','if_true':{'type':'minecraft:biome','biome_is':'entersift:'+name},'then_run':{'type':'minecraft:condition','if_true':'minecraft:on_floor','then_run':{'type':'minecraft:block','result_state':'entersift:'+block}}})
rule['sequence'].append({'type':'minecraft:block','result_state':'entersift:salt'})
js(DATA/'worldgen/material_rule/the_sift.json',rule)
for name,fog in [('carapace','#272537'),('singer_meadow','#163e42'),('saltwound_expanse','#36404e')]:
    features=[[] for _ in range(11)]
    features[9]=['entersift:soul_salt']
    if name=='carapace': features[3]=['entersift:bones']; features[9].append('entersift:ribcage')
    if name=='saltwound_expanse': features[9].append('entersift:crystals')
    if name=='singer_meadow': features[9].append('entersift:flowers')
    spawns={'monster':[{'type':'minecraft:skeleton','count':2,'weight':15}]} if name=='carapace' else {}
    biome={'has_precipitation':False,'temperature':.5,'downfall':0,'effects':{'water_color':'#46b9b4'},'attributes':{'minecraft:visual/fog_color':fog,'minecraft:visual/sky_color':'#050b16','minecraft:visual/ambient_particles':{'modifier':'append','argument':[{'particle':{'type':'minecraft:soul'},'probability':.003}]},'minecraft:gameplay/natural_mob_spawns':{'modifier':'overlay','argument':{'spawn_costs':{},'spawns_by_category':spawns}}},'carvers':[],'features':features}
    js(DATA/f'worldgen/biome/{name}.json',biome)
for name,block,count in [('soul_salt','entersift:soul_salt',3),('flowers','minecraft:allium',20)]:
    js(DATA/f'worldgen/feature/{name}.json',{'type':'minecraft:simple_block','to_place':{'id':block}})
    js(DATA/f'worldgen/placed_feature/{name}.json',{'feature':'entersift:'+name,'placement':[{'type':'minecraft:count','count':count},{'type':'minecraft:in_square'},{'type':'minecraft:heightmap','heightmap':'WORLD_SURFACE_WG'},{'type':'minecraft:biome'}]})
js(DATA/'worldgen/placed_feature/bones.json',{'feature':'minecraft:fossil_coal','placement':[{'type':'minecraft:count','count':3},{'type':'minecraft:in_square'},{'type':'minecraft:heightmap','heightmap':'WORLD_SURFACE_WG'},{'type':'minecraft:biome'}]})
# Surface skeleton arches and salt crystals, assembled by the 26.3 overlay feature.
for name in ['ribcage','crystals']:
    points=set()
    if name=='ribcage':
        for z in range(-5,6): points.add((0,0,z))
        for z in [-4,-2,0,2,4]:
            for side in [-1,1]:
                for x,y in [(3,0),(3,1),(3,2),(3,3),(2,4),(1,5),(0,5)]: points.add((side*x,y,z))
    else:
        for x,z,h in [(0,0,5),(1,1,3),(-1,1,2)]:
            for y in range(h): points.add((x,y,z))
    pieces=[]
    for x,y,z in sorted(points):
        pieces.append({'feature':{'type':'minecraft:simple_block','to_place':{'id':'entersift:carapace' if name=='ribcage' else 'entersift:soul_salt'}},'placement':[{'type':'minecraft:offset','x':x,'y':y,'z':z},{'type':'minecraft:block_predicate_filter','predicate':{'type':'minecraft:matching_block_tag','tag':'minecraft:air'}}]})
    js(DATA/f'worldgen/feature/{name}.json',{'type':'minecraft:overlay','features':pieces})
    js(DATA/f'worldgen/placed_feature/{name}.json',{'feature':'entersift:'+name,'placement':[{'type':'minecraft:rarity_filter','chance':3},{'type':'minecraft:in_square'},{'type':'minecraft:heightmap','heightmap':'WORLD_SURFACE_WG'},{'type':'minecraft:biome'}]})
# Recipes, loot, models. Assets are original pixel art generated below, not vanilla replacements.
blocks=['salt','soul_salt','carapace','singer_moss','threshold','blub_jelly']
items=['rift_gauntlet','soul_potion','ichor_bucket']
for name in blocks:
    asset(f'blockstates/{name}.json',{'variants':{'':{'model':f'entersift:block/{name}'}}})
    asset(f'models/block/{name}.json',{'parent':'minecraft:block/cube_all','textures':{'all':f'entersift:block/{name}'}})
    asset(f'items/{name}.json',{'model':{'type':'minecraft:model','model':f'entersift:block/{name}'}})
    js(DATA/f'loot_table/blocks/{name}.json',{'type':'minecraft:block','pools':[{'rolls':1,'entries':[{'type':'minecraft:item','name':f'entersift:{name}'}],'conditions':[{'condition':'minecraft:survives_explosion'}]}]})
for name in items:
    asset(f'items/{name}.json',{'model':{'type':'minecraft:model','model':f'entersift:item/{name}'}})
    asset(f'models/item/{name}.json',{'parent':'minecraft:item/handheld' if name=='rift_gauntlet' else 'minecraft:item/generated','textures':{'layer0':f'entersift:item/{name}'}})
asset('blockstates/ichor.json',{'variants':{'':{'model':'minecraft:block/water'}}})
lang={f'block.entersift.{n}':n.replace('_',' ').title() for n in blocks+['ichor']}
lang.update({f'item.entersift.{n}':n.replace('_',' ').title() for n in items})
lang.update({f'biome.entersift.{n}':n.replace('_',' ').title() for n in ['carapace','singer_meadow','saltwound_expanse']})
asset('lang/en_us.json',lang)
js(DATA/'recipe/rift_gauntlet.json',{'type':'minecraft:crafting_shaped','pattern':['SES','SNS',' S '],'key':{'S':'entersift:soul_salt','E':'minecraft:echo_shard','N':'minecraft:netherite_ingot'},'result':{'id':'entersift:rift_gauntlet','count':1}})
js(DATA/'recipe/soul_potion.json',{'type':'minecraft:crafting_shapeless','ingredients':['minecraft:glass_bottle','minecraft:echo_shard','entersift:soul_salt'],'result':{'id':'entersift:soul_potion','count':1}})
js(RES/'data/minecraft/tags/block/mineable/pickaxe.json',{'values':['entersift:'+n for n in blocks if n!='singer_moss']})
js(RES/'data/minecraft/tags/block/dirt.json',{'values':['entersift:singer_moss']})
js(DATA/'tags/fluid/ichor.json',{'values':['entersift:ichor','entersift:flowing_ichor']})
# No external image dependencies. Deterministic 16px pixel art and animated fluid/threshold strips.
def png(path,w,h,pixels):
    def chunk(t,b): return struct.pack('!I',len(b))+t+b+struct.pack('!I',zlib.crc32(t+b)&0xffffffff)
    data=b''.join(b'\0'+bytes(pixels[y*w*4:(y+1)*w*4]) for y in range(h))
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b''))
rng=random.Random(826)
palettes={'salt':(204,215,210),'soul_salt':(66,173,188),'carapace':(204,191,161),'singer_moss':(43,88,84),'blub_jelly':(71,129,150)}
for name,base in palettes.items():
    pixels=[]
    for y in range(16):
        for x in range(16):
            k=rng.randint(-22,22)+(18 if (x*3+y)%11==0 else 0)
            pixels+= [max(0,min(255,v+k)) for v in base]+[255]
    png(RES/f'assets/entersift/textures/block/{name}.png',16,16,pixels)
for name in ['ichor_still','ichor_flow','ichor_overlay','threshold']:
    pixels=[]
    for f in range(32):
        for y in range(16):
            for x in range(16):
                wave=math.sin(x*.6+y*.4+f*.19635)+math.cos(y*.8-f*.19635)
                hue=(x/40+y/60+f/32+wave*.1)%1
                rgb=colorsys.hsv_to_rgb(hue,.65,.85 if name!='threshold' else .3+.35*(wave+2)/4)
                pixels += [int(c*255) for c in rgb]+[210 if name=='ichor_overlay' else 255]
    png(RES/f'assets/entersift/textures/block/{name}.png',16,512,pixels)
    asset(f'textures/block/{name}.png.mcmeta',{'animation':{'frametime':2,'interpolate':True}})
for name in items:
    pixels=[]
    for y in range(16):
        for x in range(16):
            inside=(4<=x<=11 and 5<=y<=14) or (6<=x<=9 and 2<=y<=5)
            if name=='rift_gauntlet': inside=(3<=x<=11 and 7<=y<=14) or (3<=y<=8 and 3<=x<=12 and x%3!=2)
            edge=x in [4,11] or y in [5,14]
            color=(33,49,66,255) if edge else (72+((x+y)%3)*14,190,202,255)
            if name=='soul_potion' and y<=4: color=(162,115,80,255)
            pixels+=list(color if inside else (0,0,0,0))
    png(RES/f'assets/entersift/textures/item/{name}.png',16,16,pixels)
print('Generated Sift data, models, recipes and original animated textures.')

# Final reference-driven pass; kept separate so the base gameplay generator stays readable.
from visual_pass import generate as generate_visual_pass
generate_visual_pass(ROOT, RES, DATA, fn, js, asset, display, png)
from expansion import generate as generate_expansion
generate_expansion(ROOT, RES, DATA, fn, js, asset, display, png)
