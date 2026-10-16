"""Offline preview of the 0.43 rift window matte, so the wiring can be reviewed without launching the game.

This is a SIMULATION of the shader math in core/rift.fsh (#ifdef RIFT_VIEW), not an in-game capture: the
sky is a stand-in for the procedural destination, the matte compositing (cover-fit, stipple threshold,
palette tint, frost veil) is the same arithmetic the shader runs. Needs Pillow + numpy, which CI does not
have; it is a review tool, not part of the build.

Usage: python3 tools/preview_window_art.py [out.png]
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TEX = ROOT / 'src/main/resources/assets/sift/textures/entity'
W, H = 512, 320

# TINT / FROST for a temperate rift style (0) and a dark one (1), from rift.fsh
PALETTE = {'meadow_front': ((0.95, 0.85, 0.25), (0.90, 0.75, 0.76), 0.30),
           'deepdark_front': ((0.95, 0.25, 0.18), (0.86, 0.44, 0.40), 0.55)}


def sky(tint, frost, w, h, endish=False):
    """Stand-in for the shader's procedural destination: horizon to zenith, a ridge, a sun."""
    up = np.linspace(1.0, -1.0, h)[:, None].repeat(w, 1)
    az = np.linspace(-np.pi, np.pi, w)[None, :].repeat(h, 0)
    zenith = np.array(tint) * 0.35 + np.array(frost) * 0.15
    horizon = np.array(tint) * 0.28 + np.array([1.0, 1.0, 1.0]) * 0.28 * 0.72
    f = np.clip((up - 0.02) / 0.60, 0, 1)[..., None]
    col = horizon[None, None, :] * (1 - f) + zenith[None, None, :] * f
    ridge = 0.115 + 0.055 * np.sin(az * 2.3 + 0.8) + 0.030 * np.sin(az * 5.1 + 2.2)
    col = np.where((up < ridge)[..., None], col * 0.35 + np.array(frost) * 0.12, col)
    sun = np.sqrt(((az - 0.55) * 0.85) ** 2 + (up - 0.34) ** 2)
    col = col + np.array(tint)[None, None, :] * np.exp(-sun * 3.2)[..., None] * 0.55
    return np.clip(col, 0, 1)


def window(mat_name, title):
    tint, frost, frost_amt = PALETTE[mat_name]
    matte = np.asarray(Image.open(TEX / f'rift_view_{mat_name}.png').convert('RGBA')).astype(np.float32) / 255.0
    mh, mw = matte.shape[:2]
    # cover-fit to the opening (shader: q scaled by the aspect ratio, then / 1.18)
    t_asp, w_asp = mw / mh, W / H
    ys = np.linspace(0, 1, H)[:, None]
    xs = np.linspace(0, 1, W)[None, :]
    qx, qy = xs - 0.5, ys - 0.5
    if t_asp > w_asp:
        qx = qx * (w_asp / t_asp)
    else:
        qy = qy * (t_asp / w_asp)
    u = np.clip(0.5 + qx / 1.18, 0, 1)
    v = np.clip(0.5 + qy / 1.18, 0, 1)
    px = np.clip((u * (mw - 1)).astype(int), 0, mw - 1)
    py = np.clip((v * (mh - 1)).astype(int), 0, mh - 1)
    sheet = matte[py, px]
    # the shader's 4-tap box average of the alpha, then smoothstep(0.22, 0.52, a4)
    a4 = sum(matte[np.clip(py + dy, 0, mh - 1), np.clip(px + dx, 0, mw - 1), 3]
             for dy, dx in ((0, 0), (0, 1), (1, 0), (1, 1))) / 4.0
    t = np.clip((a4 - 0.22) / 0.30, 0, 1)
    cov = t * t * (3 - 2 * t)
    lum = sheet[..., :3] @ np.array([0.299, 0.587, 0.114])
    land = sheet[..., :3] * 0.40 + (np.array(frost) * 0.7 + np.array(tint) * 0.3)[None, None, :] * (0.30 + 1.20 * lum)[..., None] * 0.60
    col = sky(tint, frost, W, H)
    col = col * (1 - (cov * 0.90)[..., None]) + land * (cov * 0.90)[..., None]
    col = col * (1 - frost_amt * 0.62) + np.array(frost)[None, None, :] * (frost_amt * 0.62)
    img = Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, 22], fill=(0, 0, 0))
    d.text((6, 6), title, fill=(255, 255, 255))
    return img


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'docs/rift_window_art.png'
    a = window('meadow_front', 'meadow matte (temperate rifts: styles 0, 3, 5, 6)')
    b = window('deepdark_front', 'deepdark matte (dark rifts: styles 1, 2, 4, 7)')
    sheet = Image.new('RGB', (W * 2 + 12, H + 26), (16, 16, 18))
    sheet.paste(a, (0, 26))
    sheet.paste(b, (W + 12, 26))
    d = ImageDraw.Draw(sheet)
    d.text((6, 8), 'offline simulation of core/rift.fsh RIFT_VIEW (cover-fit + stipple threshold + palette tint + frost)'
                   ' - NOT an in-game capture', fill=(230, 230, 230))
    sheet.save(out)
    print('wrote', out, sheet.size)


if __name__ == '__main__':
    main()
