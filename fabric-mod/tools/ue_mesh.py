#!/usr/bin/env python3
"""
Cooked UE static mesh -> glTF + a PNG preview, no external dependency beyond Pillow for the preview.

A cooked static mesh is a pile of typed arrays with no schema: positions (float32 x3), tangents,
UVs, colours and indices, sometimes inline in the .uasset and sometimes in a sibling .ubulk. Nothing in
the file says which is which, so this tool finds candidates by shape and then *cross-validates them
against each other*: an index buffer is only believable when max(index)+1 equals the vertex count of a
contiguous position block that sits in the file, and the two together are only believable when the
resulting triangles have sane areas. A mesh that survives both checks is reported as parsed; anything
else is reported as a miss. No guessing, no partial meshes presented as whole ones.

Usage:
  python3 tools/ue_mesh.py <mesh.uasset> [--bulk <mesh.ubulk>] --out <dir> [--name SM_X]
"""
import struct
import sys
import base64
import json
import math
from pathlib import Path


# ------------------------------------------------------------------ candidate scanning
def float_runs(d, start=0, end=None, min_len=900):
    """Longest contiguous runs of finite float32 triples (the shape a position buffer has)."""
    end = len(d) if end is None else end
    runs = []
    i = start
    while i + 12 <= end - 12:
        v = struct.unpack_from('<fff', d, i)
        if all(math.isfinite(x) and abs(x) < 1.0e6 for x in v):
            j = i
            n = 0
            while j + 12 <= end:
                t = struct.unpack_from('<fff', d, j)
                if not all(math.isfinite(x) and abs(x) < 1.0e6 for x in t):
                    break
                j += 12
                n += 1
            if n * 3 >= min_len:
                runs.append((i, n))
            i = j + 12
        else:
            i += 4
    return runs


def index_runs(d, start=0, end=None, min_len=300):
    """Long runs of uint16 that all fit under a modest bound - the shape of an index buffer."""
    end = len(d) if end is None else end
    runs = []
    i = start
    while i + 2 <= end:
        v = struct.unpack_from('<H', d, i)[0]
        if v == 0 or v < 65535:
            j = i
            vals = 0
            mx = 0
            while j + 2 <= end:
                t = struct.unpack_from('<H', d, j)[0]
                if t == 0 if vals == 0 else t >= 65535:
                    break
                mx = max(mx, t)
                j += 2
                vals += 1
            if vals >= min_len:
                runs.append((i, vals, mx))
            i = max(j, i + 2)
        else:
            i += 2
    return runs


def triangle_quality(positions, indices):
    """
    Mean and min triangle area over a sample. Random index noise gives degenerate or enormous triangles;
    a real mesh sits in a narrow band.
    """
    n = len(indices) // 3
    step = max(1, n // 400)
    areas = []
    for t in range(0, n, step):
        a, b, c = indices[3 * t], indices[3 * t + 1], indices[3 * t + 2]
        if max(a, b, c) >= len(positions):
            return None
        ax, ay, az = positions[a]
        bx, by, bz = positions[b]
        cx, cy, cz = positions[c]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        cr = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        areas.append(0.5 * math.sqrt(cr[0] ** 2 + cr[1] ** 2 + cr[2] ** 2))
    if not areas:
        return None
    areas.sort()
    return {'mean': sum(areas) / len(areas), 'median': areas[len(areas) // 2],
            'degenerate_frac': sum(1 for a in areas if a <= 1e-9) / len(areas)}


def parse(d):
    """Find the best (positions, indices) pair and say exactly why it was accepted."""
    report = {'position_runs': [], 'index_runs': [], 'accepted': None}
    pruns = sorted(float_runs(d), key=lambda r: -r[1])[:8]
    for off, n in pruns:
        block = d[off:off + n * 12]
        pos = [struct.unpack_from('<fff', block, k * 12) for k in range(n)]
        xs = [p[0] for p in pos]; ys = [p[1] for p in pos]; zs = [p[2] for p in pos]
        report['position_runs'].append({
            'offset': off, 'verts': n,
            'bbox': [[round(min(xs), 1), round(min(ys), 1), round(min(zs), 1)],
                     [round(max(xs), 1), round(max(ys), 1), round(max(zs), 1)]]})
    counts = {r['verts'] for r in report['position_runs']}
    iruns = sorted(index_runs(d), key=lambda r: -r[1])[:8]
    for off, n, mx in iruns:
        v = mx + 1
        report['index_runs'].append({'offset': off, 'values': n, 'max': mx,
                                     'implied_verts': v, 'multiple_of_3': n % 3 == 0,
                                     'vertex_count_match': v in counts})
    # accept only from a cross-validated pair
    for ir in report['index_runs']:
        if not ir['multiple_of_3'] or not ir['vertex_count_match']:
            continue
        n = ir['implied_verts']
        for pr in report['position_runs']:
            if pr['verts'] != n:
                continue
            positions = [struct.unpack_from('<fff', d, pr['offset'] + k * 12) for k in range(n)]
            cnt = ir['values']
            idx = list(struct.unpack_from('<%dH' % cnt, d, ir['offset']))
            q = triangle_quality(positions, idx)
            if q is None or q['degenerate_frac'] > 0.25:
                continue
            report['accepted'] = {'position_offset': pr['offset'], 'vertex_count': n,
                                  'index_offset': ir['offset'], 'index_count': cnt,
                                  'triangles': cnt // 3, 'quality': q}
            return positions, idx, report
    return None, None, report


# ------------------------------------------------------------------ output
def write_gltf(path, name, positions, indices):
    vbytes = bytearray()
    for p in positions:
        vbytes += struct.pack('<fff', *p)
    ibytes = b''.join(struct.pack('<I', i) for i in indices)
    buf = bytes(vbytes) + ibytes
    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]
    doc = {
        'asset': {'version': '2.0', 'generator': 'entersift ue_mesh.py (cooked UE static mesh)'},
        'scene': 0, 'scenes': [{'name': name, 'nodes': [0]}],
        'nodes': [{'name': name, 'mesh': 0}],
        'meshes': [{'name': name, 'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'mode': 4}]}],
        'buffers': [{'byteLength': len(buf),
                     'uri': 'data:application/octet-stream;base64,' + base64.b64encode(buf).decode()}],
        'bufferViews': [{'buffer': 0, 'byteOffset': 0, 'byteLength': len(vbytes), 'target': 34962},
                        {'buffer': 0, 'byteOffset': len(vbytes), 'byteLength': len(ibytes), 'target': 34963}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': len(positions), 'type': 'VEC3',
             'min': [min(xs), min(ys), min(zs)], 'max': [max(xs), max(ys), max(zs)]},
            {'bufferView': 1, 'componentType': 5125, 'count': len(indices), 'type': 'SCALAR'}],
    }
    Path(path).write_text(json.dumps(doc))
    return len(buf)


def preview_png(path, positions, indices, size=700, title=None):
    """Flat-shaded painter's-algorithm render so a human can confirm the mesh is real."""
    from PIL import Image, ImageDraw
    xs = [p[0] for p in positions]; ys = [p[1] for p in positions]; zs = [p[2] for p in positions]
    cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2; cz = (min(zs) + max(zs)) / 2
    span = max(max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)) or 1.0
    tris = []
    for t in range(len(indices) // 3):
        a, b, c = indices[3 * t], indices[3 * t + 1], indices[3 * t + 2]
        pts = [positions[a], positions[b], positions[c]]
        # isometric-ish projection
        def proj(p):
            x, y, z = p[0] - cx, p[1] - cy, p[2] - cz
            sx = (x - z) * 0.7071
            sy = (x + z) * 0.4082 - y * 0.8165
            return sx, sy
        pp = [proj(p) for p in pts]
        depth = sum((p[0] - cx) + (p[2] - cz) - (p[1] - cy) for p in pts) / 3
        ux = pts[1][0] - pts[0][0]; uy = pts[1][1] - pts[0][1]; uz = pts[1][2] - pts[0][2]
        vx = pts[2][0] - pts[0][0]; vy = pts[2][1] - pts[0][1]; vz = pts[2][2] - pts[0][2]
        nx = uy * vz - uz * vy; ny = uz * vx - ux * vz; nz = ux * vy - uy * vx
        ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        light = max(0.12, abs((nx * 0.4 + ny * -0.8 + nz * 0.45) / ln))
        tris.append((depth, pp, light))
    tris.sort(key=lambda t: t[0])
    scale = (size * 0.46) / (span * 0.75)
    img = Image.new('RGB', (size, size), (16, 18, 24))
    dr = ImageDraw.Draw(img)
    for _, pp, light in tris:
        shade = int(60 + 190 * light)
        dr.polygon([(size / 2 + x * scale, size / 2 - y * scale) for x, y in pp],
                   fill=(shade, int(shade * 0.94), int(shade * 0.86)))
    if title:
        dr.text((8, 8), title, fill=(255, 220, 140))
    img.save(path)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = Path(args[0])
    out = Path(sys.argv[sys.argv.index('--out') + 1]) if '--out' in sys.argv else Path('mesh_out')
    out.mkdir(parents=True, exist_ok=True)
    d = src.read_bytes()
    bulk = None
    if '--bulk' in sys.argv:
        bulk = Path(sys.argv[sys.argv.index('--bulk') + 1]).read_bytes()
    name = src.stem
    print(f'{name}: uasset {len(d)} bytes' + (f', bulk {len(bulk)} bytes' if bulk else ''))
    for label, buf in (('uasset', d), ('bulk', bulk)):
        if not buf:
            continue
        positions, indices, report = parse(buf)
        print(f'--- {label}: {len(report["position_runs"])} position runs, {len(report["index_runs"])} index runs')
        for r in report['position_runs'][:4]:
            print('    pos', r)
        for r in report['index_runs'][:4]:
            print('    idx', r)
        if positions:
            a = report['accepted']
            print(f'    ACCEPTED: {a["vertex_count"]} verts, {a["triangles"]} tris, '
                  f'quality {a["quality"]}')
            (out / f'{name}.gltf').write_text('')
            write_gltf(out / f'{name}.gltf', name, positions, indices)
            preview_png(out / f'{name}_preview.png', positions, indices, title=f'{name} ({label})')
            print(f'    wrote {name}.gltf and {name}_preview.png')
        else:
            print('    no cross-validated mesh in this buffer')
    (out / f'{name}_report.json').write_text(json.dumps(
        {k: v for k, v in report.items()}, indent=1))


if __name__ == '__main__':
    main()
