#!/usr/bin/env bash
# CI-only API probe: dumps signatures of the real 26.3 / Fabric classes. Lines may start with "-protected ".
set -u
cd "$(dirname "$0")/../.."
./gradlew --no-daemon -q printProbeClasspath > /dev/null
CP=$(cat build/probe-classpath.txt)
OUT=build/probe; mkdir -p $OUT
while read -r a b; do [ -z "$a" ] && continue; if [ "$a" = "-protected" ]; then f=-protected; c=$b; else f=-public; c=$a; fi
  echo "===== $c"; javap $f -cp "$CP" "$c" 2>&1 | head -700; done < tools/probe/classes.txt > $OUT/signatures.txt
IFS=':' read -ra JARS <<< "$CP"
for j in "${JARS[@]}"; do case "$j" in *.jar) unzip -Z1 "$j" 2>/dev/null | grep '\.class$' | grep -E "$(cat tools/probe/patterns.txt)" | sed "s|^|$(basename $j): |";; esac; done | grep -v '\$[0-9]' | sort -u > $OUT/classlist.txt
# Asset listing from the client jar (vanilla texture paths for reference only; no assets are copied).
for j in "${JARS[@]}"; do case "$j" in *clientOnly*|*client*26.3*) unzip -Z1 "$j" 2>/dev/null | grep -E '^assets/minecraft/(textures/entity/warden|shaders/core|textures/environment)' ;; esac; done | sort -u > $OUT/assets.txt
wc -l $OUT/*
# 0.9: exact pipeline flags (depth test / blend / shader) for fog-free sky geometry, plus core shader sources.
javap -c -p -cp "$CP" net.minecraft.client.renderer.RenderPipelines 2>&1 | grep -n -E "DEBUG_QUADS|LIGHTNING|withDepthTestFunction|withBlend|withLocation|withVertexShader|withFragmentShader|withDepthWrite|withCull|putstatic" | head -400 > $OUT/pipelines.txt
for j in "${JARS[@]}"; do case "$j" in *clientOnly*|*client*26.3*)
  for s in position_color.fsh position_color.vsh rendertype_lightning.fsh rendertype_lightning.vsh; do
    echo "===== $s"; unzip -p "$j" "assets/minecraft/shaders/core/$s" 2>/dev/null; done ;; esac; done > $OUT/shaders.txt
# 0.11: full bytecode of the vanilla pipeline + render type definitions (to build an opaque, fog-free sky pipeline).
javap -c -p -cp "$CP" net.minecraft.client.renderer.RenderPipelines > $OUT/pipelines_full.txt 2>&1
javap -c -p -cp "$CP" net.minecraft.client.renderer.rendertype.RenderTypes > $OUT/rendertypes_full.txt 2>&1
javap -protected -cp "$CP" net.minecraft.world.entity.LivingEntity 2>&1 | grep -iE "sound|playHurt" > $OUT/living_sounds.txt
javap -protected -cp "$CP" net.minecraft.world.entity.Mob 2>&1 | grep -iE "sound" >> $OUT/living_sounds.txt
