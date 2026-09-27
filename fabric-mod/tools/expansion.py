"""0.3: eight-note progression, encounters, summon eggs, scenery and timed rifts."""
import json,math,colorsys
ORDER=[1,3,7,6,5,2,4,8]
COLORS=['red','orange','yellow','green','cyan','blue','purple','pink']
MOBS=['blub','singer','twisted_warden','drift_jelly','antlerling','chestmaw']
def generate(root,res,data,fn,js,asset,display,png):
    def text(n): return (data/f'function/{n}.mcfunction').read_text()
    def append(n,t): fn(n,text(n)+'\n'+t)
    blocks={'rift_overworld':(255,221,85),'rift_end':(168,66,230),'rift_sift':(71,220,225),'sonorous_deepslate':(36,65,77),'soulwood':(23,65,69),'soul_canopy':(140,222,224),'soul_lantern_stone':(108,243,226),'resonance_orange':(255,139,41),'resonance_yellow':(255,230,70),'resonance_green':(102,248,139)}
    for name,rgb in blocks.items():
        asset(f'blockstates/{name}.json',{'variants':{'':{'model':f'entersift:block/{name}'}}})
        asset(f'models/block/{name}.json',{'parent':'minecraft:block/cube_all','textures':{'all':f'entersift:block/{name}'}})
        asset(f'items/{name}.json',{'model':{'type':'minecraft:model','model':f'entersift:block/{name}'}})
        js(data/f'loot_table/blocks/{name}.json',{'type':'minecraft:block','pools':[{'rolls':1,'entries':[{'type':'minecraft:item','name':'entersift:'+name}]}]})
        pixels=[]
        for y in range(16):
            for x in range(16):
                delta=((x*13+y*19)%21)-10
                if name=='sonorous_deepslate' and (x in [2,13] or y in [2,13]):color=(85,221,224)
                elif name=='soul_lantern_stone': color=(225,255,243) if 3<x<12 and 3<y<12 else rgb
                else:color=tuple(max(0,min(255,c+delta)) for c in rgb)
                pixels+=list(color)+[255]
        png(res/f'assets/entersift/textures/block/{name}.png',16,16,pixels)
    for name,hue in [('rift_overworld',.13),('rift_end',.77),('rift_sift',.5)]:
        pixels=[]
        for frame in range(32):
            for y in range(16):
                for x in range(16):
                    v=.55+.45*(.5+.5*math.sin(x*.5+y*.7+math.sin(frame/32*math.tau)))
                    rgb=colorsys.hsv_to_rgb(hue+.025*math.sin(y*.5+frame/32*math.tau),.62,v)
                    pixels += [round(c*255) for c in rgb]+[255]
        png(res/f'assets/entersift/textures/block/{name}.png',16,512,pixels)
        asset(f'textures/block/{name}.png.mcmeta',{'animation':{'frametime':3,'interpolate':True}})
    lang=json.loads((res/'assets/entersift/lang/en_us.json').read_text())
    lang.update({'block.entersift.'+b:b.replace('_',' ').title() for b in blocks})
    # All spawn eggs are actual registered items. Bodies remain vanilla entities with display rigs.
    for i,name in enumerate([m+'_spawn_egg' for m in MOBS]+['red_rift_gauntlet']):
        lang['item.entersift.'+name]=name.replace('_',' ').title()
        asset(f'items/{name}.json',{'model':{'type':'minecraft:model','model':'entersift:item/'+name}})
        asset(f'models/item/{name}.json',{'parent':'minecraft:item/generated','textures':{'layer0':'entersift:item/'+name}})
        pixels=[];rgb=colorsys.hsv_to_rgb(i/8,.55,.9)
        for y in range(16):
            for x in range(16):
                inside=((x-7.5)/5)**2+((y-8)/6)**2<1
                if name=='red_rift_gauntlet':inside=3<=x<=12 and 4<=y<=14
                c=tuple(int(v*255) for v in rgb) if (x*3+y)%5 else (225,250,240)
                if name=='red_rift_gauntlet':c=(235,65,55) if y<10 else (65,40,48)
                pixels+=list(c)+[255] if inside else [0,0,0,0]
        png(res/f'assets/entersift/textures/item/{name}.png',16,16,pixels)
    lang['item.entersift.rift_gauntlet']='Blue Rift Gauntlet'
    asset('lang/en_us.json',lang)
    js(data/'recipe/sonorous_deepslate.json',{'type':'minecraft:crafting_shapeless','ingredients':['minecraft:deepslate','minecraft:amethyst_shard','minecraft:echo_shard'],'result':{'id':'entersift:sonorous_deepslate','count':8}})
    js(data/'recipe/red_rift_gauntlet.json',{'type':'minecraft:crafting_shapeless','ingredients':['entersift:rift_gauntlet','minecraft:red_dye'],'result':{'id':'entersift:red_rift_gauntlet','count':1}})
    append('load','''
scoreboard objectives add sift.link dummy
scoreboard players add #encounter sift.link 0
scoreboard players add #riftcycle sift.clock 0
''')
    fn('player/init',text('player/init').replace('Red → Magenta → Pink → Cyan → Blue → Purple.','1 → 3 → 7 → 6 → 5 → 2 → 4 → 8 on Sonorous Deepslate.').replace('six colours','eight notes'))
    # Extend note materials and add visible (non-light-casting) beacon-style columns.
    for color in ['orange','yellow','green']:
        fn('notes/'+color,text('notes/red').replace('create_red','create_'+color))
        fn('notes/create_'+color,text('notes/create_red').replace('resonance_red','resonance_'+color).replace('color:[1.0f,0.1f,0.13f]',{'orange':'color:[1.0f,0.55f,0.16f]','yellow':'color:[1.0f,0.9f,0.28f]','green':'color:[0.4f,0.97f,0.55f]'}[color]))
    for color in COLORS:
        fn('notes/beam_'+color,'summon minecraft:block_display ~0.48 ~1 ~0.48 '+display('entersift:resonance_'+color,[0,0,0],[.04,9,.04],['sift.beam'],15).replace('id:"minecraft:block_display",','',1)+'\nscoreboard players set @e[type=minecraft:block_display,tag=sift.beam,distance=..2] sift.age 0')
    # An encounter marker owns its guardian via a persistent link score. Absence is NOT death.
    fn('guardian/begin','''
execute if entity @e[type=minecraft:marker,tag=sift.encounter,distance=..1] run return 0
scoreboard players add #encounter sift.link 1
summon minecraft:marker ~ ~ ~ {Tags:["sift.encounter","sift.new_encounter"]}
scoreboard players operation @e[type=minecraft:marker,tag=sift.new_encounter,distance=..1,limit=1] sift.link = #encounter sift.link
tag @e[type=minecraft:marker,tag=sift.new_encounter,distance=..1] remove sift.new_encounter
execute positioned ~ ~ ~3 run function entersift:creature/twisted_warden/spawn
scoreboard players operation @e[type=minecraft:warden,tag=sift.guardian,distance=..8,sort=nearest,limit=1] sift.link = #encounter sift.link
playsound minecraft:entity.warden.emerge hostile @a[distance=..40] ~ ~ ~ 1 0.7
tellraw @a[distance=..40] {"text":"The Twisted Warden guards the threshold. Defeat it to awaken the Singer.","color":"dark_aqua"}
''')
    fn('guardian/slain','''
scoreboard players operation #dead sift.link = @s sift.link
execute as @e[type=minecraft:marker,tag=sift.encounter] if score @s sift.link = #dead sift.link at @s run function entersift:guardian/unlock
''')
    fn('guardian/unlock','''
execute if entity @s[tag=sift.ready] run return 0
tag @s add sift.ready
execute positioned ~ ~6 ~ run function entersift:creature/singer/spawn
playsound minecraft:block.end_portal.spawn ambient @a[distance=..48] ~ ~ ~ 0.7 1.3
tellraw @a[distance=..48] {"text":"The Singer awakens. Tune eight blocks on Sonorous Deepslate. Sing: 1, 3, 7, 6, 5, 2, 4, 8.","color":"aqua"}
''')
    fn('guardian/guide','particle minecraft:soul ~ ~5 ~ 2 1 2 0.005 5 normal')
    # Replay all eight stored positions; then form the portal from its edges toward the centre.
    ritual='scoreboard players add @s sift.age 1\n'
    for i,pitch in enumerate(ORDER):
        color=COLORS[pitch-1]; t=60+i*24
        fn(f'ritual/note_{i}',f'$execute positioned $(n{i}x) $(n{i}y) $(n{i}z) run playsound minecraft:block.note_block.chime ambient @a[distance=..48] ~ ~ ~ 1.5 {2**((pitch-5)/12):.4f}\n$execute positioned $(n{i}x) $(n{i}y) $(n{i}z) run function entersift:notes/{color}\n$execute positioned $(n{i}x) $(n{i}y) $(n{i}z) run function entersift:notes/beam_{color}')
        ritual+=f'execute if score @s sift.age matches {t} run function entersift:ritual/note_{i} with entity @s data\n'
        # Final-input resonance is simultaneous; automatic melody follows slowly.
        ritual+=f'execute if score @s sift.age matches 1 run function entersift:ritual/note_{i} with entity @s data\n'
    ritual+='execute if score @s sift.age matches 240 run function entersift:portal/form with entity @s data\nexecute if score @s sift.age matches 350.. run function entersift:portal/open\n'
    fn('ritual/tick',ritual)
    fn('ritual/begin',text('ritual/begin').replace('function entersift:ritual/singer','particle minecraft:soul ~ ~5 ~ 1 1 1 0.01 20 normal'))
    # Eight vertical slats interpolate from full-height hairlines to a contiguous portal.
    form=[]; finish=[]
    for i in range(8):
        # Data fields p0x/p0z etc are prepared by Java, so this works on both frame axes.
        form.append(f'$summon minecraft:block_display ~ ~ ~ {{Tags:["sift.forming","sift.panel{i}"],block_state:{{Name:"entersift:threshold"}},brightness:{{block:15,sky:15}},transformation:{{translation:[$(p{i}x)f,0f,$(p{i}z)f],scale:[$(ax)f,$(sy)f,$(az)f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}}}')
        finish.append(f'$data merge entity @e[type=minecraft:block_display,tag=sift.panel{i},distance=..1,limit=1,sort=nearest] {{start_interpolation:0,interpolation_duration:80,transformation:{{translation:[$(p{i}x)f,0f,$(p{i}z)f],scale:[$(bx)f,$(sy)f,$(bz)f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}}}')
    fn('portal/form','\n'.join(form))
    for stage,index in enumerate([0,7,1,6,2,5,3,4]):
        fn(f'portal/assemble_{stage}',finish[index].replace('interpolation_duration:80','interpolation_duration:40'))
        append('ritual/tick',f'execute if score @s sift.age matches {242+stage*8} run function entersift:portal/assemble_{stage} with entity @s data')
    fn('portal/open','kill @e[type=minecraft:block_display,tag=sift.forming,distance=..1]\n'+text('portal/open'))
    # Five real-time minutes at 20 TPS active, five dormant. Timers pause with the server.
    append('tick','''
scoreboard players add #riftcycle sift.clock 1
execute if score #riftcycle sift.clock matches 12000.. run scoreboard players set #riftcycle sift.clock 0
''')
    # Natural rifts may spawn during the active half of the cycle and close at the phase boundary.
    fn('world/roll',text('world/roll').replace('execute if score #chance sift.roll matches 0','execute if score #riftcycle sift.clock matches 0..5999 if score #chance sift.roll matches 0'))
    fn('rift/natural','function entersift:rift/create\ntag @e[type=minecraft:marker,tag=sift.rift,distance=..1,limit=1,sort=nearest] add sift.natural')
    fn('world/roll',text('world/roll').replace('run function entersift:rift/create','run function entersift:rift/natural'))
    # Rift type/colour is destination-coded by changing the membrane texture block for each destination.
    old=text('rift/tick').replace('40..850','40..5990').replace('900..','6000..').replace('..899','..5999')
    fn('rift/tick',old+'\nexecute if entity @s[tag=sift.natural] if score #riftcycle sift.clock matches 6000.. run function entersift:rift/close')
    old=text('rift/punch').replace('execute if score @s sift.souls matches ..9','execute unless entity @s[gamemode=creative] if score @s sift.souls matches ..9').replace('scoreboard players remove @s sift.souls 10','execute unless entity @s[gamemode=creative] run scoreboard players remove @s sift.souls 10')
    fn('rift/punch',old)
    # Every display has a local warp ID, so it can expand from a thin shard into its final shape.
    import re
    old=text('rift/create')
    pattern=r'\{id:"minecraft:block_display",Tags:\[([^\]]+)\],block_state:\{Name:"([^"]+)"\},brightness:\{[^}]+\},transformation:(\{translation:\[[^\]]+\],scale:\[([^\]]+)\],left_rotation:\[[^\]]+\],right_rotation:\[[^\]]+\]\})\}'
    warp=[]
    def compress(m):
        i=len(warp); target=m.group(3)
        warp.append(f'data merge entity @e[type=minecraft:block_display,tag=sift.warp{i},distance=..4,limit=1,sort=nearest] {{start_interpolation:0,interpolation_duration:40,transformation:{target}}}')
        tag=f'"sift.warp{i}"'+(',"sift.membrane"' if m.group(2)=='entersift:rift_membrane' else '')
        initial=m.group(0).replace('Tags:[','Tags:['+tag+',',1)
        return initial.replace('scale:['+m.group(4)+']','scale:[0.012f,0.15f,0.012f]')
    old=re.sub(pattern,compress,old)
    assert len(warp)==27, 'Rift geometry changed; update warp authoring.'
    old=old.replace('tag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift','execute as @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] at @s run function entersift:rift/style\ntag @e[type=minecraft:marker,tag=sift.new_rift,distance=..1] remove sift.new_rift')
    fn('rift/create',old); fn('rift/warp','\n'.join(warp))
    fn('rift/style','\n'.join(f'execute if score @s sift.target matches {i} as @e[type=minecraft:block_display,tag=sift.membrane,distance=..4] run data merge entity @s {{block_state:{{Name:"entersift:{block}"}}}}' for i,block in enumerate(['rift_overworld','rift_membrane','rift_end','rift_sift'])))
    fn('rift/tick',text('rift/tick').replace('40..5990','50..5990')+'\nexecute if score @s sift.age matches 5 run function entersift:rift/warp')
    # Prototype creatures: vanilla AI + custom rigs, no undocumented fake custom entity IDs.
    def part(block,t,s,tag):return display('entersift:'+block,t,s,['sift.creature_part',tag],12)
    rigs={
      'drift_jelly':('allay',[
          part('soul_canopy',[-.38,-.15,-.38],[.76,.65,.76],'sift.jelly_part'),
          part('soul_lantern_stone',[-.12,.05,-.40],[.24,.24,.06],'sift.jelly_part')]+[part('soulwood',[x,-1,z],[.055,.9,.055],'sift.jelly_part') for x,z in [(-.25,-.25),(.25,-.25),(-.25,.25),(.25,.25)]]),
      'antlerling':('villager',[
          part('soulwood',[-.25,-1.2,-.2],[.5,.65,.4],'sift.antler_part'),part('soul_canopy',[-.33,-.55,-.28],[.66,.5,.56],'sift.antler_part'),
          part('carapace',[-.30,-.05,0],[.07,.5,.07],'sift.antler_part'),part('carapace',[.23,-.05,0],[.07,.5,.07],'sift.antler_part'),
          part('rift_edge',[-.23,-.4,-.30],[.12,.07,.04],'sift.antler_part'),part('rift_edge',[.12,-.4,-.30],[.12,.07,.04],'sift.antler_part')]),
      'chestmaw':('zombie',[
          part('soulwood',[-.4,-1.4,-.3],[.8,1.2,.6],'sift.maw_part'),part('salt',[-.38,-.9,-.4],[.76,.45,.08],'sift.maw_part'),
          part('soul_canopy',[-.5,-.43,-.38],[1,.35,.76],'sift.maw_lid'),part('carapace',[-.4,-.43,-.42],[.8,.08,.1],'sift.maw_part'),
          part('rift_edge',[-.3,-.26,-.4],[.12,.09,.05],'sift.maw_part'),part('rift_edge',[.2,-.26,-.4],[.12,.09,.05],'sift.maw_part')]),
    }
    for mob,(body,parts) in rigs.items():
        fn('creature/'+mob+'/spawn',f'summon minecraft:{body} ~ ~ ~ {{Tags:["sift.creature","sift.{mob}","sift.fresh"],PersistenceRequired:1b,Silent:1b,CustomName:{{text:"{mob.replace("_"," ").title()}"}},Passengers:['+','.join(parts)+']}\neffect give @e[tag=sift.fresh,distance=..1] minecraft:invisibility infinite 0 true\nscoreboard players set @e[tag=sift.fresh,distance=..1] sift.age 0\ntag @e[tag=sift.fresh,distance=..1] remove sift.fresh')
    fn('creature/blub/spawn','function entersift:blub/spawn')
    # Singer is a stationary summoned figure, also used above a defeated guardian's portal.
    fn('creature/singer/spawn','function entersift:ritual/singer')
    crest=','.join([part('soul_lantern_stone',[-.8,-.7,0],[.2,.6,.25],'sift.guardian_part'),part('soul_lantern_stone',[.6,-.7,0],[.2,.6,.25],'sift.guardian_part')])
    fn('creature/twisted_warden/spawn','''
summon minecraft:warden ~ ~ ~ {Tags:["sift.guardian"],PersistenceRequired:1b,CustomName:{text:"Twisted Warden",color:"dark_aqua"},Brain:{memories:{"minecraft:dig_cooldown":{value:{},ttl:2147483647L}}},Passengers:[CREST]}
effect give @e[type=minecraft:warden,tag=sift.guardian,distance=..1,limit=1,sort=nearest] minecraft:resistance 999999 0 true
'''.replace('CREST',crest))
    # Timed cosmetic mouth opening. Underlying AI/health belong to a vanilla zombie.
    fn('creature/tick','''
scoreboard players add @s sift.age 1
execute if entity @s[tag=sift.drift_jelly] run particle minecraft:soul ~ ~-0.6 ~ 0.2 0.2 0.2 0 1 normal
execute if entity @s[tag=sift.chestmaw] if score @s sift.age matches 40 run data merge entity @e[type=minecraft:block_display,tag=sift.maw_lid,distance=..3,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:12,transformation:{translation:[-0.5f,0.05f,-0.38f],scale:[1f,0.35f,0.76f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute if entity @s[tag=sift.chestmaw] if score @s sift.age matches 80 run data merge entity @e[type=minecraft:block_display,tag=sift.maw_lid,distance=..3,limit=1,sort=nearest] {start_interpolation:0,interpolation_duration:12,transformation:{translation:[-0.5f,-0.43f,-0.38f],scale:[1f,0.35f,0.76f],left_rotation:[0f,0f,0f,1f],right_rotation:[0f,0f,0f,1f]}}
execute if score @s sift.age matches 100.. run scoreboard players set @s sift.age 0
''')
    append('world/tick','''
execute as @e[tag=sift.creature] at @s run function entersift:creature/tick
execute as @e[type=minecraft:block_display,tag=sift.guardian_part] at @s unless entity @e[tag=sift.guardian,distance=..4] run kill @s
execute as @e[type=minecraft:block_display,tag=sift.creature_part,tag=!sift.guardian_part] at @s unless entity @e[tag=sift.creature,distance=..3] run kill @s
execute as @e[type=minecraft:block_display,tag=sift.beam] run scoreboard players add @s sift.age 1
kill @e[type=minecraft:block_display,tag=sift.beam,scores={sift.age=80..}]
execute as @e[type=minecraft:marker,tag=sift.ready] at @s if entity @a[distance=..24] run function entersift:guardian/guide
''')
    append('world/pulse','''
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[tag=sift.drift_jelly,distance=..64] positioned ~5 ~3 ~ if block ~ ~ ~ minecraft:air run function entersift:creature/drift_jelly/spawn
execute in entersift:the_sift as @a at @s if biome ~ ~ ~ entersift:singer_meadow unless entity @e[tag=sift.antlerling,distance=..64] positioned ~5 ~ ~ if block ~ ~ ~ minecraft:air unless block ~ ~-1 ~ minecraft:air run function entersift:creature/antlerling/spawn
''')
    # Surface features are authored from individual blocks using the verified 26.3 overlay schema.
    def feature(name,points,chance):
        pieces=[{'feature':{'type':'minecraft:simple_block','to_place':{'id':block}},'placement':[{'type':'minecraft:offset','x':x,'y':y,'z':z},{'type':'minecraft:block_predicate_filter','predicate':{'type':'minecraft:matching_block_tag','tag':'minecraft:air'}}]} for (x,y,z),block in sorted(points.items())]
        js(data/f'worldgen/feature/{name}.json',{'type':'minecraft:overlay','features':pieces})
        js(data/f'worldgen/placed_feature/{name}.json',{'feature':'entersift:'+name,'placement':[{'type':'minecraft:rarity_filter','chance':chance},{'type':'minecraft:in_square'},{'type':'minecraft:heightmap','heightmap':'WORLD_SURFACE_WG'},{'type':'minecraft:biome'}]})
    tree={(0,y,0):'entersift:soulwood' for y in range(9)}
    for x in range(-3,4):
        for z in range(-3,4):
            if abs(x)+abs(z)>5:continue
            for y in [8,9]:tree[x,y,z]='entersift:soul_canopy'
            if (x*x+z*z)%3==1:
                for y in range(5,8):tree[x,y,z]='entersift:soul_canopy'
    feature('weeping_soul_tree',tree,3)
    ruin={}
    for x in [-4,-3,3,4]:
        for z in [0,1]:
            for y in range(7):ruin[x,y,z]='entersift:saltstone'
    for x in range(-4,5):
        for z in [0,1]:ruin[x,7,z]='entersift:carapace'
    ruin[-3,3,-1]='entersift:soul_lantern_stone';ruin[3,3,-1]='entersift:soul_lantern_stone'
    feature('ruined_arch',ruin,20)
    for biome in ['singer_meadow','saltwound_expanse','carapace']:
        p=data/f'worldgen/biome/{biome}.json';b=json.loads(p.read_text());b['features'][9].append('entersift:ruined_arch')
        if biome=='singer_meadow':b['features'][9].append('entersift:weeping_soul_tree')
        js(p,b)
    # New fixture: physical layout is numerical, playback is the requested permutation.
    fn('dev/arena','''
# Destructive developer fixture. Use a disposable creative test world.
fill ~-6 ~-1 ~-2 ~6 ~-1 ~10 entersift:salt
fill ~-5 ~ ~7 ~5 ~7 ~7 minecraft:reinforced_deepslate
fill ~-4 ~1 ~7 ~4 ~6 ~7 minecraft:air
'''+ '\n'.join(f'setblock ~{i-4} ~ ~ entersift:sonorous_deepslate\nsetblock ~{i-4} ~1 ~ minecraft:note_block[note={i}]' for i in range(8))+'''
function entersift:dev/kit
tellraw @s {"text":"Eight pitches left-to-right. Defeat the guardian, then strike 1,3,7,6,5,2,4,8.","color":"aqua"}
''')
    append('dev/kit','give @s entersift:red_rift_gauntlet\ngive @s entersift:sonorous_deepslate 8\n'+ '\n'.join('give @s entersift:'+m+'_spawn_egg' for m in MOBS))
    print('0.3 expansion generated: eight notes, encounter, six eggs, creatures, trees and ruins.')
