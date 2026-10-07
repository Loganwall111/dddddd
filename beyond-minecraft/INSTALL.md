# Install Beyond Minecraft 0.2.0-alpha

This is a **Minecraft Java mod**, not a standalone executable or a browser app.

1. Make a **separate Minecraft Java 1.21.1** profile using **Java 21** and **Fabric Loader
   0.16.9 or later**. This JAR intentionally rejects other Minecraft versions.
2. Install **Fabric API for 1.21.1**. The tested build used **0.102.1+1.21.1**.
3. Put `beyond-minecraft-0.2.0-alpha.jar` from `releases/` into that profile's **mods** folder.
   Do not double-click the JAR. Do not install a `-sources.jar` or ZIP as a mod.
4. Start a **new Creative test world with cheats enabled**, initially without Iris, Sodium or
   other renderer mods. No separate shader pack or Python installation is required.
5. Run **`/beyond kit`**. Press **B** for the guide. Equip Radiate Reality Glasses in the
   **head slot** and press **V** to cycle the six Mandela lenses.

| Control / item | Action |
|---|---|
| **B** | Field guide and visual settings |
| **V** | Next lens; glasses must be worn |
| **O** | Disable/enable Beyond post-processing immediately |
| Reality Knife, use in clear air | Open a membrane; walk across after it opens |
| Reality Knife, **sneak-use** | Return to your first external origin |
| Shattered Relic | Create a local singularity; its center leads to a realm |
| Scale Prism | Cycle small/normal/large sizes; use open space |
| **`/beyond return`** | Return without needing an item |
| **`/beyond scale 1`** | Operator reset to normal scale |
| **`/beyond witness`** | Operator replay of the eye introduction |

The eye appears just above the direction you initially faced. The sky's distant black hole
is a backdrop; a relic-created singularity has real server-side attraction. Creative flight
prevents attraction but not dimension travel.

## Important alpha precautions

- **Back up worlds and playerdata.** Prefer a disposable test world for this first build.
- First visits intentionally **copy inventory**; later visits restore each realm's own
  snapshot. XP, ender chests and placed containers are not duplicated/isolated.
- Both a server and its players need this mod and matching Fabric API. Automated integrated
  tests passed, but **multiplayer and renderer-mod compatibility are not certified**.
- Beds/respawn anchors follow restricted vanilla dimension rules and can explode in Beyond
  realms. Use `/beyond return` rather than trying to respawn there with a bed.
- The membrane shows a procedural vista, **not live destination chunks**; actual world
  loading happens on crossing. There are eight compiled realms in this binary.
- Before uninstalling, return to root reality, restore normal scale and back up. Custom
  blocks and dimensions cannot remain usable after removing their defining mod.
- Never enable `BEYOND_SMOKE` or `BEYOND_CLIENT_SMOKE` for ordinary play; these are destructive
  **disposable-test-fixture** harnesses, not player options.

See [README.md](README.md) for recipes, configuration, source/build instructions and explicit
scope limits; [BUILD_STATUS.md](docs/BUILD_STATUS.md) records what was actually verified.
