"""Deterministic, dependency-free 3D staff models and a four-swatch texture atlas."""
import json, struct, zlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / 'src/main/resources/assets/entersift'

def png(colors):
    def chunk(tag, data):
        return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    pixels = b''.join(b'\0'+b''.join(bytes(colors[(y//8)*2+x//8]) for x in range(16)) for y in range(16))
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>2I5B',16,16,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(pixels,9))+chunk(b'IEND',b'')

def box(start,end,swatch):
    x,y=(swatch%2)*8,(swatch//2)*8
    return {'from':start,'to':end,'faces':{face:{'uv':[x+.5,y+.5,x+7.5,y+7.5],'texture':'#staff'} for face in ['north','south','east','west','up','down']}}

for name, tip in [('rift_staff',(255,169,176,255)),('rift_staff_blue',(124,247,255,255))]:
    tex = ROOT/'textures/item'/f'{name}.png'
    tex.write_bytes(png([(19,37,55,255),(24,122,133,255),(208,166,87,255),tip]))
    model={'textures':{'staff':f'entersift:item/{name}','particle':f'entersift:item/{name}'},'ambientocclusion':False,
           'elements':[
               box([7,-12,7],[9,18,9],0), box([6.5,-11,6.5],[9.5,-9,9.5],2),
               box([6.5,11,6.5],[9.5,13,9.5],1), box([5,16,5.5],[11,22,10.5],0),
               box([4.5,16,5],[11.5,17,11],2),box([4.5,21,5],[11.5,22,11],1),
               box([7,18,5.2],[9,20,5.6],3), box([6.5,24,6.5],[9.5,28,9.5],3),
               box([3,22.5,7],[4.5,24,8.5],3),box([11.5,23.5,7],[13,25,8.5],3)],
           'display':{
               'thirdperson_righthand':{'rotation':[0,0,0],'translation':[0,2,1],'scale':[.65,.65,.65]},
               'thirdperson_lefthand':{'rotation':[0,0,0],'translation':[0,2,1],'scale':[.65,.65,.65]},
               'firstperson_righthand':{'rotation':[0,-15,-12],'translation':[1,1,-2],'scale':[.55,.55,.55]},
               'firstperson_lefthand':{'rotation':[0,15,12],'translation':[1,1,-2],'scale':[.55,.55,.55]},
               'gui':{'rotation':[15,-30,-35],'translation':[0,0,0],'scale':[.38,.38,.38]},
               'ground':{'translation':[0,4,0],'scale':[.3,.3,.3]},
               'fixed':{'rotation':[0,0,-30],'scale':[.4,.4,.4]}}}
    (ROOT/'models/item'/f'{name}.json').write_text(json.dumps(model,indent=2)+'\n')
    (ROOT/'items'/f'{name}.json').write_text(json.dumps({'model':{'type':'minecraft:model','model':f'entersift:item/{name}'}},indent=2)+'\n')
