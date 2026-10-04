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
{
for c in net.minecraft.world.effect.MobEffect net.minecraft.world.effect.MobEffectInstance net.minecraft.world.effect.MobEffectCategory \
         net.minecraft.core.Registry net.minecraft.world.entity.LivingEntity; do
  echo "===== $c"; javap -protected -cp "$CP" "$c" 2>&1 | grep -iE "class|MobEffect|register|Holder|Effect\(|getDuration|endsWithin|isInfiniteDuration" | head -80
done
} > $OUT/effect_api.txt
# 0.17: shader includes + end portal shaders + bind group API for a custom rift core shader.
for j in "${JARS[@]}"; do case "$j" in *.jar)
  for f in $(unzip -Z1 "$j" 2>/dev/null | grep -E '^assets/minecraft/shaders/(include/|core/(rendertype_end_portal|rendertype_entity_translucent|rendertype_beacon_beam|position_tex_color))'); do
    echo "===== $f"; unzip -p "$j" "$f"; done;; esac; done > $OUT/shader_includes.txt
{
for c in net.minecraft.client.renderer.BindGroupLayouts 'com.mojang.renderpearl.api.pipeline.RenderPipeline$Builder' com.mojang.renderpearl.api.pipeline.BindGroupLayout; do
  echo "===== $c"; javap -public -cp "$CP" "$c" 2>&1 | head -80
done
javap -c -p -cp "$CP" net.minecraft.client.renderer.RenderPipelines 2>/dev/null | grep -n -B2 -A28 'String core/rendertype_end_portal' | head -60
} > $OUT/bindgroups.txt
# 0.18: real screen-space lensing for rifts: copy the scene colour into a sampled texture mid-frame.
{
for c in net.minecraft.client.renderer.texture.AbstractTexture net.minecraft.client.renderer.texture.DynamicTexture \
         net.minecraft.client.renderer.texture.TextureManager com.mojang.renderpearl.api.device.GpuDevice \
         com.mojang.renderpearl.api.commands.CommandEncoder com.mojang.renderpearl.api.textures.GpuTexture \
         'com.mojang.renderpearl.api.textures.GpuTexture$Usage' com.mojang.renderpearl.api.textures.GpuTextureView \
         com.mojang.renderpearl.api.textures.TextureFormat com.mojang.renderpearl.api.textures.AddressMode com.mojang.renderpearl.api.textures.FilterMode \
         com.mojang.blaze3d.pipeline.RenderTarget com.mojang.blaze3d.pipeline.MainTarget com.mojang.blaze3d.pipeline.TextureTarget \
         com.mojang.blaze3d.systems.RenderSystem com.mojang.blaze3d.systems.SamplerCache \
         'net.minecraft.client.renderer.rendertype.RenderSetup$RenderSetupBuilder' 'net.minecraft.client.renderer.rendertype.RenderSetup$TextureBinding' \
         net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderContext net.fabricmc.fabric.api.client.rendering.v1.level.AbstractLevelRenderContext \
         'net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents$AfterSolidFeatures' 'net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents$AfterOpaqueTerrain' \
         'net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents$StartMain' 'net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents$AfterTranslucentTerrain' \
         net.minecraft.client.renderer.LevelRenderer net.minecraft.client.renderer.feature.FeatureRenderDispatcher; do
  echo "===== $c"; javap -protected -cp "$CP" "$c" 2>&1 | head -160
done
for j in "${JARS[@]}"; do case "$j" in *.jar) unzip -Z1 "$j" 2>/dev/null | grep -iE 'renderpearl/api/textures/|client/renderer/feature/[A-Z]' | sed "s|^|$(basename $j): |";; esac; done | sort -u | head -80
for j in "${JARS[@]}"; do case "$j" in *.jar)
  for f in assets/minecraft/shaders/core/rendertype_end_portal.fsh assets/minecraft/shaders/include/sample_lightmap.glsl; do
    if unzip -Z1 "$j" "$f" >/dev/null 2>&1; then echo "===== $f"; unzip -p "$j" "$f"; fi; done;; esac; done
javap -c -p -cp "$CP" net.minecraft.client.renderer.LevelRenderer 2>/dev/null | grep -nE "invoke.*(Feature|renderTranslucent|Translucent|copyTexture|Sky|Cloud)" | head -80
} > $OUT/lens_api.txt
# 0.18.2: Iris API for making the rift pipelines work under shader packs.
{
IRIS_URL=$(curl -s 'https://api.modrinth.com/v2/project/iris/version?loaders=%5B%22fabric%22%5D&game_versions=%5B%2226.3%22%5D' | python3 -c 'import sys,json; v=json.load(sys.stdin); print(v[0]["files"][0]["url"] if v else "")' 2>/dev/null)
if [ -z "$IRIS_URL" ]; then
  echo "no 26.3 build; latest fabric versions:"
  curl -s 'https://api.modrinth.com/v2/project/iris/version?loaders=%5B%22fabric%22%5D' | python3 -c 'import sys,json; [print(x["version_number"], x["game_versions"][-3:], x["files"][0]["url"]) for x in json.load(sys.stdin)[:6]]'
  IRIS_URL=$(curl -s 'https://api.modrinth.com/v2/project/iris/version?loaders=%5B%22fabric%22%5D' | python3 -c 'import sys,json; print(json.load(sys.stdin)[0]["files"][0]["url"])')
fi
echo "IRIS_URL=$IRIS_URL"
curl -sL "$IRIS_URL" -o /tmp/iris.jar
unzip -Z1 /tmp/iris.jar | grep -E '\.jar$' | head
# Iris nests its implementation jar? list pipeline-related classes.
unzip -Z1 /tmp/iris.jar | grep -iE 'api/v0/|pipeline/(IrisPipelines|ShaderKey|PipelineManager)|RenderPipeline|Pipelines' | head -60
mkdir -p /tmp/irisx && (cd /tmp/irisx && unzip -qo /tmp/iris.jar)
for n in $(ls /tmp/irisx/META-INF/jars/*.jar 2>/dev/null); do (cd /tmp/irisx && unzip -qo "$n"); done
ICP="/tmp/irisx:$CP"
for c in net.irisshaders.iris.api.v0.IrisApi net.irisshaders.iris.api.v0.IrisProgram; do
  echo "===== $c"; javap -cp "$ICP" "$c" 2>&1 | head -80
done
for f in $(cd /tmp/irisx && grep -rlE 'assignPipeline|IrisPipelines' --include=*.class . | head -12); do
  c=$(echo "$f" | sed 's|^\./||; s|\.class$||; s|/|.|g'); echo "===== $c"; javap -p -cp "$ICP" "$c" 2>&1 | head -70
done
# How unassigned pipelines are handled: strings in the pipeline classes.
for f in $(cd /tmp/irisx && grep -rlE 'assignPipeline|IrisPipelines' --include=*.class . | head -12); do
  echo "----- strings $f"; strings -n 8 "/tmp/irisx/$f" | grep -iE 'pipeline|assign|shader|unknown|missing|not ' | head -25
done
cat /tmp/irisx/fabric.mod.json 2>/dev/null | head -40
} > $OUT/iris_api.txt 2>&1
# 0.18.2b: bytecode of Iris' pipeline override decision (what happens to unassigned pipelines).
{
ICP="/tmp/irisx:$CP"
javap -c -p -cp "$ICP" net.irisshaders.iris.pipeline.IrisPipelines 2>&1 | grep -n -A60 'ShaderKey getPipeline(' | head -90
echo "=== FAKE / static tail"; javap -c -p -cp "$ICP" net.irisshaders.iris.pipeline.IrisPipelines 2>&1 | grep -n -B2 -A12 'FAKE_FUNCTION' | head -60
echo "=== Overrides mixin"; javap -c -p -cp "$ICP" net.irisshaders.iris.mixin.MixinShaderManager_Overrides 2>&1 | head -150
echo "=== ShaderOverrides"; javap -p -cp "$ICP" net.irisshaders.iris.pipeline.programs.ShaderOverrides 2>&1 | head -40
} > $OUT/iris_decide.txt 2>&1
# 0.18.2c: tail of redirectIrisProgram (null-program branch).
javap -c -p -cp "/tmp/irisx:$CP" net.irisshaders.iris.mixin.MixinShaderManager_Overrides 2>&1 | sed -n '/redirectIrisProgram/,/^  [a-z].*(/p' | sed -n '150,260p' > $OUT/iris_null.txt 2>&1
# 0.18.2d: does Iris flip depth compare ops for every pipeline?
{ for c in net.irisshaders.iris.mixin.MixinRenderPipeline net.irisshaders.iris.mixin.MixinGlRenderPipeline; do echo "=== $c"; javap -c -p -cp "/tmp/irisx:$CP" $c 2>&1 | head -120; done
  echo "=== reverseZ refs"; cd /tmp/irisx && grep -rl "isReverseZ\|reverseZ\|ReverseZ" --include=*.class . | head -20; } > $OUT/iris_depth.txt 2>&1
cd "${GITHUB_WORKSPACE:-$HOME}/fabric-mod" || true
# 0.22: real destination previews (panorama capture), fluid tint, particle groups, environment attributes.
{
echo "=== grabPanoramixScreenshot bytecode"
javap -c -p -cp "$CP" net.minecraft.client.Minecraft 2>&1 | sed -n '/grabPanoramixScreenshot(java.io.File)/,/^  [a-z].*(/p' | head -220
for c in net.minecraft.client.Screenshot com.mojang.blaze3d.platform.NativeImage net.minecraft.client.renderer.texture.TextureManager \
         net.fabricmc.fabric.api.client.render.fluid.v1.FluidRenderHandler 'net.minecraft.client.renderer.block.FluidModel$Unbaked' \
         net.minecraft.client.particle.Particle net.minecraft.client.particle.ParticleGroup net.minecraft.client.particle.SingleQuadParticle \
         net.minecraft.client.particle.ParticleRenderType net.minecraft.client.particle.ItemPickupParticleGroup net.minecraft.client.particle.ItemPickupParticle \
         net.minecraft.client.particle.ParticleEngine net.fabricmc.fabric.api.client.particle.v1.ParticleGroupRegistry \
         net.fabricmc.fabric.api.client.particle.v1.ParticleProviderRegistry net.minecraft.client.particle.ParticleProvider \
         net.minecraft.world.attribute.EnvironmentAttributes net.minecraft.client.renderer.GameRenderer net.minecraft.client.renderer.LevelRenderer; do
  echo "===== $c"; javap -p -cp "$CP" "$c" 2>&1 | head -120
done
echo "=== ItemPickupParticleGroup bytecode"; javap -c -p -cp "$CP" net.minecraft.client.particle.ItemPickupParticleGroup 2>&1 | head -160
echo "=== ItemPickupParticle bytecode"; javap -c -p -cp "$CP" net.minecraft.client.particle.ItemPickupParticle 2>&1 | head -120
echo "=== smartCull users"; for c in net.minecraft.client.renderer.LevelRenderer net.minecraft.client.renderer.SectionOcclusionGraph; do javap -c -p -cp "$CP" $c 2>&1 | grep -n -B3 -A3 smartCull | head -30; done
echo "=== water fluid model registration"; javap -c -p -cp "$CP" net.minecraft.client.renderer.block.FluidStateModelSet 2>&1 | head -80
javap -c -p -cp "$CP" net.minecraft.client.renderer.block.FluidModel 2>&1 | head -60
unzip -Z1 $(echo "$CP" | tr ':' '\n' | grep -m1 'minecraft-clientOnly') 2>/dev/null | grep -i 'tint\|Fluid' | head -40
} > $OUT/portal_api.txt 2>&1
# 0.22c: tint source, panorama assets, readback, fov.
{
for c in net.minecraft.client.color.block.BlockTintSource net.minecraft.client.color.block.BlockTintSources net.minecraft.client.OptionInstance \
         net.minecraft.client.Camera net.minecraft.client.renderer.state.level.CameraRenderState net.minecraft.server.packs.resources.ResourceManager \
         net.minecraft.server.packs.resources.ResourceProvider net.minecraft.server.packs.resources.Resource com.mojang.blaze3d.pipeline.RenderTarget; do
  echo "===== $c"; javap -p -cp "$CP" "$c" 2>&1 | head -90; done
echo "===== BlockTintSources bytecode"; javap -c -p -cp "$CP" net.minecraft.client.color.block.BlockTintSources 2>&1 | head -120
echo "===== takeScreenshot bytecode"; javap -c -p -cp "$CP" net.minecraft.client.Screenshot 2>&1 | sed -n '/takeScreenshot(com.mojang.blaze3d.pipeline.RenderTarget, int, java.util.function.Consumer/,/^  [a-z].*(/p' | head -120
echo "===== Options fov"; javap -p -cp "$CP" net.minecraft.client.Options 2>&1 | grep -iE "fov|cameraType|hideGui|getCameraType" | head
echo "===== GameRenderer fov"; javap -p -cp "$CP" net.minecraft.client.renderer.GameRenderer 2>&1 | grep -iE "fov|projection" | head
echo "===== panorama assets"; unzip -Z1 $(echo "$CP" | tr ':' '\n' | grep -m1 'minecraft-clientOnly') 2>/dev/null | grep -iE 'panorama|title/background' | head -20
} > $OUT/tint_capture.txt 2>&1
# 0.22b: particle group render state contract (custom-rendered particle group).
cd "$(dirname "$0")/../.." 2>/dev/null || true
{
for c in net.minecraft.client.renderer.state.level.ParticleGroupRenderState 'net.minecraft.client.particle.ItemPickupParticleGroup$State' \
         'net.minecraft.client.particle.ItemPickupParticleGroup$ParticleInstance' net.minecraft.client.renderer.state.level.ParticlesRenderState \
         'net.minecraft.client.particle.ElderGuardianParticleGroup$State' net.fabricmc.fabric.api.particle.v1.FabricParticleTypes; do
  echo "===== $c"; javap -p -cp "$CP" "$c" 2>&1 | head -60
done
echo "=== ItemPickupParticleGroup\$State bytecode"; javap -c -p -cp "$CP" 'net.minecraft.client.particle.ItemPickupParticleGroup$State' 2>&1 | head -120
echo "=== ParticlesRenderState bytecode"; javap -c -p -cp "$CP" net.minecraft.client.renderer.state.level.ParticlesRenderState 2>&1 | head -120
} > build/probe/particles.txt 2>&1
# 0.22d: destination snapshot (worldgen columns + map colours), biome tint getter, particle render state.
cd "${GITHUB_WORKSPACE:-$HOME}/fabric-mod" 2>/dev/null || true
{
for c in net.minecraft.world.level.chunk.ChunkGenerator net.minecraft.world.level.NoiseColumn net.minecraft.server.level.ServerChunkCache \
         net.minecraft.world.level.material.MapColor net.minecraft.world.level.EmptyBlockGetter 'net.minecraft.world.level.levelgen.Heightmap$Types' \
         'net.minecraft.world.level.block.state.BlockBehaviour$BlockStateBase' net.minecraft.client.renderer.block.BlockAndTintGetter \
         net.minecraft.client.renderer.BiomeColors net.minecraft.world.level.ColorResolver net.minecraft.server.MinecraftServer \
         net.minecraft.client.renderer.state.level.ParticleGroupRenderState net.minecraft.client.renderer.state.level.ParticlesRenderState \
         'net.minecraft.client.particle.ItemPickupParticleGroup$State' net.fabricmc.fabric.api.particle.v1.FabricParticleTypes \
         net.minecraft.core.particles.SimpleParticleType net.minecraft.core.particles.ParticleType net.minecraft.client.particle.Particle \
         net.fabricmc.fabric.api.client.particle.v1.ParticleProviderRegistry net.minecraft.client.particle.ParticleProvider \
         'net.fabricmc.fabric.api.client.particle.v1.ParticleProviderRegistry$PendingParticleFactory' net.minecraft.world.level.levelgen.RandomState; do
  echo "===== $c"; javap -protected -cp "$CP" "$c" 2>&1 | head -140
done
echo "=== ItemPickupParticleGroup\$State bytecode"; javap -c -p -cp "$CP" 'net.minecraft.client.particle.ItemPickupParticleGroup$State' 2>&1 | head -140
} > build/probe/snapshot_api.txt 2>&1
# 0.23: locate 26.3's relocated multiplayer-connect classes (ConnectScreen moved out of client.multiplayer).
{
CJ=$(echo "$CP" | tr ':' '\n' | grep -m1 'minecraft-clientOnly')
echo "== jar: $CJ"
unzip -Z1 "$CJ" 2>/dev/null | grep -iE 'connect|serveraddress|serverinfo|serverlist|multiplayer' | grep '\.class$' | grep -v '\$' | head -80
echo "== client/multiplayer package =="
unzip -Z1 "$CJ" 2>/dev/null | grep -E '^net/minecraft/client/multiplayer/[A-Z]' | grep '\.class$' | grep -v '\$' | head -80
} > $OUT/join_api.txt
