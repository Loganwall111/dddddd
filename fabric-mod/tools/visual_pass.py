"""Reference-driven visual resources; called after the base generator, no external dependencies."""
import colorsys
import json
import math

COLORS = {
    'red': (1.0, .10, .13), 'magenta': (.90, .12, .80), 'pink': (1.0, .43, .65),
    'cyan': (.08, .94, 1.0), 'blue': (.18, .32, 1.0), 'purple': (.58, .20, 1.0)
}

def generate(root, res, data, fn, js, asset, display, png):
    def text(name): return (data/f'function/{name}.mcfunction').read_text()
    def append(name, lines): fn(name, text(name)+'\n'+lines)
    def summon(block, t, scale, tags):
        return 'summon minecraft:block_display ~ ~ ~ '+display(block,t,scale,tags,15).replace('id:"minecraft:block_display",','',1)
    # Explicitly inherit the normal clock/timelines; never install fixed_time.
    dim=json.loads((data/'dimension_type/the_sift.json').read_text())
    dim.update(has_skylight=True, ambient_light=.10, default_clock='minecraft:overworld', timelines='#minecraft:in_overworld')
    dim['attributes']['minecraft:visual/sky_color']='#6ca9b2'
    dim['attributes']['minecraft:visual/fog_color']='#639194'
    js(data/'dimension_type/the_sift.json',dim)
    for p in (data/'worldgen/biome').glob('*.json'):
        b=json.loads(p.read_text()); b['attributes']['minecraft:visual/sky_color']='#6ca9b2'
        b['attributes']['minecraft:visual/fog_color']={'carapace':'#77677f','singer_meadow':'#639194','saltwound_expanse':'#a299a1'}[p.stem]
        js(p,b)
    noise=json.loads((data/'worldgen/noise_settings/the_sift.json').read_text()); noise['default_block']='entersift:saltstone'
    js(data/'worldgen/noise_settings/the_sift.json',noise)
    rule=json.loads((data/'worldgen/material_rule/the_sift.json').read_text())
    rule['sequence'][-1:] = [
        {'type':'minecraft:condition','if_true':'minecraft:on_floor','then_run':{'type':'minecraft:block','result_state':'entersift:salt'}},
        {'type':'minecraft:block','result_state':'entersift:saltstone'}]
    js(data/'worldgen/material_rule/the_sift.json',rule)

    # New art-only blocks are also proper registered blocks/items with models and loot.
    blocks=['saltstone','rift_membrane','rift_edge']+['resonance_'+c for c in COLORS]
    for name in blocks:
        asset(f'blockstates/{name}.json',{'variants':{'':{'model':f'entersift:block/{name}'}}})
        asset(f'models/block/{name}.json',{'parent':'minecraft:block/cube_all','textures':{'all':f'entersift:block/{name}'}})
        asset(f'items/{name}.json',{'model':{'type':'minecraft:model','model':f'entersift:block/{name}'}})
        js(data/f'loot_table/blocks/{name}.json',{'type':'minecraft:block','pools':[{'rolls':1,'entries':[{'type':'minecraft:item','name':'entersift:'+name}],'conditions':[{'condition':'minecraft:survives_explosion'}]}]})
    lang=json.loads((res/'assets/entersift/lang/en_us.json').read_text())
    lang.update({'block.entersift.'+b:b.replace('_',' ').title() for b in blocks})
    asset('lang/en_us.json',lang)
    tag=res/'data/minecraft/tags/block/mineable/pickaxe.json'
    js(tag,{'values':json.loads(tag.read_text())['values']+['entersift:'+b for b in blocks]})

    # Saturated, full-bright note rims: visual emission only, not coloured terrain lighting.
    for color, rgb in COLORS.items():
        name='resonance_'+color
        pixels=[]
        for y in range(16):
            for x in range(16):
                shimmer=.86+.14*math.sin(x*.6+y*.3)**2
                pixels += [int(v*255*shimmer) for v in rgb]+[255]
        png(res/f'assets/entersift/textures/block/{name}.png',16,16,pixels)
        fn('notes/'+color, f'execute positioned ~0.5 ~1.025 ~0.5 run function entersift:notes/create_{color}')
        pieces=[]
        for t,scale in [([-.52,0,-.52],[1.04,.035,.045]),([-.52,0,.475],[1.04,.035,.045]),([-.52,0,-.475],[.045,.035,.95]),([.475,0,-.475],[.045,.035,.95])]:
            pieces.append(summon('entersift:'+name,t,scale,['sift.note_visual']))
        fn('notes/create_'+color, '''
kill @e[type=minecraft:block_display,tag=sift.note_visual,distance=..0.1]
kill @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1]
summon minecraft:marker ~ ~ ~ {Tags:["sift.note_glow"]}
scoreboard players set @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1] sift.age 0
'''+ '\n'.join(pieces)+f'\nparticle minecraft:dust{{color:[{rgb[0]}f,{rgb[1]}f,{rgb[2]}f],scale:1.2f}} ~ ~0.12 ~ 0.22 0.12 0.22 0 12 normal')
    fn('notes/tick', '''
scoreboard players add @s sift.age 1
execute if score @s sift.age matches 80.. run function entersift:notes/clear
''')
    fn('notes/clear','kill @e[type=minecraft:block_display,tag=sift.note_visual,distance=..0.1]\nkill @s')
    for i,color in enumerate(COLORS):
        append(f'ritual/note_{i}', f'$execute positioned $(n{i}x) $(n{i}y) $(n{i}z) run function entersift:notes/{color}')
    append('world/tick', '''
execute as @e[type=minecraft:marker,tag=sift.note_glow] at @s run function entersift:notes/tick
execute as @e[type=minecraft:block_display,tag=sift.note_visual] at @s unless entity @e[type=minecraft:marker,tag=sift.note_glow,distance=..0.1] run kill @s
execute as @e[type=minecraft:block_display,tag=sift.rift_visual] at @s unless entity @e[type=minecraft:marker,tag=sift.rift,distance=..4] run kill @s
''')

    # Continuous stepped membrane, outside-only white outline, plus detached drifting fragments.
    rows={0:(2,4),1:(1,4),2:(0,6),3:(2,4),4:(3,3)}
    cells={(x,y) for y,(lo,hi) in rows.items() for x in range(lo,hi+1)}
    unit=.60
    def pos(x,y,z=0): return [(x-3.5)*unit, (y-1.5)*unit, z]
    parts=[]
    for y,(lo,hi) in rows.items():
        parts.append(display('entersift:rift_membrane',pos(lo,y,-.055),[(hi-lo+1)*unit,unit,.11],['sift.rift_visual'],15))
    # Merge edge strips into contiguous runs to keep the entity count bounded.
    edges={}
    for x,y in cells:
        for dx,dy,orientation,line,start in [(0,-1,'h',y,x),(0,1,'h',y+1,x),(-1,0,'v',x,y),(1,0,'v',x+1,y)]:
            if (x+dx,y+dy) not in cells: edges.setdefault((orientation,line),[]).append(start)
    for (orientation,line),starts in sorted(edges.items()):
        runs=[]
        for start in sorted(starts):
            if runs and start==runs[-1][1]+1: runs[-1][1]=start
            else: runs.append([start,start])
        for lo,hi in runs:
            t=pos(lo,line,-.07) if orientation=='h' else pos(line,lo,-.07)
            scale=[(hi-lo+1)*unit+.035,.035,.14] if orientation=='h' else [.035,(hi-lo+1)*unit+.035,.14]
            parts.append(display('entersift:rift_edge',t,scale,['sift.rift_visual'],15))
    shards=[([-2.35,-.35,.10],[.42,.48,.18]),([2.35,.60,-.12],[.50,.24,.20]),([-1.60,1.40,.08],[.18,.25,.18]),([1.25,1.70,-.10],[.22,.22,.18])]
    for i,(t,scale) in enumerate(shards):
        # rift_shard texture has its own white border, no extra outline entity per fragment.
        parts.append(display('entersift:rift_edge',t,scale,['sift.rift_visual',f'sift.shard{i}'],15))
    old=text('rift/create')
    old=old.replace('summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"]}', 'summon minecraft:marker ~ ~ ~ {Tags:["sift.rift","sift.new_rift"],Passengers:['+','.join(parts)+']}')
    fn('rift/create',old)
    fn('rift/close','kill @e[type=minecraft:block_display,tag=sift.rift_visual,distance=..4]\nkill @s')
    old=text('rift/tick').replace('matches 900.. run kill @s','matches 900.. run function entersift:rift/close')
    old=old.replace('particle minecraft:reverse_portal ~ ~0.7 ~ 0.15 1 0.15 0.1 6 normal','particle minecraft:end_rod ~ ~0.5 ~ 1.4 1.0 0.15 0.005 2 normal')
    old=old.replace('execute if score @s sift.age matches 900.. run function entersift:rift/close\n','')
    old+='''
scoreboard players operation #riftphase sift.roll = @s sift.age
scoreboard players set #eighty sift.roll 80
scoreboard players operation #riftphase sift.roll %= #eighty sift.roll
'''
    for phase in [0,20,40,60]:
        old+=f'execute if score #riftphase sift.roll matches {phase} if score @s sift.age matches ..899 run function entersift:rift/pose_{phase}\n'
        commands=[]
        for i,(t,scale) in enumerate(shards):
            t=t.copy(); t[1]+=math.sin(phase/80*math.tau+i)*.12
            theta=math.sin(phase/80*math.tau+i)*.13
            transform=display('entersift:rift_edge',t,scale,[],15).split('transformation:',1)[1][:-1]
            transform=transform.replace('left_rotation:[0f,0f,0f,1f]',f'left_rotation:[0f,0f,{math.sin(theta/2):.5f}f,{math.cos(theta/2):.5f}f]')
            commands.append(f'data merge entity @e[type=minecraft:block_display,tag=sift.shard{i},distance=..4,limit=1,sort=nearest] {{start_interpolation:0,interpolation_duration:20,transformation:{transform}}}')
        fn(f'rift/pose_{phase}','\n'.join(commands))
    fn('rift/tick',old+'\nexecute if score @s sift.age matches 900.. run function entersift:rift/close')

    # More visible souls without an unbounded population of persistent entities.
    append('load','execute unless score #souls_fx sift.roll matches 0..2 run scoreboard players set #souls_fx sift.roll 2')
    old=text('player/second').replace('execute if dimension entersift:the_sift run particle minecraft:soul ~ ~1 ~ 7 3 7 0.015 6 normal @s','execute if dimension entersift:the_sift run function entersift:atmosphere/souls')
    fn('player/second',old)
    fn('atmosphere/souls','''
execute if score #souls_fx sift.roll matches 1 run particle minecraft:soul ~ ~1.5 ~ 7 3 7 0.008 6 normal @s
execute if score #souls_fx sift.roll matches 2 run particle minecraft:soul ~ ~1.5 ~ 9 4 9 0.008 22 normal @s
execute if score #souls_fx sift.roll matches 2 run particle minecraft:soul_fire_flame ~ ~0.7 ~ 6 1 6 0.005 8 normal @s
''')

    # Deterministic texture strips. All temporal fields are periodic over 64 frames.
    for name in ['threshold','rift_membrane','rift_edge','ichor_still','ichor_flow','ichor_overlay']:
        size=32; frames=64; pixels=[]
        for frame in range(frames):
            phase=frame/frames*math.tau
            for y in range(size):
                for x in range(size):
                    u=x/size; v=y/size
                    if name=='threshold':
                        tile=((x//3)*374761393+(y//3)*668265263)&0xffffffff
                        tile=((tile^(tile>>13))*1274126177)&0xffffffff
                        tile ^= tile>>16
                        light=.5+.5*math.sin((tile%997)*.073+phase)
                        edge=min(x,y,size-1-x,size-1-y)
                        rgb=(.15+light*.28,.58+light*.35,.68+light*.30)
                        if edge<2: rgb=(.68,.99,1.0)
                        elif ((x//2)*7+(y//2)*13+frame//8)%29==0: rgb=(.72,1.0,1.0)
                    elif name in ['rift_membrane','rift_edge']:
                        turbulence=math.sin(u*9+math.sin(v*7+phase)*2-phase)+math.cos(v*10-u*4+phase)
                        light=(turbulence+2)/4
                        rgb=(1.0,.20+light*.55,.12+light*.48)
                        if name=='rift_edge': rgb=(1.0,.91+.07*light,.82+.13*light)
                    else:
                        warp=math.sin(u*math.tau+phase)+math.cos(v*math.tau-phase)
                        hue=(u*.7+v*.3+warp*.19+.08*math.sin(phase))%1
                        rgb=colorsys.hsv_to_rgb(hue,.42,.95)
                        # Sparse glints embedded in the animated opalescent surface.
                        if (x*17+y*31)%127==0: rgb=tuple(.7+.3*c for c in rgb)
                    pixels += [max(0,min(255,round(c*255))) for c in rgb]+[190 if name=='ichor_overlay' else 255]
        png(res/f'assets/entersift/textures/block/{name}.png',size,size*frames,pixels)
        asset(f'textures/block/{name}.png.mcmeta',{'animation':{'frametime':2,'interpolate':True}})
    # Canyon walls and teal meadow cap from the supplied landscape shots.
    for name,base in [('saltstone',(157,105,111)),('singer_moss',(29,153,139))]:
        pixels=[]
        for y in range(16):
            for x in range(16):
                k=((x*13+y*7)%17)-8 + (-12 if y%5==0 else 0)
                pixels += [max(0,min(255,v+k)) for v in base]+[255]
        png(res/f'assets/entersift/textures/block/{name}.png',16,16,pixels)
    print(f'Visual pass: cyan threshold, {len(parts)}-piece warm rift, six note colours, ribbon-sky clock, layered saltstone.')
