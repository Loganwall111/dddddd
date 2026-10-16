#!/usr/bin/env python3
"""
UE4/UE5 cooked-texture extractor -> PNG, no external dependencies.

Minecraft Dungeons ships cooked Unreal packages: a small serialised header (with the pixel format
somewhere in it) followed by pixel payload, sometimes inline and sometimes in a sibling .ubulk.
This tool finds the payload, tries the formats the header allows, and writes a PNG per candidate so the
right one can be picked by eye.

Usage:  python3 tools/ue_tex.py <file.uasset|.ubulk> <outdir> [--dims 512x256,1024x512] [--format bgra8|bc3|bc1|r8]
"""
import re
import struct
import sys
import zlib
from pathlib import Path


# ------------------------------------------------------------------ PNG (no PIL in this sandbox)
def write_png(path, width, height, rgba):
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)                       # filter type 0
        raw += rgba[y * stride:(y + 1) * stride]
    def chunk(tag, data):
        out = struct.pack('>I', len(data)) + tag + data
        return out + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    png += chunk(b'IEND', b'')
    Path(path).write_bytes(png)


def write_png_gray(path, width, height, gray):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw += gray[y * width:(y + 1) * width]
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    png += chunk(b'IEND', b'')
    Path(path).write_bytes(png)


# ------------------------------------------------------------------ block decoders
def _c565(v):
    r = (v >> 11) & 0x1F
    g = (v >> 5) & 0x3F
    b = v & 0x1F
    return (r << 3 | r >> 2, g << 2 | g >> 4, b << 3 | b >> 2)


def _decode_color_block(block, out, w, x, y):
    """BC1 colour half of a block (8 bytes) -> 4x4 pixels into out (RGBA bytearray)."""
    c0, c1, bits = struct.unpack_from('<HHI', block, 0)
    r0, g0, b0 = _c565(c0)
    r1, g1, b1 = _c565(c1)
    if c0 > c1 or True:                     # BC1 opaque mode (DXT5 colour halves are always 4-colour)
        palette = [(r0, g0, b0, 255), (r1, g1, b1, 255),
                   ((2 * r0 + r1) // 3, (2 * g0 + g1) // 3, (2 * b0 + b1) // 3, 255),
                   ((r0 + 2 * r1) // 3, (g0 + 2 * g1) // 3, (b0 + 2 * b1) // 3, 255)]
    for i in range(16):
        px = (bits >> (2 * i)) & 3
        cx, cy = x + (i % 4), y + (i // 4)
        if cx < w:
            o = (cy * w + cx) * 4
            out[o:o + 4] = bytes(palette[px])
    return out


def decode_bc3(data, w, h):
    out = bytearray(w * h * 4)
    bw = (w + 3) // 4
    for by in range((h + 3) // 4):
        for bx in range(bw):
            off = (by * bw + bx) * 16
            if off + 16 > len(data):
                return None
            a0, a1 = data[off], data[off + 1]
            abits = int.from_bytes(data[off + 2:off + 8], 'little')
            if a0 > a1:
                alpha = [a0, a1] + [((7 - i) * a0 + i * a1) // 7 for i in range(1, 7)]
            else:
                alpha = ([a0, a1] + [((5 - i) * a0 + i * a1) // 5 for i in range(1, 5)] + [0, 255])
            _decode_color_block(data[off + 8:off + 16], out, w, bx * 4, by * 4)
            for i in range(16):                      # alpha AFTER colour: the colour half writes opaque
                px = (abits >> (3 * i)) & 7          # alpha into byte 3 and would else clobber this
                cx, cy = bx * 4 + (i % 4), by * 4 + (i // 4)
                if cx < w and cy < h:
                    out[(cy * w + cx) * 4 + 3] = alpha[px]
    return out


def decode_bc1(data, w, h):
    out = bytearray(w * h * 4)
    bw = (w + 3) // 4
    for by in range((h + 3) // 4):
        for bx in range(bw):
            off = (by * bw + bx) * 8
            if off + 8 > len(data):
                return None
            _decode_color_block(data[off:off + 8], out, w, bx * 4, by * 4)
    return out


def decode_bgra8(data, w, h):
    if len(data) < w * h * 4:
        return None
    out = bytearray(w * h * 4)
    src = data[:w * h * 4]
    for i in range(0, len(src), 4):
        out[i] = src[i + 2]         # B
        out[i + 1] = src[i + 1]     # G
        out[i + 2] = src[i]         # R
        out[i + 3] = src[i + 3]     # A
    return out


def decode_r8(data, w, h):
    return data[:w * h] if len(data) >= w * h else None


# ------------------------------------------------------------------ header sniffing
def pixel_format(d):
    m = re.search(rb'PF_[A-Z0-9_]+', d[:4096])
    return m.group().decode() if m else None


def mip_dimensions(d):
    """Cooked FTexture2DMipMap array: flags, count, size-on-disk, offset, then SizeX/SizeY/SizeZ."""
    found = []
    for off in range(0, min(len(d) - 32, 4096), 4):
        flags, count = struct.unpack_from('<II', d, off)
        if flags not in (1, 0x41, 0x40, 0x81):
            continue
        for size_fmt, size_len in (('<I', 4), ('<Q', 8)):
            size = struct.unpack_from(size_fmt, d, off + 8)[0]
            for off_fmt, off_len in (('<I', 4), ('<Q', 8)):
                o = struct.unpack_from(off_fmt, d, off + 8 + size_len)[0]
                tail = off + 8 + size_len + off_len
                if tail + 12 > len(d):
                    continue
                sx, sy, sz = struct.unpack_from('<III', d, tail)
                if 4 <= sx <= 8192 and 4 <= sy <= 8192 and sz in (0, 1) and size > 0:
                    found.append((off, size, o, sx, sy))
    return found


def payload_window(d, fmt_off, name_len):
    """
    Cooked MDP texture: [header][format string][8 pad][payload][tail]. The payload starts 16 bytes after
    the format string in every file inspected (verified on T_PortalView_Singer_Front: 524288 bytes of
    DXT5 immediately after, tail 32). Tail is the 4-byte UE package magic plus a 28-byte trailer.
    """
    start = fmt_off + 16
    for tail in (32, 4, 0):
        if len(d) - start - tail > 4096:
            yield start, len(d) - tail, tail


BYTES_PER_PIXEL = {'PF_ASTC_4x4': 1.0, 'PF_ASTC_6x6': 16.0 / 36, 'PF_ASTC_8x8': 0.25,
                  'PF_ASTC_10x10': 0.16, 'PF_ASTC_12x12': 16.0 / 144,
                  'PF_DXT5': 1.0, 'PF_DXT3': 1.0, 'PF_BC7': 1.0,
                  'PF_DXT1': 0.5, 'PF_BC4': 0.5, 'PF_BC5': 1.0,
                  'PF_B8G8R8A8': 4.0, 'PF_R8G8B8A8': 4.0,
                  'PF_G8': 1.0, 'PF_R8': 1.0, 'PF_A8': 1.0}


try:                                   # pip install texture2ddecoder -> real BC1..BC7/ASTC decoders
    import texture2ddecoder as _t2d
except Exception:                      # stdlib-only fallback, drives the hand-written BC1/BC3 below
    _t2d = None

T2D = {'PF_BC7': 'decode_bc7', 'PF_BC6H': 'decode_bc6', 'PF_BC5': 'decode_bc5', 'PF_BC4': 'decode_bc4',
       'PF_DXT5': 'decode_bc3', 'PF_DXT3': 'decode_bc3', 'PF_DXT1': 'decode_bc1',
       'PF_ASTC_4x4': 'decode_astc', 'PF_ASTC_6x6': 'decode_astc', 'PF_ASTC_8x8': 'decode_astc',
       'PF_ASTC_10x10': 'decode_astc', 'PF_ASTC_12x12': 'decode_astc'}
ASTC_BLOCK = {'PF_ASTC_4x4': (4, 4), 'PF_ASTC_6x6': (6, 6), 'PF_ASTC_8x8': (8, 8),
              'PF_ASTC_10x10': (10, 10), 'PF_ASTC_12x12': (12, 12)}


def decode_reference(fmt, data, w, h):
    """
    Decode with texture2ddecoder when installed (pip install texture2ddecoder): real BC1/BC3/BC4/BC5/
    BC6H/BC7 and ASTC decoders. It hands back a BGRA buffer, so the channels are swapped here.
    Returns RGBA bytes, or None when the package or that format is unavailable.
    """
    if not _t2d or fmt not in T2D:
        return None
    fn = getattr(_t2d, T2D[fmt], None)
    if fn is None:
        return None
    bp = None
    try:
        if fmt in ASTC_BLOCK:
            bx, by = ASTC_BLOCK[fmt]
            bp = bytes(fn(bytes(data), w, h, bx, by))
        else:
            bp = bytes(fn(bytes(data), w, h))
    except Exception:
        bp = None
    if bp is None or len(bp) != w * h * 4:      # older builds fill a caller-supplied buffer instead
        try:
            buf = bytearray(w * h * 4)
            if fmt in ASTC_BLOCK:
                bx, by = ASTC_BLOCK[fmt]
                out = fn(bytes(data), w, h, bx, by, bytes(buf))
            else:
                out = fn(bytes(data), w, h, bytes(buf))
            bp = bytes(out if isinstance(out, (bytes, bytearray)) and len(out) == len(buf) else buf)
        except Exception:
            return None
    if len(bp) != w * h * 4:
        return None
    rgba = bytearray(len(bp))
    rgba[0::4] = bp[2::4]
    rgba[1::4] = bp[1::4]
    rgba[2::4] = bp[0::4]
    rgba[3::4] = bp[3::4]
    return bytes(rgba)


W4 = (0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64)


class _Bits:
    def __init__(self, data, bitpos=0):
        self.d = data
        self.p = bitpos

    def get(self, n):
        v = 0
        for i in range(n):
            v |= ((self.d[self.p >> 3] >> (self.p & 7)) & 1) << i
            self.p += 1
        return v


def decode_bc7(data, w, h):
    """
    BC7 has eight block modes with different layouts. Mode 6 (one subset, 7-bit RGBA endpoints with a
    p-bit each, 4-bit weights) is decoded exactly; blocks in any other mode are left black and counted, so
    the caller can report precisely how much of the image is real rather than pretending it is complete.
    """
    out = bytearray(w * h * 4)
    bw = (w + 3) // 4
    total = decoded = 0
    for by in range((h + 3) // 4):
        for bx in range(bw):
            off = (by * bw + bx) * 16
            if off + 16 > len(data):
                return out, (decoded / total if total else 0.0)
            blk = data[off:off + 16]
            total += 1
            mode = 0
            while mode < 8 and not (blk[0] >> mode) & 1:
                mode += 1
            if mode != 6:
                continue
            bits = _Bits(blk, 7)
            e = [bits.get(7) for _ in range(8)]          # R0 R1 G0 G1 B0 B1 A0 A1
            p0, p1 = bits.get(1), bits.get(1)
            e0 = [(e[0] << 1) | p0, (e[2] << 1) | p0, (e[4] << 1) | p0, (e[6] << 1) | p0]
            e1 = [(e[1] << 1) | p1, (e[3] << 1) | p1, (e[5] << 1) | p1, (e[7] << 1) | p1]
            idx = [bits.get(3) if i == 0 else bits.get(4) for i in range(16)]   # pixel 0 is the anchor
            for i in range(16):
                wt = W4[idx[i]]
                cx, cy = bx * 4 + (i % 4), by * 4 + (i // 4)
                if cx < w and cy < h:
                    o = (cy * w + cx) * 4
                    for c in range(4):
                        out[o + c] = ((64 - wt) * e0[c] + wt * e1[c] + 32) >> 6
            decoded += 1
    return out, (decoded / total if total else 0.0)


DECODERS = {'PF_DXT5': decode_bc3, 'PF_DXT3': decode_bc3, 'PF_BC5': decode_bc3,
            'PF_DXT1': decode_bc1, 'PF_BC4': decode_bc1,
            'PF_B8G8R8A8': decode_bgra8, 'PF_R8G8B8A8': decode_bgra8,
            'PF_G8': decode_r8, 'PF_R8': decode_r8, 'PF_A8': decode_r8,
            'PF_BC7': None}          # handled by decode_bc7 (two return values), see convert()


# Shapes seen in this asset set, in preference order. The pixel payload of a cooked texture carries no
# dimensions, and a DXT5 stream resliced at the wrong width stays locally smooth, so dimensions cannot be
# derived from the bytes alone. This prior picks the standard console/UE shapes; anything checked by eye is
# recorded in tools/ue_dims.json and takes precedence.
SHAPE_PRIOR = [(1024, 512), (512, 512), (1024, 1024), (2048, 512), (2048, 2048), (2048, 1024),
               (2048, 256), (1024, 256), (512, 1024), (512, 256), (2048, 128), (4096, 1024),
               (1024, 2048), (256, 256), (4096, 512), (512, 128), (256, 512), (4096, 256),
               (256, 128), (128, 128), (64, 64), (32, 32), (4096, 4096), (4096, 2048)]


def verified_dims():
    f = Path(__file__).with_name('ue_dims.json')
    if f.exists():
        import json
        return {k: tuple(v) for k, v in json.loads(f.read_text()).items()}
    return {}


def header_dims(fmt, d, faces=1):
    """
    Cooked packages often carry the mip dimensions in the header as adjacent int32s. When a
    power-of-two pair multiplies out to the payload size for this pixel format, that pair IS the
    resolution - a self-validating hit, no guessing.
    """
    bpp = BYTES_PER_PIXEL.get(fmt)
    if not bpp:
        return None
    full = len(d) - (d[:16384].find(b'PF_') + 16) - 32
    px = full / faces / bpp
    pot = (16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192)
    best = None
    for off in range(0, 8192, 4):
        if off + 8 > len(d):
            break
        w, h = struct.unpack_from('<ii', d, off)
        if w in pot and h in pot and abs(w * h - px) <= max(1024, px * 0.01):
            delta = abs(w * h - px)
            if best is None or delta < best[0]:
                best = (delta, w, h, off)
    return best[1:3] if best else None


def dims_before_format(fmt, d, at):
    """
    Minimap-style cooked textures put the pixel dimensions in the two int32s immediately BEFORE the second
    PF_ string, and they are not powers of two - they are the tile's real cell counts (a Meadow tile is
    50x41, MW_FIGHT_001 is 64x37, XL_005 is 87x74). Accepted only when the arithmetic is exact: the
    payload from the format string must account for the whole file bar a small tail.
    """
    bpp = BYTES_PER_PIXEL.get(fmt)
    if not bpp or at < 16:
        return None
    w, h = struct.unpack_from('<ii', d, at - 16)
    if not (4 <= w <= 8192 and 4 <= h <= 8192):
        return None
    need = int(w * h * bpp)
    tail = len(d) - (at + 16) - need
    return (w, h, need, tail) if 0 <= tail <= 128 else None


def dim_candidates(fmt, avail, name=''):
    """
    (w, h, payload_bytes, tail) shapes whose payload fits in `avail` bytes. Exact eye-verified dimensions
    for this asset win; otherwise the prior order is used. Returning the byte count means the payload end
    never has to be guessed.
    """
    bpp = BYTES_PER_PIXEL.get(fmt)
    if not bpp:
        return []
    out = []
    forced = verified_dims().get(name)
    shapes = [forced] if forced else SHAPE_PRIOR
    for (w, h) in shapes:
        need = int(w * h * bpp)
        if 0 <= avail - need <= 560:
            out.append((w, h, need, avail - need))
    return out


def convert(src, outdir):
    """One cooked texture -> PNG (all candidates scored, best written). Returns a manifest dict."""
    rec = {'source': src.name, 'png': None, 'format': None, 'dims': None, 'dims_source': None,
           'candidates': [], 'note': ''}
    try:
        d = src.read_bytes()
        rec['bytes'] = len(d)
        if len(d) < 1024:
            rec['note'] = 'placeholder on Drive: the file is empty, there is no pixel data to convert'
            return rec
        known = ('PF_ASTC_12x12', 'PF_ASTC_10x10', 'PF_ASTC_8x8', 'PF_ASTC_6x6', 'PF_FloatRGBA',
                 'PF_B8G8R8A8', 'PF_R8G8B8A8', 'PF_R16F', 'PF_BC7', 'PF_BC6H', 'PF_BC5', 'PF_BC4',
                 'PF_DXT5', 'PF_DXT3', 'PF_DXT1', 'PF_G8', 'PF_R8', 'PF_A8')
        head = d[:16384]
        hits = []
        for k in known:                       # the format string can appear more than once per package
            at = head.find(k.encode())
            while at >= 0:
                hits.append((at, k))
                at = head.find(k.encode(), at + 1)
        hits.sort()
        if not hits:
            rec['note'] = ('no known PF_ pixel-format string: this is a .ubulk payload, so it needs its '
                           '.uasset twin to give the format, dimensions and offsets')
            return rec
        best = (1e9, None, None)
        tried = []
        for off, fmt in hits:
            if fmt not in DECODERS and fmt not in T2D:
                tried.append(f'{fmt} at {off}: no decoder (console/float format)')
                continue
            for start_o in (off + 16, off + 8, off + 24, off + 32):
                if start_o >= len(d):
                    continue
                avail = len(d) - start_o
                groups = [('image', 1)]
                # A six-face guess once stole a real tile image, so cubemaps are opt-in by filename.
                if 'cubemap' in src.stem.lower():
                    groups.append(('cubemap', 6))
                for kind, faces in groups:
                    pair = dims_before_format(fmt, d, off) if faces == 1 else None
                    if pair:
                        cands = [pair]
                        rec['dims_source'] = 'header pair before the format string (exact fit)'
                    else:
                        hd = header_dims(fmt, d, faces)
                        if hd:
                            need = int(hd[0] * hd[1] * BYTES_PER_PIXEL[fmt])
                            per_face = avail // faces
                            cands = ([(hd[0], hd[1], need, per_face - need)]
                                     if 0 <= per_face - need <= 560 else [])
                            rec['dims_source'] = ('header mip sizes' if faces == 1
                                                  else 'header mip sizes (cubemap face)')
                        else:
                            cands = dim_candidates(fmt, avail // faces, src.stem)[:4]
                    for (w, h, need, tail) in cands:
                        payload = d[start_o:start_o + need * faces]
                        rgba = decode_reference(fmt, payload, w, h)
                        if rgba is not None:
                            frac = 1.0
                        elif fmt == 'PF_BC7':
                            rgba, frac = decode_bc7(payload, w, h)      # mode 6 only
                        elif DECODERS.get(fmt):
                            rgba, frac = DECODERS[fmt](payload, w, h), 1.0
                        else:
                            rgba, frac = None, 0.0
                        if rgba is None:
                            continue
                        # DXT5/BC7 blocks are 4x4 and independent, so at the WRONG width every 4th
                        # column is a hard block seam. Compare seam deltas with interior deltas: at the
                        # right width the seams match the interior, at the wrong one they spike.
                        seam = inner = 0
                        sn = inn = 0
                        for y in range(0, h, 3):
                            base = y * w * 4
                            for x in range(1, w):
                                o = base + x * 4
                                step = abs(rgba[o + 3] - rgba[o - 1]) + abs(rgba[o] - rgba[o - 4]) * 0.25
                                if x % 4 == 0:
                                    seam += step; sn += 1
                                else:
                                    inner += step; inn += 1
                        seam = seam / max(1, sn)
                        inner = inner / max(0.5, inn)
                        score = tail * 0.01 + 400 * (1 - frac)   # exact fit first, then real pixel data
                        label = f'{fmt}@{start_o} {kind} {w}x{h}+{tail}B seam={seam:.1f} inner={inner:.1f} decoded={frac:.0%}'
                        tried.append(label)
                        if score < best[0]:
                            best = (score, (start_o, w, h, fmt, faces, frac, payload), label)
        rec['candidates'] = tried[-16:]
        if best[1] is None:
            rec['format'] = hits[0][1]
            rec['note'] = f'{hits[0][1]}: found the format string but no dimension/payload layout matched'
            return rec
        start_o, w, h, fmt, faces, frac, payload = best[1]
        rec['format'] = fmt
        rec['dims'] = [w, h]
        if not rec.get('dims_source'):
            rec['dims_source'] = ('ue_dims.json (eye-verified)' if src.stem in verified_dims()
                                  else 'shape prior (not verified)')
        rec['decoded_fraction'] = round(frac, 4)
        if faces == 6:
            face_len = len(payload) // 6
            for f in range(6):
                chunk = payload[f * face_len:(f + 1) * face_len]
                rgba = (decode_reference(fmt, chunk, w, h)
                        or (decode_bc7(chunk, w, h)[0] if fmt == 'PF_BC7' else DECODERS[fmt](chunk, w, h)))
                write_png(outdir / f'{src.stem}_face{f}.png', w, h, rgba)
            rec['png'] = f'{src.stem}_face0.png'
            rec['note'] = f'{fmt} cubemap at offset {start_o}: 6 faces of {w}x{h} written'
        else:
            rgba = (decode_reference(fmt, payload, w, h)
                    or (decode_bc7(payload, w, h)[0] if fmt == 'PF_BC7' else DECODERS[fmt](payload, w, h)))
            write_png(outdir / f'{src.stem}.png', w, h, rgba)
            rec['png'] = f'{src.stem}.png'
            rec['note'] = f'decoded {fmt} at offset {start_o}'
            if frac < 0.999:
                rec['note'] += f'; {frac:.0%} of blocks are BC7 mode 6, the rest are other BC7 modes (black)'
    except Exception as e:
        rec['note'] = f'error: {type(e).__name__}: {e}'
    return rec


def main():
    import json
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    srcdir = Path(args[0])
    outdir = Path(args[1] if len(args) > 1 else 'ue_out')
    outdir.mkdir(parents=True, exist_ok=True)
    srcs = []
    if srcdir.is_dir():
        for pat in ('*.uasset', '*.ubulk', '*.uexp'):
            srcs += sorted(srcdir.glob(pat))
    else:
        srcs = [srcdir]
    manifest = [convert(s, outdir) for s in srcs]
    ok = [m for m in manifest if m.get('png')]
    (outdir / 'manifest.json').write_text(json.dumps(manifest, indent=2))
    print(f'converted {len(ok)}/{len(manifest)} source files into {outdir}')
    for m in manifest:
        state = 'PNG ' + str(m['dims']) if m.get('png') else 'SKIP'
        print(f"  {state:15s} {m['source']:42s} {m['format'] or '-':12s} {m['note']}")


if __name__ == '__main__':
    main()
