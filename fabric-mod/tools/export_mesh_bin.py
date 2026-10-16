#!/usr/bin/env python3
"""
Dungeons room heightfield -> a compact mesh the mod can draw in game.

The glTF files in data/sift/structures/gltf are for Blockbench (readable, but bulky and awkward to parse
at runtime). This writes the same surface in the tight format MeshProbeRenderer reads: a binary blob on the
classpath, split into a quad stream for drawing and a column table for collision.

Format (little endian):
  magic  'S','F','M','1'
  u32    version (1)
  u32    footprint width  (w)
  u32    footprint depth  (d)
  u32    quad count
  u32    column count
  quads:   per quad 4 x float32 xyz + 1 x float32 shade          (52 bytes)
  columns: per column int16 x, int16 z, int16 y                  (6 bytes)

Positions are centred on the entity in X/Z with the surface's lowest point at y = 0, so the entity's own
position is the mesh origin. Columns are the top-face cell centres with their surface height, which is
exactly what the probe needs to lay a barrier floor under the player.

Usage:
  python3 tools/export_mesh_bin.py <structures-dir> <out-dir> [--step 2] [--ids DD_ANC_010,DD_ANC_005]
"""
import base64
import json
import struct
import sys
from pathlib import Path

MAGIC = b'SFM1'


def build(height, w, d, step):
    quads = []          # (4 xyz, shade)
    columns = []
    def at(x, z):
        if 0 <= x < w and 0 <= z < d:
            return height[z * w + x]
        return None

    hmin = min(height)
    hmax = max(height)
    span = max(1, hmax - hmin)
    cx, cz = w * 0.5, d * 0.5

    for z in range(0, d - step + 1, step):
        for x in range(0, w - step + 1, step):
            y = at(x, z)
            x0, x1 = x - cx, x + step - cx
            z0, z1 = z - cz, z + step - cz
            lift = (y - hmin) / span
            top = 0.42 + 0.58 * lift
            quads.append((((x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)), top))
            columns.append((x, z, y))
            for (nx, nz, a, b) in ((x, z - step, (x0, y, z0), (x1, y, z0)),
                                   (x, z + step, (x1, y, z1), (x0, y, z1)),
                                   (x - step, z, (x0, y, z1), (x0, y, z0)),
                                   (x + step, z, (x1, y, z0), (x1, y, z1))):
                ny = at(nx, nz)
                if ny is None or ny >= y:
                    continue
                side = 0.30 + 0.45 * lift
                quads.append(((a, b, (b[0], ny, b[2]), (a[0], ny, a[2])), side))
    return quads, columns, hmin, hmax


def write_bin(path, quads, columns, hmin, w, d):
    out = bytearray()
    out += MAGIC
    out += struct.pack('<IIIII', 1, w, d, len(quads), len(columns))
    for pts, shade in quads:
        for p in pts:
            out += struct.pack('<fff', p[0], p[1] - hmin, p[2])
        out += struct.pack('<f', shade)
    for (x, z, y) in columns:
        out += struct.pack('<hhh', x, z, y - hmin)
    path.write_bytes(bytes(out))
    return len(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = Path(args[0])
    out = Path(args[1] if len(args) > 1 else 'mesh_bin')
    out.mkdir(parents=True, exist_ok=True)
    step = int(sys.argv[sys.argv.index('--step') + 1]) if '--step' in sys.argv else 2
    only = sys.argv[sys.argv.index('--ids') + 1].split(',') if '--ids' in sys.argv else None

    index = {'step': step, 'meshes': []}
    for p in sorted(src.glob('*.json')):
        if p.name in ('index.json',):
            continue
        rec = json.loads(p.read_text())
        if 'heightfield_b64' not in rec:
            continue
        rid = rec['id']
        if only and rid not in only:
            continue
        w, hy, d = rec['size']
        height = list(base64.b64decode(rec['heightfield_b64']))
        if len(height) != w * d:
            print(f'  {rid}: heightfield {len(height)} != {w}x{d}, skipped')
            continue
        quads, columns, hmin, hmax = build(height, w, d, step)
        size = write_bin(out / f'{rid}.bin', quads, columns, hmin, w, d)
        entry = {'id': rid, 'file': f'{rid}.bin', 'bytes': size, 'size': [w, hy, d],
                 'quads': len(quads), 'vertices': len(quads) * 4, 'columns': len(columns),
                 'height_range': [hmin, hmax], 'step': step,
                 'fits_vertex_budget': len(quads) * 4 <= 48000}
        index['meshes'].append(entry)
        print(f"  {rid:14s} {w:4d}x{d:<4d} {len(quads):6d} quads ({len(quads)*4:7d} verts)  "
              f"{size/1024:8.1f} KB  budget {'ok' if entry['fits_vertex_budget'] else 'OVER'}")
    (out / 'index.json').write_text(json.dumps(index, indent=1))
    print(f'\nwrote {len(index["meshes"])} meshes into {out} (step {step})')


if __name__ == '__main__':
    main()
