"""Offline integrity checks. These do NOT substitute for Minecraft codec/runtime tests."""
from pathlib import Path
import json, re, struct, sys
root=Path(__file__).resolve().parents[1]
r=root/'src/main/resources'
errors=[]; count=0
for p in list(r.rglob('*.json'))+list(r.rglob('*.mcmeta')):
    try: json.loads(p.read_text()); count+=1
    except Exception as e: errors.append(f'{p}: {e}')
functions={str(p.relative_to(r/'data/entersift/function')).removesuffix('.mcfunction') for p in (r/'data/entersift/function').rglob('*.mcfunction')}
for p in (r/'data').rglob('*.mcfunction'):
    for ref in re.findall(r'\bfunction entersift:([a-z0-9_/]+)', p.read_text()):
        if ref not in functions: errors.append(f'{p}: unresolved function {ref}')
    for line in p.read_text().splitlines():
        if '$(' in line and not line.startswith('$'): errors.append(f'{p}: macro line missing $')
# A command line must start at a command root. 'positioned ...' or 'as @a ...' is not a command, and the
# whole function silently fails to load, which strands every player inside the rift corridor (0.32 bug).
EXECUTE_SUBCOMMANDS = {'positioned','anchored','as','at','if','unless','store','align','facing','rotated','in','on','run'}
for p in (r/'data').rglob('*.mcfunction'):
    for line in p.read_text().splitlines():
        s = line.strip()
        if not s or s.startswith('#') or s.startswith('$'): continue
        head = s.split(' ', 1)[0]
        if head in EXECUTE_SUBCOMMANDS:
            errors.append(f'{p}: line starts with the execute subcommand "{head}" (missing "execute")')
def asset_refs(value, key=""):
    if isinstance(value, dict):
        for name, child in value.items():
            yield from asset_refs(child, name)
    elif isinstance(value, list):
        for child in value:
            yield from asset_refs(child, key)
    elif isinstance(value, str) and value.startswith("entersift:"):
        yield key, value.split(":", 1)[1]

for p in (r/'assets/entersift').rglob('*.json'):
    if p.name == 'sounds.json': continue
    for key, ref in asset_refs(json.loads(p.read_text())):
        if not re.fullmatch(r'(block|item|entity)/[a-z0-9_/]+', ref): continue
        # A model's parent is another model, NOT a texture. Preserve full subdirectories.
        folder = 'models' if key in ('model', 'parent') or 'models' not in p.parts else 'textures'
        ext = '.png' if folder == 'textures' else '.json'
        if not (r/f'assets/entersift/{folder}/{ref}{ext}').exists(): errors.append(f'{p}: missing {folder} {ref}')
# 0.34: worn equipment. Assets/<ns>/equipment/<id>.json layers sample
# textures/entity/equipment/<layer>/<texture>.png, so a missing sheet means an invisible gauntlet.
for p in (r/'assets/entersift/equipment').rglob('*.json'):
    for layer, entries in (json.loads(p.read_text()).get('layers') or {}).items():
        for entry in entries or []:
            tex = entry.get('texture', '') if isinstance(entry, dict) else ''
            name = tex.split(':', 1)[-1]
            if not name or not (r/f'assets/entersift/textures/entity/equipment/{layer}/{name}.png').exists():
                errors.append(f'{p}: no worn texture for the {layer} layer: {tex!r}')

for p in (r/'assets/entersift/textures').rglob('*.png'):
    b=p.read_bytes()
    if b[:8]!=b'\x89PNG\r\n\x1a\n': errors.append(f'{p}: bad PNG')
    w,h=struct.unpack('!II',b[16:24])
    if h>w and not p.with_suffix('.png.mcmeta').exists(): errors.append(f'{p}: animation metadata missing')
biome_files=list((r/'data/entersift/worldgen/biome').glob('*.json'))
assert len(biome_files)==13, f'expected 13 biome definitions, found {len(biome_files)}'
sift=json.loads((r/'data/entersift/dimension/the_sift.json').read_text())
sift_biomes=sift['generator']['biome_source']['biomes']
assert len(sift_biomes)==12, f'expected 12 Sift biome entries, found {len(sift_biomes)}'
assert {b['biome'] for b in sift_biomes} >= {'entersift:jelly_lands','entersift:singer_meadow','entersift:boneyard'}
assert all((r/f"data/entersift/worldgen/biome/{b['biome'].split(':')[1]}.json").exists() for b in sift_biomes)
dim_type=json.loads((r/'data/entersift/dimension_type/the_sift.json').read_text())
assert dim_type['default_clock']=='entersift:sift'
assert json.loads((r/'data/entersift/timeline/sift_cycle.json').read_text())['clock']=='entersift:sift'
noise=json.loads((r/'data/entersift/worldgen/noise_settings/the_sift.json').read_text())
assert noise['default_fluid']=='minecraft:air'
assert json.loads((r/'data/entersift/worldgen/feature/ichor_lake.json').read_text())['type']=='minecraft:delta_feature'
jelly=json.loads((r/'data/entersift/worldgen/biome/jelly_lands.json').read_text())
assert jelly['attributes']['minecraft:visual/fog_end_distance'] <= 64
assert 'entersift:pink_grass_pale_grove' in jelly['features'][9]
assert '1, 3, 7, 6, 5, 2, 4, 8' in (root/'src/main/java/dev/logan/entersift/RitualSequence.java').read_text()
assert (root/'gradle/wrapper/gradle-wrapper.jar').read_bytes()[:2]==b'PK'
# Validate that custom worldgen block/biome/feature refs resolve locally.
for p in (r/'data/entersift/worldgen/placed_feature').glob('*.json'):
    f=json.loads(p.read_text())['feature']
    if isinstance(f,str) and f.startswith('entersift:') and not (r/f'data/entersift/worldgen/feature/{f.split(":")[1]}.json').exists(): errors.append(f'{p}: missing feature {f}')
if errors: print('\n'.join(errors)); sys.exit(1)

# 26.3 caps offset placement values at 16 per axis (the server refuses to load the pack otherwise).
for _f in (r/'data/entersift/worldgen/feature').glob('*.json'):
    for _e in json.loads(_f.read_text()).get('features', []):
        for _pl in _e.get('placement', []):
            if _pl.get('type') == 'minecraft:offset':
                assert max(abs(_pl['x']), abs(_pl['y']), abs(_pl['z'])) <= 16, f'{_f.name}: offset > 16'
print(f'PASS: {count} JSON/metadata files, {len(functions)} functions, local models/textures, animations, wrapper, and {len(sift_biomes)} Sift biomes.')
print('Minecraft 26.3 compilation, registry codecs, command parsing and in-game behavior still require Gradle/client/server tests.')
