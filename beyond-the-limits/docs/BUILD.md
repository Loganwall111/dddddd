# Building, running and testing

## Fast path

```bash
cd beyond-the-limits
./gradlew build
```

The jar appears in `build/libs/beyond-the-limits-<version>.jar`. Copy it and a Fabric API jar for
1.21.1 into `.minecraft/mods`, then launch the Fabric 1.21.1 profile.

## Pinned versions

Everything is pinned in `gradle.properties`; changing one of these without changing the others is the
most common way to break the build:

| Property | Value |
|---|---|
| `minecraft_version` | 1.21.1 |
| `yarn_mappings` | 1.21.1+build.3 |
| `loader_version` | 0.16.14 |
| `fabric_version` | 0.116.17+1.21.1 |
| `loom_version` | 1.9.2 |
| Gradle | 8.12 (wrapper) |
| Java | 21 |

## Continuous integration

`.github/workflows/build.yml` compiles every push on Java 21 with the same versions, and uploads the
jar as a build artifact. It is the project's official compile check.

```bash
gh run list --branch <branch>
gh run watch
gh run view --log-failed        # the actual javac errors
```

## Running in a development client

```bash
./gradlew runClient     # singleplayer with the mod loaded
./gradlew runServer     # dedicated server
```

## Testing the mod by hand

The fastest way to see everything is to run these in order:

```
/beyondthelimits reality 60        # band 2: fog closes in, the HUD shifts colour
/beyondthelimits rift              # a rift at your feet; walk into it
/beyondthelimits city              # coordinates of the City and its warehouse
/beyondthelimits blacksun 5        # the sun is replaced, and it is approaching
/beyondthelimits storm 1          # everything the weather can do, permanently
/beyondthelimits reality 20        # band 4: sky cracks, impossible geometry, journal damage
/teleport backrooms                # the sole command route; the warehouse gate and dementia fall remain in-world routes
```

The journal (`G`) tracks what you have witnessed and gates its own pages accordingly, so a fresh
world will have a shorter book than a played-in one.

## Regenerating assets

If you change a block's name, a texture's palette or a sound, change the generator and re-run it —
never hand-edit the output, because the next run will overwrite it:

```bash
python3 tools/gen_textures.py
python3 tools/gen_models.py
python3 tools/gen_datapack.py
python3 tools/gen_lang.py
python3 tools/gen_sounds.py       # needs: pip install numpy soundfile
```

The texture, model and datapack generators need nothing but the Python standard library.

## Static checks available without a JDK

```bash
python3 tools/check_imports.py
python3 tools/check_lang.py
python3 tools/check_mod_invariants.py
cd tools
node syn.js ../src/main/java      # parses every Java file, reports files/failed
python3 yarn_index.py audit ../src/main/java
python3 yarn_index.py class net/minecraft/entity/Entity
python3 yarn_index.py method MinecraftServer.tick
```

`yarn_index.py` answers questions against the real Yarn mappings, which is how the mod's API usage was
verified while it was being written. It only knows vanilla mappings — Fabric API classes have to be
checked against the Fabric source.

## Troubleshooting

**The game crashes on startup with a missing dimension.**
A datapack file is missing or malformed: `python3 -c "import json;json.load(open('<file>'))"` to find
it. Dimensions, dimension types and biomes must all be present and agree on ids.

**Nothing renders — the game is black except the HUD.**
A core shader failed to compile. Check `logs/latest.log` for the shader name; the mod treats a missing
program as "effect absent" everywhere else, so the world itself is fine.

**The build fails with `Could not resolve net.fabricmc:fabric-loom`.**
Check the Loom version against `https://maven.fabricmc.net/net/fabricmc/fabric-loom/maven-metadata.xml`;
Loom must match the Gradle version in the wrapper.

**Textures are magenta/black.**
A model references a texture that the generator did not write. Re-run `gen_textures.py` and
`gen_models.py`; the two scripts must be run as a pair after any change.

**Sounds are silent.**
`sounds.json` names must match the `.ogg` filenames exactly, including case, and every entry needs a
subtitle key present in `en_us.json`. `gen_sounds.py` writes both at once.
