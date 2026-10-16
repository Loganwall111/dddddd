#!/usr/bin/env python3
"""
Minecraft Dungeons level data -> Blockbench-openable glTF + mod structure JSON.

Two kinds of source file, both plain JSON on the Drive share:

  objectgroup.json   a placed object/room: id, pos, size, doors, tags and four zlib+base64 arrays.
                     `height-plane`, `walkable-plane`, `region-plane` and `region-y-plane` are exactly
                     sizeX*sizeZ bytes - one height byte per ground column. `blocks` is the full voxel
                     volume (2.5 bytes per voxel) and `boundaries` the wall ring.
  <Level>.json       a level layout sheet (Meadow_Rift_1, Ravines_Dungeon_1, ...): stretches of
                     tile-groups, dead-ends, anchors. Starts with a `//` art banner, so comments are
                     stripped before parsing.

Outputs, per object:
  <id>.gltf                       terrain mesh from height-plane, 1 voxel = 1 unit, opens in Blockbench
  <id>.json                       mod-side structure record (footprint, heightfield, doors, tags)
and per level sheet:
  <Level>.json                    normalised rift/level layout graph

Usage:
  python3 tools/dungeons_geo.py <srcdir> <outdir> [--namespace sift]
"""
import base64
import json
import math
import struct
import sys
import zlib
from pathlib import Path


# ------------------------------------------------------------------ reading the data
def load_sheet(path):
    """Dungeons sheets carry a // banner and // comments; strip them and parse."""
    text = path.read_text(encoding='utf-8', errors='replace')
    lines = [ln for ln in text.splitlines() if not ln.lstrip().startswith('//')]
    return json.loads('\n'.join(lines))


def plane(obj, field):
    """base64 + zlib -> bytes, with the length checked against the object's footprint."""
    raw = base64.b64decode(obj[field])
    data = zlib.decompress(raw)
    w, h, d = obj['size']
    expect = w * d
    if len(data) == expect:
        return data, w, d, 1
    if len(data) == expect * 2:
        return data, w, d, 2
    return data, w, d, 0          # unexpected shape: caller reports instead of guessing


def decode_blocks(obj):
    """
    `blocks` is 2.5 bytes per voxel. Reading it as either 2 or 4 bytes leaves the tail short/long, so the
    layout is reported (not guessed) and used only when it divides exactly.
    """
    raw = base64.b64decode(obj['blocks'])
    data = zlib.decompress(raw)
    w, h, d = obj['size']
    n = w * h * d
    info = {'bytes': len(data), 'voxels': n, 'per_voxel': round(len(data) / n, 3) if n else 0}
    if len(data) == n * 2:
        info['layout'] = 'u16 id per voxel'
        info['palette'] = _palette(struct.unpack_from('<%dH' % n, data, 0), 24)
    elif len(data) == n * 3:
        info['layout'] = 'u24 per voxel'
    else:
        info['layout'] = 'unknown packing; voxel ids not decoded (terrain still comes from height-plane)'
    return data, info


def _palette(values, top=16):
    from collections import Counter
    c = Counter(values)
    return {'distinct': len(c), 'top': [[int(v), int(k)] for v, k in c.most_common(top)]}


# ------------------------------------------------------------------ glTF (Blockbench can import it)
def write_gltf(path, name, w, d, height, y_min=None, step=1):
    """
    One mesh: a quad per ground column stepped up/down to its neighbours, built as two triangles.
    Coordinates are voxel units with y up, centred on the footprint so it imports tidily.
    """
    hmin = min(height) if y_min is None else y_min
    verts = bytearray()
    idx = []

    def column(x, z):
        return height[z * w + x]

    def h(x, z):
        if 0 <= x < w and 0 <= z < d:
            return column(x, z)
        return hmin

    cx, cz = w * 0.5, d * 0.5
    for z in range(0, d - step + 1, step):
        for x in range(0, w - step + 1, step):
            y = column(x, z)
            x0, x1 = x - cx, x + step - cx
            z0, z1 = z - cz, z + step - cz
            # top face
            base = len(verts) // 12
            for (vx, vy, vz) in ((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)):
                verts += struct.pack('<fff', vx, vy, vz)
            idx += [base, base + 1, base + 2, base, base + 2, base + 3]
            # skirt down to the lower of the two neighbours on each side, so the mesh is not paper thin
            for (nx, nz, a, b) in ((x, z - step, (x0, y, z0), (x1, y, z0)),
                                   (x, z + step, (x1, y, z1), (x0, y, z1)),
                                   (x - step, z, (x0, y, z1), (x0, y, z0)),
                                   (x + step, z, (x1, y, z0), (x1, y, z1))):
                ny = h(nx, nz)
                if ny < y:
                    base = len(verts) // 12
                    for (vx, vy, vz) in (a, b, (b[0], ny, b[2]), (a[0], ny, a[2])):
                        verts += struct.pack('<fff', vx, vy, vz)
                    idx += [base, base + 1, base + 2, base, base + 2, base + 3]

    vbytes = bytes(verts)
    ibytes = b''.join(struct.pack('<I', i) for i in idx)
    pad_v = (4 - len(vbytes) % 4) % 4
    vbytes += b'\0' * pad_v
    buf = vbytes + ibytes
    gltf = {
        'asset': {'version': '2.0', 'generator': 'entersift dungeons_geo.py (Minecraft Dungeons level data)'},
        'scene': 0,
        'scenes': [{'name': name, 'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'mode': 4}]}],
        'buffers': [{'byteLength': len(buf),
                     'uri': 'data:application/octet-stream;base64,' + base64.b64encode(buf).decode()}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(vbytes), 'target': 34962},
                        {'buffer': 0, 'byteOffset': len(vbytes), 'byteLength': len(ibytes), 'target': 34963}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(vbytes) // 12, 'type': 'VEC3',
             'min': [-cx - 1, float(hmin), -cz - 1], 'max': [cx + 1, float(max(height)), cz + 1]},
            {'bufferView': 1, 'componentType': 5125, 'count': len(idx), 'type': 'SCALAR'},
        ],
    }
    path.write_text(json.dumps(gltf))
    return {'vertices': len(vbytes) // 12, 'triangles': len(idx) // 3}


# ------------------------------------------------------------------ mod side records
def structure_record(obj):
    height, w, d, width = plane(obj, 'height-plane')
    walk, _, _, _ = plane(obj, 'walkable-plane')
    region, _, _, _ = plane(obj, 'region-plane')
    ymin = min(height) if height else 0
    ymax = max(height) if height else 0
    doors = obj.get('doors') or []
    return {
        'id': obj['id'],
        'pos': obj['pos'],
        'size': obj['size'],
        'y': obj.get('y', 0),
        'tags': (obj.get('tags') or '').split() if obj.get('tags') else [],
        'locked': bool(obj.get('locked')),
        'leaky': bool(obj.get('is-leaky')),
        'doors': doors,
        'height': {'min': int(ymin), 'max': int(ymax), 'columns': len(height), 'bytes_per_column': width},
        'walkable_columns': sum(1 for v in walk if v) if walk else 0,
        'region_columns': sum(1 for v in region if v) if region else 0,
        'heightfield_b64': base64.b64encode(bytes(height)).decode(),
    }


def rift_record(sheet):
    """Normalise a level layout sheet: stretches, tile-groups, dead-ends, anchors."""
    return {
        'id': sheet.get('id'),
        'resource_packs': sheet.get('resource-packs', []),
        'require_matching_doors': sheet.get('require-matching-doors', False),
        'object_groups': sheet.get('object-groups', []),
        'objectives': sheet.get('objectives', []),
        'stretches': [{'id': s.get('id'),
                       'length': s.get('length'),
                       'length_range': s.get('length-range'),
                       'tile_groups': s.get('tile-groups', []),
                       'dead_ends': s.get('dead-ends', []),
                       'tags': s.get('tags', [])} for s in sheet.get('stretches', [])],
        'tile_groups': sheet.get('tile-groups', []),
    }


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    ns = 'sift'
    if '--namespace' in sys.argv:
        ns = sys.argv[sys.argv.index('--namespace') + 1]
    step = int(sys.argv[sys.argv.index('--mesh-step') + 1]) if '--mesh-step' in sys.argv else 1
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    src = Path(args[0])
    out = Path(args[1] if len(args) > 1 else 'structures_out')
    (out / 'gltf').mkdir(parents=True, exist_ok=True)
    (out / 'structures').mkdir(parents=True, exist_ok=True)
    (out / 'rift').mkdir(parents=True, exist_ok=True)

    report = []
    for path in sorted(src.glob('*.json')):
        if path.name.startswith('manifest'):
            continue
        try:
            doc = load_sheet(path)
        except Exception as e:
            report.append({'file': path.name, 'skipped': f'not a parseable sheet: {e}'})
            continue
        if isinstance(doc, dict) and 'objects' in doc:              # objectgroup
            for obj in doc['objects']:
                if only and obj['id'] not in only:
                    continue
                height, w, d, width = plane(obj, 'height-plane')
                rec = structure_record(obj)
                blocks, binfo = decode_blocks(obj)
                rec['blocks'] = binfo
                rec['source_file'] = path.name
                (out / 'structures' / f"{obj['id']}.json").write_text(json.dumps(rec, indent=1))
                mesh = {'skipped': 'height-plane is not 1 or 2 bytes per column'}
                if height and width:
                    if width == 2:
                        height = height[0::2]
                    mesh = write_gltf(out / 'gltf' / f"{obj['id']}.gltf", obj['id'], w, d, list(height), step=step)
                    mesh['step'] = step
                report.append({'file': path.name, 'object': obj['id'], 'size': obj['size'],
                               'columns': len(height), 'height_range': [int(min(height)), int(max(height))]
                               if height else None, 'mesh': mesh, 'blocks': binfo['layout']})
        elif isinstance(doc, dict) and ('stretches' in doc or 'tile-groups' in doc):
            rec = rift_record(doc)
            (out / 'rift' / f"{rec['id'] or path.stem}.json").write_text(json.dumps(rec, indent=1))
            report.append({'file': path.name, 'level': rec['id'],
                           'stretches': len(rec['stretches']),
                           'object_groups': len(rec['object_groups'])})
        else:
            report.append({'file': path.name, 'skipped': 'unrecognised schema',
                           'keys': list(doc)[:8] if isinstance(doc, dict) else type(doc).__name__})

    (out / 'manifest.json').write_text(json.dumps({'namespace': ns, 'entries': report}, indent=1))
    print(json.dumps(report, indent=1)[:4000])
    print(f'\nwrote {len(report)} entries into {out}')


if __name__ == '__main__':
    main()
