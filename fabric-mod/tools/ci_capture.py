#!/usr/bin/env python3
"""0.23 headless visual playtest orchestrator (CI only).

Drives a real Minecraft 26.3 Fabric client+server pair running under Xvfb/llvmpipe:

  * server state (time, summon, camera teleports with yaw/pitch) over RCON,
  * screenshots through the client's file mailbox (see client/SiftCapture.java):
    write <name>.req, wait for <name>.done, collect <name>.png.

No gameplay code is touched; the camera is the vanilla player camera, so every png is
exactly what a player would see. Usage: ci_capture.py [capture_dir] [rcon_port]
"""
import os, socket, struct, subprocess, sys, time
from pathlib import Path

CAP = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ENTERSIFT_CAPTURE_DIR", "capture-out"))
PORT = int(sys.argv[2] if len(sys.argv) > 2 else os.environ.get("RCON_PORT", "25575"))
CAP.mkdir(parents=True, exist_ok=True)

# 26.3's renderpearl needs a GLX/EGL visual or a Vulkan surface; on headless CI we try
# X11+EGL first, then SDL's offscreen driver (EGL surfaceless) as fallback.
STRATEGIES = [
    {"SDL_VIDEODRIVER": "x11", "SDL_VIDEO_X11_FORCE_EGL": "1"},
    {"SDL_VIDEODRIVER": "offscreen"},
]


class Rcon:
    def __init__(self, host, port, password):
        self.s = socket.create_connection((host, port), timeout=15)
        self.rid = 1
        self._send(3, password)
        t, _ = self._recv()
        if t == -1:
            raise SystemExit("rcon auth failed")

    def _send(self, typ, body):
        pay = struct.pack("<ii", self.rid, typ) + body.encode() + b"\x00\x00"
        self.s.sendall(struct.pack("<i", len(pay)) + pay)
        self.rid += 1

    def _recv(self):
        (n,) = struct.unpack("<i", self._read(4))
        data = self._read(n)
        rid, typ = struct.unpack("<ii", data[:8])
        return typ, data[8:-2].decode(errors="replace")

    def _read(self, n):
        b = b""
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c:
                raise SystemExit("rcon connection closed")
            b += c
        return b

    def cmd(self, c, expect=True):
        self._send(2, c)
        t, body = self._recv()
        return body


def wait_rcon(timeout=420):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            r = Rcon("127.0.0.1", PORT, "capture")
            print("[capture] rcon up", flush=True)
            return r
        except OSError:
            time.sleep(3)
    raise SystemExit("server rcon never came up")


def start_client(strategy):
    """Launch the capture client only once the server is up, so the two Gradle builds never
    compile cold at the same time (that lock-fought the first capture attempt)."""
    env = dict(os.environ)
    env.update(strategy)
    env["ENTERSIFT_CAPTURE_SERVER"] = "127.0.0.1:25565"  # SiftCapture joins programmatically on title screen
    log = open("/tmp/client.log", "ab")
    log.write(f"\n==== client attempt with {strategy} ====\n".encode())
    p = subprocess.Popen(
        ["./gradlew", "--no-daemon", "runClient",
         "--args=--quickPlayMultiplayer 127.0.0.1:25565 --username CaptureBot"],
        stdout=log, stderr=subprocess.STDOUT, env=env)
    print(f"[capture] client gradle started: {strategy}", flush=True)
    return p


def wait_player(r, timeout=420, proc=None):
    """Return the connected player's name (the dev-launch injector may rename the session)."""
    import re
    t0 = time.time()
    while time.time() - t0 < timeout:
        if proc is not None and proc.poll() is not None:
            print("[capture] client gradle exited early (rc=%s)" % proc.returncode, flush=True)
            return None
        out = r.cmd("list")
        print("[capture] list ->", out.strip(), flush=True)
        # 26.3's exact list wording is unverified; grab whatever follows "online:".
        m = re.search(r"online:\s*([A-Za-z0-9_]+)", out)
        if m:
            print("[capture] client joined as:", m.group(1), flush=True)
            return m.group(1)
        time.sleep(4)
    return None


def boot_client(r):
    for strat in STRATEGIES:
        proc = start_client(strat)
        # Gradle warm-up + asset load + world join measured ~5.5 min on the runner;
        # a 300s window beheaded the client right at "Setting user" once already.
        name = wait_player(r, timeout=900, proc=proc)
        if name:
            return name
        subprocess.run(["pkill", "-f", "xvfb-run"], capture_output=True)
        subprocess.run(["pkill", "-f", "KnotClient"], capture_output=True)
        time.sleep(5)
    raise SystemExit("capture client could not join under any display strategy (see /tmp/client.log)")


def queue(name):
    """Ask the client for a screenshot without waiting - the mailbox serializes requests,
    so back-to-back reqs become grabs ~25 ticks apart (flash phase, then ring phase)."""
    for stale in CAP.glob(name + ".*"):
        stale.unlink()
    (CAP / (name + ".req")).write_text("shoot\n")


def await_done(name, timeout=180):
    t0 = time.time()
    while not (CAP / (name + ".done")).exists():
        if time.time() - t0 > timeout:
            raise SystemExit(f"client never delivered {name}")
        time.sleep(1)
    print(f"[capture] got {name}.png", flush=True)


def shoot(r, name, tp, settle=4.0, timeout=180):
    if tp:
        r.cmd(tp)
    time.sleep(settle)
    for stale in CAP.glob(name + ".*"):
        stale.unlink()
    (CAP / (name + ".req")).write_text("shoot\n")
    t0 = time.time()
    while not (CAP / (name + ".done")).exists():
        if time.time() - t0 > timeout:
            raise SystemExit(f"client never delivered {name}")
        time.sleep(1)
    print(f"[capture] got {name}.png", flush=True)


def main():
    r = wait_rcon()
    who = boot_client(r)
    r.cmd(f"gamemode creative {who}")
    r.cmd(f"data merge entity {who} {{abilities:{{flying:1b}}}}")   # hold the exact tp height for framing
    r.cmd("gamerule doWeatherCycle false")
    r.cmd("weather clear")                       # one run rained mid-capture; refs are all clear-sky
    time.sleep(20)                               # llvmpipe chunk bakes are slow - let terrain finish
    r.cmd("time set noon")
    r.cmd(f"tp {who} 0 -53.5 13 180 -6")   # frame the summon spot BEFORE the timeline starts
    time.sleep(0.5)
    r.cmd("summon entersift:rift_portal 0 -56 0")
    queue("rift_summon_flash")             # grabbed ~tick 8: white flash + first lightning
    queue("rift_summon_ring")              # serialized second grab ~tick 34: expanding ring arcs
    await_done("rift_summon_flash")
    await_done("rift_summon_ring")
    time.sleep(8)                       # finish the 100-tick growth + chunk settle
    shoot(r, "rift_first_person", f"tp {who} 0 -53.5 13 180 -6")
    shoot(r, "rift_side_angle", f"tp {who} 12.5 -53 0 90 -5")
    shoot(r, "rift_close_up", f"tp {who} 0 -53 10 180 -8")
    time.sleep(6)                       # critters emerged at tick 140 and dropped to the ground
    shoot(r, "rift_emergence", f"tp {who} 0 -53.5 13 180 2")
    r.cmd("time set midnight")
    time.sleep(3)
    shoot(r, "rift_night_front", f"tp {who} 0 -53.5 13 180 -6")
    # alpha-transparency proof: same rift, camera above it so the FLAT GROUND shows through the window.
    # abilities.flying never stuck, so borrow spectator's guaranteed flight for this one angle.
    r.cmd("time set noon")
    r.cmd(f"gamemode spectator {who}")
    time.sleep(2)
    shoot(r, "rift_against_ground", f"tp {who} 0 -48.5 9 180 24")
    r.cmd(f"gamemode creative {who}")
    # Sift dimension sky: the quilted pastel dome (MCD2 ref) - never photographed until now
    # surface-level like the MCD2 ref; (140,95,-60) verified clear of Sift towers
    r.cmd(f"execute in entersift:the_sift run tp {who} 140 95 -60 180 -50")
    time.sleep(7)                       # dimension chunks + sky blend settle
    shoot(r, "sift_sky_quilt", None, settle=2)
    pngs = sorted(CAP.glob("*.png"))
    print("[capture] done:", [p.name for p in pngs], flush=True)
    if len(pngs) < 9:
        raise SystemExit("missing captures")


if __name__ == "__main__":
    main()
