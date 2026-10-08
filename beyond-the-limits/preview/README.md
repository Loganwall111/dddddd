# First-slice visual preview

This is a standalone, interactive presentation page for Chapter One. It uses a small procedural WebGL2 shader to preview the growing sky fracture, gravitational lensing, the black sun, and the three stages of **The Bleeding**. It is a visual prototype—not Minecraft gameplay or a substitute for the mod's in-game shaders.

## Run it

From the `beyond-the-limits` project directory, start any static file server and open `/preview/`. For example:

```sh
python3 -m http.server 4173 --bind 0.0.0.0
```

The page references the mod icon and glitch-noise texture directly from `src/main/resources`. No build step or third-party JavaScript dependencies are needed. A browser with WebGL2 is required for the animated sky; a CSS fallback remains if WebGL2 is unavailable.

## Interactions

- Move the pointer to bend the sky around a different point.
- Drag the reality-integrity control down to increase distortion.
- Select **The Mark**, **The Tear**, or **The Bleed** to advance the anomaly.
- Choose **Open the Fracture** to trigger the final state and a short light pulse.
