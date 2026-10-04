#!/usr/bin/env python3
"""0.23 headless visual playtest orchestrator (CI only).

Drives a real Minecraft 26.3 Fabric client+server pair running under Xvfb/llvmpipe:

  * server state (time, summon, camera teleports with yaw/pitch) over RCON,
  * screenshots through the client's file mailbox (see client/SiftCapture.java):
    write <name>.req, wait for <name>.done, collect <name>.png.

No gameplay code is touched; the camera is the vanilla player camera, so every png is
exactly what a player would see. Usage: ci_capture.py [capture_dir] [rcon_port]
"""
import os, socket, struct, sys, time
from pathlib import Path

CAP = Path(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("ENTERSIFT_CAPTURE_DIR", "capture-out"))
PORT = int(sys.argv[2] if len(sys.argv) > 2 else os.environ.get("RCON_PORT", "25575"))
CAP.mkdir(parents=True, exist_ok=True)


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


def wait_player(r, name="CaptureBot", timeout=420):
    t0 = time.time()
    while time.time() - t0 < timeout:
        out = r.cmd("list")
        if name in out:
            print("[capture] client joined:", out.strip(), flush=True)
            return
        time.sleep(4)
    raise SystemExit("capture client never joined")


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


def start_client():
    """Launch the capture client only once the server is up, so the two Gradle builds never
    compile cold at the same time (that lock-fought the first capture attempt)."""
    import subprocess
    log = open("/tmp/client.log", "wb")
    p = subprocess.Popen(
        ["./gradlew", "--no-daemon", "runClient",
         "--args=--quickPlayMultiplayer 127.0.0.1:25565 --username CaptureBot"],
        stdout=log, stderr=subprocess.STDOUT)
    print("[capture] client gradle started", flush=True)
    return p


def main():
    r = wait_rcon()
    client = start_client()
    wait_player(r)
    r.cmd("gamemode creative CaptureBot")
    r.cmd("time set noon")
    r.cmd("summon entersift:rift_portal 0 -56 0")
    time.sleep(12)                      # 100-tick growth timeline + chunk settle
    shoot(r, "rift_first_person", "tp CaptureBot 0 -58 12 180 -8")
    shoot(r, "rift_side_angle", "tp CaptureBot 12 -57 0 90 -8")
    shoot(r, "rift_close_up", "tp CaptureBot 0 -58 5 180 -12")
    r.cmd("time set midnight")
    time.sleep(3)
    shoot(r, "rift_night_front", "tp CaptureBot 0 -58 12 180 -8")
    pngs = sorted(CAP.glob("*.png"))
    print("[capture] done:", [p.name for p in pngs], flush=True)
    if len(pngs) < 4:
        raise SystemExit("missing captures")


if __name__ == "__main__":
    main()
