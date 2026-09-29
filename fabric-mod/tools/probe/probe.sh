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
# 0.13: vanilla worldgen data (density functions / noise settings) for the Sift terrain rework.
for j in "${JARS[@]}"; do case "$j" in *.jar) unzip -Z1 "$j" 2>/dev/null | grep -E '^data/minecraft/worldgen/(density_function|noise_settings|noise)/' | sed "s|^|$(basename $j): |";; esac; done | sort -u > $OUT/worldgen_files.txt
for j in "${JARS[@]}"; do case "$j" in *.jar)
  for f in noise_settings/amplified.json noise_settings/large_biomes.json density_function/overworld_amplified/final_density.json density_function/overworld/final_density.json; do
    if unzip -Z1 "$j" "data/minecraft/worldgen/$f" >/dev/null 2>&1; then echo "===== $f"; unzip -p "$j" "data/minecraft/worldgen/$f" | head -c 6000; echo; fi
  done;; esac; done > $OUT/worldgen_samples.txt
for j in "${JARS[@]}"; do case "$j" in *.jar) unzip -Z1 "$j" 2>/dev/null | grep -E '^data/minecraft/worldgen/(feature|configured_carver|structure|template_pool|structure_set)/' | sed "s|^|$(basename $j): |";; esac; done | sort -u | head -900 > $OUT/worldgen_features.txt
# 0.13b: exact 26.3 formats of ore / lake / spring / basalt features + their placed features.
for j in "${JARS[@]}"; do case "$j" in *.jar)
  for f in feature/ore_iron.json feature/lake_lava.json feature/spring_lava_overworld.json feature/basalt_pillar.json feature/delta.json placed_feature/ore_iron_middle.json placed_feature/lake_lava_surface.json placed_feature/spring_lava.json; do
    if unzip -Z1 "$j" "data/minecraft/worldgen/$f" >/dev/null 2>&1; then echo "===== $f"; unzip -p "$j" "data/minecraft/worldgen/$f"; echo; fi
  done;; esac; done > $OUT/feature_samples.txt
# 0.13c: 26.3 material rule syntax (y / steep / stone depth conditions) + Fluid.animateTick signature.
for j in "${JARS[@]}"; do case "$j" in *.jar)
  for f in material_rule/overworld.json; do
    if unzip -Z1 "$j" "data/minecraft/worldgen/$f" >/dev/null 2>&1; then echo "===== $f"; unzip -p "$j" "data/minecraft/worldgen/$f" | head -c 20000; echo; fi
  done
  unzip -Z1 "$j" 2>/dev/null | grep -E '^data/minecraft/worldgen/material_(rule|condition)/' ;;
  esac; done > $OUT/material_samples.txt
javap -protected -cp "$CP" net.minecraft.world.level.material.Fluid 2>&1 | grep -iE "animateTick|getDripParticle" >> $OUT/material_samples.txt
javap -protected -cp "$CP" net.minecraft.world.level.material.LavaFluid 2>&1 | grep -iE "animateTick" >> $OUT/material_samples.txt
# 0.16: HUD / GUI drawing / screen events for the rift transition overlay.
{
for c in net.minecraft.client.gui.GuiGraphicsExtractor net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry \
         net.fabricmc.fabric.api.client.rendering.v1.hud.HudElement net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements \
         net.fabricmc.fabric.api.client.screen.v1.ScreenEvents 'net.fabricmc.fabric.api.client.screen.v1.ScreenEvents$AfterRender' \
         'net.fabricmc.fabric.api.client.screen.v1.ScreenEvents$AfterExtract' 'net.fabricmc.fabric.api.client.screen.v1.ScreenEvents$AfterInit' \
         net.minecraft.client.gui.screens.LevelLoadingScreen net.minecraft.client.DeltaTracker net.minecraft.client.renderer.RenderPipelines \
         net.minecraft.client.gui.screens.Screen net.minecraft.client.Minecraft net.minecraft.client.renderer.GameRenderer; do
  echo "===== $c"; javap -public -cp "$CP" "$c" 2>&1 | head -150
done
} > $OUT/hud_api.txt
