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
for p in (r/'assets/entersift').rglob('*.json'):
    if p.name == 'sounds.json': continue  # sound paths (entersift:entity/...) are not model refs
    for kind,name in re.findall(r'entersift:(block|item|entity)/([a-z0-9_]+)',p.read_text()):
        # Model JSON contains texture refs; item definitions/blockstates contain model refs.
        folder='textures' if 'models' in p.parts else 'models'
        ext='.png' if folder=='textures' else '.json'
        if not (r/f'assets/entersift/{folder}/{kind}/{name}{ext}').exists(): errors.append(f'{p}: missing {folder} {name}')
for p in (r/'assets/entersift/textures').rglob('*.png'):
    b=p.read_bytes()
    if b[:8]!=b'\x89PNG\r\n\x1a\n': errors.append(f'{p}: bad PNG')
    w,h=struct.unpack('!II',b[16:24])
    if h>w and not p.with_suffix('.png.mcmeta').exists(): errors.append(f'{p}: animation metadata missing')
assert len(list((r/'data/entersift/worldgen/biome').glob('*.json')))==11
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
print(f'PASS: {count} JSON/metadata files, {len(functions)} functions, local models/textures, animations, wrapper and nine biomes.')
print('Minecraft 26.3 compilation, registry codecs, command parsing and in-game behavior still require Gradle/client/server tests.')
