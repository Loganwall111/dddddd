"""End-to-end check: can this workspace read a video, pull frames out of it,
and recover motion that we can compare against a known ground truth?

Writes a synthetic clip with a square moving at a KNOWN velocity, then reads it
back with OpenCV and measures the flow. Passes only if measured ~= truth.
"""

import os
import subprocess
import sys

import cv2
import imageio_ffmpeg
import numpy as np

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
OUT = os.path.join(os.path.dirname(__file__), "..", "probe-output")
OUT = os.path.abspath(OUT)
os.makedirs(OUT, exist_ok=True)
CLIP = os.path.join(OUT, "motion_truth.mp4")

W, H, FPS, FRAMES = 320, 240, 30, 60
# Ground truth: the square moves this many pixels per frame.
TRUE_DX, TRUE_DY = 4.0, -2.0
BOX = 40

# ---- 1. encode a clip with a known moving object -------------------------
cmd = [FFMPEG, "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
       "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p",
       "-preset", "ultrafast", "-qp", "18", CLIP]
proc = subprocess.Popen(cmd, stdin=subprocess.PIPE,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
for i in range(FRAMES):
    img = np.full((H, W, 3), 12, dtype=np.uint8)
    # noise so optical flow has texture to lock onto
    img[::3, ::3] = 30
    x = int(20 + TRUE_DX * i)
    y = int(H - BOX - 20 + TRUE_DY * i)
    # real moving objects carry internal texture; a flat box would make the
    # flow ill-posed (aperture problem), which is a property of the scene, not
    # of the pipeline -- so give it deterministic internal texture.
    rng = np.random.default_rng(1234)
    box = rng.integers(190, 255, size=(BOX, BOX, 3), dtype=np.uint8)
    img[y:y + BOX, x:x + BOX] = box
    proc.stdin.write(img.tobytes())
proc.stdin.close()
proc.wait()
print(f"encoded {CLIP} ({os.path.getsize(CLIP)} bytes, exit={proc.returncode})")

# ---- 2. read it back the way an agent would ------------------------------
cap = cv2.VideoCapture(CLIP)
n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)
dims = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
print(f"decoded: {n} frames, {fps} fps, {dims[0]}x{dims[1]}")

frames = []
while True:
    ok, frame = cap.read()
    if not ok:
        break
    frames.append(frame)
cap.release()

# dump three representative frames as images a vision model can actually see
for i, label in [(0, "first"), (len(frames) // 2, "mid"), (len(frames) - 1, "last")]:
    p = os.path.join(OUT, f"motion_{label}.jpg")
    cv2.imwrite(p, frames[i])
    print(f"  wrote {os.path.relpath(p, os.path.join(OUT, '..'))}")

# ---- 3. measure motion two independent ways ------------------------------
# (a) dense optical flow. The median over the WHOLE frame is wrong: the moving
# box is ~2% of pixels, so static background dominates and the median reads 0.
# Restrict the statistic to the object's own pixels (standard practice) and
# report background flow separately, to prove moving vs static is separable.
flows = []
prev = cv2.cvtColor(frames[0], cv2.COLOR_BGR2GRAY)
for f in frames[1:]:
    gray = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    flow = cv2.calcOpticalFlowFarneback(prev, gray, None, 0.5, 3, 15, 3, 5, 1.2, 0)
    flows.append(flow)
    prev = gray

def bright_mask(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) > 180

obj_dx, obj_dy, bg_dx, bg_dy = [], [], [], []
for i, flow in enumerate(flows):
    m = bright_mask(frames[i])
    m_bg = ~m
    obj_dx.append(np.median(flow[..., 0][m]))
    obj_dy.append(np.median(flow[..., 1][m]))
    bg_dx.append(np.median(flow[..., 0][m_bg]))
    bg_dy.append(np.median(flow[..., 1][m_bg]))
med_dx = float(np.median(obj_dx))
med_dy = float(np.median(obj_dy))
bgx, bgy = float(np.median(bg_dx)), float(np.median(bg_dy))

# (b) track the bright box centroid frame to frame (feature tracking)
def centroid(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = (g > 180).astype(np.uint8)
    m = cv2.moments(mask)
    if m["m00"] == 0:
        return None
    return m["m10"] / m["m00"], m["m01"] / m["m00"]

cents = [c for c in (centroid(f) for f in frames) if c]
track_dx = (cents[-1][0] - cents[0][0]) / (len(cents) - 1)
track_dy = (cents[-1][1] - cents[0][1]) / (len(cents) - 1)

print(f"\ntrue    dx={TRUE_DX:+.2f} dy={TRUE_DY:+.2f} px/frame")
print(f"flow    dx={med_dx:+.2f} dy={med_dy:+.2f} px/frame   "
      f"(err {abs(med_dx - TRUE_DX):.2f}, {abs(med_dy - TRUE_DY):.2f})")
print(f"bg flow dx={bgx:+.2f} dy={bgy:+.2f} px/frame   "
      f"<- static background reads ~0, so moving/static is separable")
print(f"tracker dx={track_dx:+.2f} dy={track_dy:+.2f} px/frame   "
      f"(err {abs(track_dx - TRUE_DX):.2f}, {abs(track_dy - TRUE_DY):.2f})")
print(f"total travel: {track_dx * (len(cents) - 1):+.0f} x, "
      f"{track_dy * (len(cents) - 1):+.0f} y over {len(cents)} frames")

ok = (abs(med_dx - TRUE_DX) < 1.0 and abs(med_dy - TRUE_DY) < 1.0
      and abs(track_dx - TRUE_DX) < 0.5 and abs(track_dy - TRUE_DY) < 0.5)
print(f"\nRESULT: {'PASS - motion recovered' if ok else 'FAIL'}")
sys.exit(0 if ok else 1)
