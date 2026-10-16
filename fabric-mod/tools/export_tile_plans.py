#!/usr/bin/env python3
"""
SiftMeadow tile plans: the decoded tile minimaps -> tile data the mod can read.

Each `T_SiftMeadow_<TILE>_Minimap` is per-tile data at the tile's real cell resolution (LG_R_FLAT_001_MW
is 50x41 cells, MW_FIGHT_001 is 64x37, XL_005_MW_P1 is 87x74 - the dimensions sit in the two int32s
before the format string and every one of them accounts for the file size exactly).

What the channels hold, measured rather than assumed:
  R   four discrete values (0/85/170/255) in large contiguous regions -> a 4-class region mask
  G   small integers with a mean neighbour delta under 1.0 -> a smooth scalar field, not noise
  B   constant 255
  A   constant 255

The R/G semantics are NOT confirmed: nothing in the export pairs a minimap with its tile's objectgroup, so
this records the structure and the raw values, and stops there. Anyone reading a tile plan downstream should
treat `mask` as "a 4-class region label" and `field` as "a smooth scalar", not as walkability or height.

Usage:
  python3 tools/export_tile_plans.py <dir-of-decoded-pngs> <out-dir>
"""
import base64
import json
import sys
from collections import Counter
from pathlib import Path


def rle(values, limit=None):
    """[(value, run_length), ...] - tile plans are large flat regions, so this is tiny."""
    out = []
    for v in values:
        if out and out[-1][0] == v:
            out[-1][1] += 1
        else:
            out.append([v, 1])
    if limit and len(out) > limit:
        return None
    return out


def convert(png, out):
    from PIL import Image
    im = Image.open(png).convert('RGBA')
    w, h = im.size
    px = list(im.getdata())
    mask = [px[i][0] for i in range(w * h)]
    field = [px[i][1] for i in range(w * h)]
    blue = {px[i][2] for i in range(w * h)}
    alpha = {px[i][3] for i in range(w * h)}
    tile = png.stem.replace('T_SiftMeadow_', '').replace('_Minimap', '')
    doc = {
        'id': tile,
        'cells': [w, h],
        'source': png.name,
        'channels': {
            'mask': {'values': sorted(set(mask)), 'counts': {str(v): mask.count(v) for v in sorted(set(mask))}},
            'field': {'min': min(field), 'max': max(field), 'distinct': len(set(field))},
            # nearly constant: a couple of stray pixels exist, so report the dominant fraction
            'blue_dominant_frac': round(max(Counter(px[i][2] for i in range(w * h)).values()) / (w * h), 5),
            'alpha_dominant_frac': round(max(Counter(px[i][3] for i in range(w * h)).values()) / (w * h), 5),
        },
        # both channels ride along: RLE for the mask (contiguous regions), base64 for the field
        'mask_rle': rle(mask),
        'field_b64': base64.b64encode(bytes(field)).decode(),
    }
    (out / f'{tile}.json').write_text(json.dumps(doc))
    return doc


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    src = Path(args[0])
    out = Path(args[1] if len(args) > 1 else 'tile_plans')
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    for png in sorted(src.glob('T_SiftMeadow_*_Minimap.png')) + sorted(src.glob('T_SiftRavines_*_Minimap.png')):
        doc = convert(png, out)
        entries.append({'id': doc['id'], 'cells': doc['cells'],
                        'mask_classes': doc['channels']['mask']['values'],
                        'field_range': [doc['channels']['field']['min'], doc['channels']['field']['max']]})
        print(f"  {doc['id']:24s} {doc['cells'][0]:3d}x{doc['cells'][1]:<3d} "
              f"mask={doc['channels']['mask']['values']} field 0..{doc['channels']['field']['max']}")
    (out / 'index.json').write_text(json.dumps({'tiles': entries}, indent=1))
    print(f'\nwrote {len(entries)} tile plans into {out}')


if __name__ == '__main__':
    main()
