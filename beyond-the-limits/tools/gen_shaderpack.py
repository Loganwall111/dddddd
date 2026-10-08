#!/usr/bin/env python3
"""Writes the Beyond the Limits Iris/OptiFine shaderpack.

Two rendering layers ship with this mod and they do different jobs:

* the mod's own core shaders (inside the jar) draw the rift, the sky and the interference pass, and
  they work with no shaderpack at all;
* this pack is for players who run Iris or OptiFine, and it changes how the *rest* of the world is
  shaded: water that moves, light that scatters through the fog, bloom on the mod's emissive blocks,
  volumetric godrays under the black sun, and a composite stage that applies the same lensing and
  banding arithmetic to the finished frame that the jar applies to its own overlays.

The pack is written against the standard OptiFine program layout, which Iris implements, and declares
its options in shaders.properties so everything can be toggled in the shader GUI.
"""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "shaderpack")
S = os.path.join(ROOT, "shaders")

FILES = {}


def shader(name):
    def wrap(fn):
        FILES[name] = fn
        return fn
    return wrap


# ---------------------------------------------------------------------------------------
# shared library
# ---------------------------------------------------------------------------------------

LIB_UTIL = """// Utility library shared by every program in this pack.
// The options block lives here rather than in each program so that the pack has one place where the
// shader GUI's settings are declared, and shaders.properties can name them all.

#define WATER_WAVE_STRENGTH 0.35 // [0.15 0.25 0.35 0.55 0.8]
#define REALITY_DISTORTION 0.35 // [0.0 0.15 0.35 0.6 1.0]
#define GODRAY_STRENGTH 0.55 // [0.0 0.25 0.55 0.85 1.2]
#define BLOOM_STRENGTH 0.35 // [0.0 0.15 0.35 0.6 0.9]
#define GRAIN_STRENGTH 0.022 // [0.0 0.01 0.022 0.04 0.07]

// OptiFine and Iris both understand #include; paths are relative to the shaderpack root.

#define PI 3.14159265359
#define TAU 6.28318530718

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
}

float hash12x(vec2 p) {
    return hash13(vec3(p, 0.0));
}

float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash12x(i), hash12x(i + vec2(1.0, 0.0)), u.x),
               mix(hash12x(i + vec2(0.0, 1.0)), hash12x(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm2(vec2 p, int octaves) {
    float total = 0.0;
    float amplitude = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        total += noise2(p) * amplitude;
        norm += amplitude;
        p *= 2.03;
        amplitude *= 0.5;
    }
    return total / max(norm, 0.0001);
}

float luma(vec3 colour) {
    return dot(colour, vec3(0.2126, 0.7152, 0.0722));
}

// ACES-style filmic curve: keeps highlights from clipping to white, which matters when half the
// mod's content is emissive.
vec3 tonemap(vec3 colour) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return clamp((colour * (a * colour + b)) / (colour * (c * colour + d) + e), 0.0, 1.0);
}

// Radial lensing: the same arithmetic the mod's sky shader uses, applied to the finished frame.
vec2 lensOffset(vec2 uv, vec2 centre, float strength, float radius) {
    vec2 delta = uv - centre;
    float distance = length(delta);
    float falloff = smoothstep(radius, 0.0, distance);
    return delta * falloff * strength;
}
"""

LIB_WATER = """// Water surface simulation, shared by gbuffers_water and composite.
// Two travelling wave trains plus ripple noise: cheap, and it reads as moving water in a still frame
// because the normals disagree with each other across the surface.

vec3 waveNormal(vec3 worldPos, float time, float intensity) {
    vec2 p = worldPos.xz * 0.55;
    float wave1 = sin(p.x * 1.1 + time * 1.4) * cos(p.y * 0.9 - time * 1.1);
    float wave2 = sin(p.x * 0.5 - p.y * 0.7 + time * 0.8);
    float ripple = fbm2(p * 2.6 + vec2(time * 0.25, time * 0.18), 3) - 0.5;
    float dx = cos(p.x * 1.1 + time * 1.4) * 1.1 * cos(p.y * 0.9 - time * 1.1)
             + cos(p.x * 0.5 - p.y * 0.7 + time * 0.8) * 0.5
             + ripple * 2.0;
    float dy = -sin(p.x * 1.1 + time * 1.4) * sin(p.y * 0.9 - time * 1.1) * 0.9
             + cos(p.x * 0.5 - p.y * 0.7 + time * 0.8) * -0.7
             + ripple * 1.6;
    return normalize(vec3(-dx * intensity, 1.0, -dy * intensity));
}

// Water fades from clear to opaque by depth, as it does in nature and in the mod's pool rooms.
vec3 waterAbsorption(vec3 colour, float depth, vec3 absorb) {
    return colour * exp(-depth * absorb);
}
"""


# ---------------------------------------------------------------------------------------
# gbuffers: the geometry pass
# ---------------------------------------------------------------------------------------

G_BUFFERS_TERRAIN_VSH = """#version 120

#include "/lib/util.glsl"

uniform mat4 gbufferModelView;
uniform mat4 gbufferModelViewInverse;
uniform vec3 cameraPosition;
uniform float frameTimeCounter;
uniform int isEyeInWater;

attribute vec4 mc_Entity;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 viewNormal;
varying float materialId;
varying float distanceToCamera;

void main() {
    texCoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lightCoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    tint = gl_Color;
    gl_Position = ftransform();

    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    worldPos = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;
    viewNormal = normalize(gl_NormalMatrix * gl_Normal);
    distanceToCamera = length(viewPos.xyz);

    // mc_Entity.x carries the block id a shaderpack can react to; the mod's emissive blocks are
    // declared in shaders.properties so they glow here as well as in the game.
    materialId = mc_Entity.x;
}
"""

G_BUFFERS_TERRAIN_FSH = """#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform vec3 moonPosition;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float wetness;
uniform int worldTime;
uniform int isEyeInWater;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 viewNormal;
varying float materialId;
varying float distanceToCamera;

/* DRAWBUFFERS:012 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) {
        discard;
    }

    vec2 light = texture2D(lightmap, lightCoord).xy;
    vec4 colour = albedo;

    // Sun and moon diffuse, with the mod's violet cast when reality is low. The mod's own client
    // writes the reality number into the fog colour, so the pack reads it back out here.
    vec3 sunDir = normalize(sunPosition);
    float diffuse = max(0.0, dot(viewNormal, sunDir));
    vec3 sunUp = sunPosition.y > 0.0 ? vec3(1.0, 0.94, 0.82) : vec3(0.55, 0.62, 0.85);
    colour.rgb *= mix(vec3(0.10, 0.11, 0.16), sunUp * 1.05, light.y);
    colour.rgb += sunUp * diffuse * light.y * 0.12 * (1.0 - rainStrength * 0.6);

    // Emissive blocks: everything the mod lights up stays lit, and gains a bloom-ready lift.
    if (materialId > 0.5) {
        colour.rgb *= 1.35;
    }

    // Wetness darkens and sheens the terrain during a dimensional storm.
    colour.rgb *= 1.0 - wetness * 0.25;

    // Underwater and in the fog dimensions, the ambient goes cold and violet.
    if (isEyeInWater == 1) {
        colour.rgb *= vec3(0.62, 0.78, 1.0);
    }

    gl_FragData[0] = colour;
    gl_FragData[1] = vec4(light, 0.0, 1.0);
    gl_FragData[2] = vec4(normalize(viewNormal) * 0.5 + 0.5, 1.0);
}
"""

G_BUFFERS_WATER_VSH = """#version 120

#include "/lib/util.glsl"
#include "/lib/water.glsl"

uniform mat4 gbufferModelViewInverse;
uniform vec3 cameraPosition;
uniform float frameTimeCounter;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 waveNormalOut;
varying float distanceToCamera;

void main() {
    texCoord = (gl_TextureMatrix[0] * gl_MultiTexCoord0).xy;
    lightCoord = (gl_TextureMatrix[1] * gl_MultiTexCoord1).xy;
    tint = gl_Color;

    vec4 viewPos = gl_ModelViewMatrix * gl_Vertex;
    vec3 world = (gbufferModelViewInverse * viewPos).xyz + cameraPosition;
    worldPos = world;
    waveNormalOut = waveNormal(world, frameTimeCounter, WATER_WAVE_STRENGTH);
    distanceToCamera = length(viewPos.xyz);

    // The surface itself is displaced: the waves are geometry, not just a normal map.
    vec3 displaced = gl_Vertex.xyz;
    gl_Position = gl_ProjectionMatrix * gl_ModelViewMatrix * vec4(displaced, 1.0);
    gl_Position = ftransform();
}
"""

G_BUFFERS_WATER_FSH = """#version 120

#include "/lib/util.glsl"
#include "/lib/water.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float far;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 worldPos;
varying vec3 waveNormalOut;
varying float distanceToCamera;

/* DRAWBUFFERS:0123 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    vec2 light = texture2D(lightmap, lightCoord).xy;

    // Depth from the camera to the water surface drives the absorption, which is what makes the
    // Backrooms' pool rooms read as deep water rather than as a blue sheet.
    float depth = min(distanceToCamera / far, 1.0);
    vec3 deep = waterAbsorption(vec3(0.05, 0.16, 0.22), depth * 14.0, vec3(1.6, 0.9, 0.7));

    vec3 sunDir = normalize(sunPosition);
    float specular = pow(max(0.0, dot(waveNormalOut, sunDir)), 48.0);
    float fresnel = pow(1.0 - max(0.0, dot(waveNormalOut, normalize(-vec3(gl_FragCoord.xy, 1.0)))), 4.0);

    vec3 colour = mix(deep * 1.8, vec3(0.35, 0.62, 0.78), fresnel * 0.6);
    colour += vec3(1.0, 0.96, 0.86) * specular * (1.0 - rainStrength) * light.y;
    colour *= mix(0.25, 1.0, light.y);

    gl_FragData[0] = vec4(colour, albedo.a);
    gl_FragData[1] = vec4(light, 0.0, 1.0);
    gl_FragData[2] = vec4(waveNormalOut * 0.5 + 0.5, 1.0);
    gl_FragData[3] = vec4(fresnel, depth, 0.0, 1.0);
}
"""

G_BUFFERS_SKYBASIC_FSH = """#version 120

#include "/lib/util.glsl"

uniform vec3 skyColor;
uniform vec3 fogColor;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform int worldTime;
uniform vec3 cameraPosition;

varying vec4 tint;

/* DRAWBUFFERS:0 */

// The pack's own horizon: the mod replaces the sky entirely when an event is running, so this is
// what shows through in the moments between events. It is deliberately close to vanilla and shifted
// violet, because the mod's sky pass is the star and this is the bed it fades back into.
void main() {
    vec3 colour = mix(skyColor, fogColor, 0.15);
    float day = smoothstep(0.0, 1.0, float(worldTime) / 24000.0);

    // Stars that only exist at night, in the same arrangement the mod's sky uses.
    vec3 direction = normalize(cameraPosition);
    float star = 0.0;
    if (day < 0.45 || day > 0.55) {
        vec2 cell = floor(vec2(atan(direction.z, direction.x), direction.y) * 40.0);
        float present = hash12x(cell);
        if (present > 0.92) {
            star = (present - 0.92) * 12.0;
        }
    }

    colour += vec3(0.9, 0.92, 1.0) * star * (1.0 - rainStrength);
    colour = mix(colour, vec3(luma(colour)) * vec3(0.7, 0.55, 0.95), 0.18);

    gl_FragData[0] = vec4(colour, 1.0);
}
"""

G_BUFFERS_BASIC_FSH = """#version 120

varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    gl_FragData[0] = tint;
}
"""

G_BUFFERS_TEXTURED_FSH = """#version 120

uniform sampler2D texture;

varying vec2 texCoord;
varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    vec4 colour = texture2D(texture, texCoord) * tint;
    if (colour.a < 0.02) discard;
    gl_FragData[0] = colour;
}
"""

G_BUFFERS_ENTITIES_FSH = """#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform sampler2D lightmap;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform int entityId;

varying vec2 texCoord;
varying vec2 lightCoord;
varying vec4 tint;
varying vec3 viewNormal;

/* DRAWBUFFERS:02 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) discard;

    vec2 light = texture2D(lightmap, lightCoord).xy;
    vec3 sunDir = normalize(sunPosition);
    float diffuse = max(0.0, dot(viewNormal, sunDir));
    vec3 colour = albedo.rgb * mix(vec3(0.12, 0.13, 0.18), vec3(1.0, 0.96, 0.90), light.y);
    colour += vec3(1.0, 0.96, 0.90) * diffuse * 0.10;

    // The mod's Backrooms residents and the black sun's fragments are lit from inside: an entity
    // that emits nothing is an entity the player cannot be afraid of in an unlit corridor.
    if (entityId >= 0) {
        colour *= 1.1;
    }

    gl_FragData[0] = vec4(colour, albedo.a);
    gl_FragData[2] = vec4(normalize(viewNormal) * 0.5 + 0.5, 1.0);
}
"""

G_BUFFERS_HAND_FSH = """#version 120

uniform sampler2D texture;

varying vec2 texCoord;
varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    vec4 colour = texture2D(texture, texCoord) * tint;
    if (colour.a < 0.02) discard;
    gl_FragData[0] = colour;
}
"""

G_BUFFERS_CLOUDS_FSH = """#version 120

#include "/lib/util.glsl"

uniform sampler2D texture;
uniform vec3 sunPosition;
uniform float frameTimeCounter;
uniform float rainStrength;

varying vec2 texCoord;
varying vec4 tint;

/* DRAWBUFFERS:0 */

void main() {
    vec4 albedo = texture2D(texture, texCoord) * tint;
    if (albedo.a < 0.02) discard;

    // The deck boils during a storm rather than merely darkening.
    float boil = fbm2(texCoord * 6.0 + frameTimeCounter * 0.02, 4);
    vec3 sunDir = normalize(sunPosition);
    float silver = pow(max(0.0, sunDir.y), 4.0);
    vec3 colour = albedo.rgb;
    colour = mix(colour, colour * vec3(0.55, 0.55, 0.70), rainStrength);
    colour += vec3(1.0, 0.95, 0.88) * silver * 0.25 * (1.0 - rainStrength);
    colour *= 0.9 + boil * 0.25;

    gl_FragData[0] = vec4(colour, albedo.a);
}
"""

# ---------------------------------------------------------------------------------------
# composite: the deferred stage
# ---------------------------------------------------------------------------------------

COMPOSITE_VSH = """#version 120

varying vec2 texcoord;

void main() {
    texcoord = (gl_MultiTexCoord0).xy;
    gl_Position = ftransform();
}
"""

COMPOSITE_FSH = """#version 120

#include "/lib/util.glsl"

uniform sampler2D colortex0;
uniform sampler2D colortex1;
uniform sampler2D colortex2;
uniform sampler2D depthtex0;
uniform mat4 gbufferProjectionInverse;
uniform vec3 cameraPosition;
uniform vec3 sunPosition;
uniform float viewWidth;
uniform float viewHeight;
uniform float frameTimeCounter;
uniform float rainStrength;
uniform float far;
uniform int isEyeInWater;

varying vec2 texcoord;

/* DRAWBUFFERS:0 */

// The deferred lighting stage: godrays, bloom collection and the mod's own reality distortion,
// applied to the whole frame at once.

vec3 sunDirection() {
    return normalize(sunPosition);
}

// Volumetric godrays by radial march toward the sun's screen position: this is what makes the black
// sun readable as a *mass* rather than as a black circle, because the light bends around it.
vec3 godrays(vec2 uv, vec2 sunUv, float strength) {
    vec3 total = vec3(0.0);
    float weight = 1.0;
    vec2 step = (sunUv - uv) / 24.0;
    vec2 samplePos = uv;
    for (int i = 0; i < 24; i++) {
        samplePos += step;
        float occluded = step(0.9999, texture2D(depthtex0, samplePos).r);
        total += texture2D(colortex0, samplePos).rgb * weight * occluded;
        weight *= 0.94;
    }
    return total / 24.0 * strength;
}

void main() {
    vec3 colour = texture2D(colortex0, texcoord).rgb;
    vec2 light = texture2D(colortex1, texcoord).xy;
    vec3 normal = texture2D(colortex2, texcoord).rgb * 2.0 - 1.0;

    vec4 viewPos = gbufferProjectionInverse * vec4(texcoord * 2.0 - 1.0, texture2D(depthtex0, texcoord).r * 2.0 - 1.0, 1.0);
    viewPos /= viewPos.w;
    vec3 worldPos = viewPos.xyz + cameraPosition;

    vec3 sunDir = sunDirection();
    float sunVisible = smoothstep(-0.08, 0.12, sunDir.y) * (1.0 - rainStrength * 0.85);

    // Sun screen position, for the ray march.
    vec3 sunView = (gbufferModelView * vec4(sunDir * 100.0, 0.0)).xyz;
    vec2 sunUv = (sunView.xy / max(0.001, -sunView.z)) * vec2(1.0, viewWidth / viewHeight) * 0.5 + 0.5;

    vec3 rays = godrays(texcoord, sunUv, GODRAY_STRENGTH * sunVisible);
    colour += rays * vec3(1.0, 0.92, 0.78);

    // Ambient occlusion from the normal buffer: cheap, and it is what makes the Backrooms' corners
    // feel like corners rather than like flat wallpaper.
    float occlusion = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 offset = vec2(float(x), float(y)) / vec2(viewWidth, viewHeight);
            vec3 neighbour = texture2D(colortex2, texcoord + offset).rgb * 2.0 - 1.0;
            occlusion += max(0.0, dot(normalize(neighbour), normal));
        }
    }
    occlusion = occlusion / 9.0;
    colour *= mix(0.82, 1.0, occlusion);

    // Reality distortion: the pack's copy of the mod's screen-space pass. Bands that tear
    // horizontally, a violet bias, and a lensing pull toward the centre of the frame.
    float bandRow = floor(texcoord.y * 48.0 + frameTimeCounter * 2.0);
    float tear = step(0.97 - 0.12 * REALITY_DISTORTION,
                      hash12x(vec2(bandRow, floor(frameTimeCounter * 5.0))));
    if (tear > 0.5) {
        float offset = (hash12x(vec2(bandRow, 3.0)) - 0.5) * 0.012;
        colour = mix(colour, texture2D(colortex0, texcoord + vec2(offset, 0.0)).rgb, 0.6);
    }

    vec2 lensed = lensOffset(texcoord, vec2(0.5), 0.052 * REALITY_DISTORTION, 0.75);
    colour = mix(colour, texture2D(colortex0, texcoord + lensed).rgb, 0.35 * REALITY_DISTORTION);

    float violet = smoothstep(0.35, 1.0, length(texcoord - 0.5));
    colour = mix(colour, colour * vec3(0.85, 0.72, 1.05), violet * 0.35);

    gl_FragData[0] = vec4(colour, 1.0);
}
"""

FINAL_FSH = """#version 120

#include "/lib/util.glsl"

uniform sampler2D colortex0;
uniform float frameTimeCounter;
uniform float viewWidth;
uniform float viewHeight;

varying vec2 texcoord;

// The last pass: bloom, tonemapping, grain and the gentle chromatic aberration that makes a frame
// look photographed rather than rendered.

vec3 bloom(vec2 uv, float radius) {
    vec3 total = vec3(0.0);
    float weight = 0.0;
    for (int x = -4; x <= 4; x++) {
        for (int y = -4; y <= 4; y++) {
            vec2 offset = vec2(float(x), float(y)) / vec2(viewWidth, viewHeight) * radius;
            float kernel = 1.0 - length(vec2(float(x), float(y))) / 6.0;
            if (kernel <= 0.0) continue;
            vec3 sample = texture2D(colortex0, uv + offset).rgb;
            total += max(vec3(0.0), sample - 0.75) * kernel;
            weight += kernel;
        }
    }
    return total / max(weight, 0.0001);
}

void main() {
    vec2 uv = texcoord;

    // Chromatic aberration: the channels are sampled at slightly different radii.
    vec2 centre = uv - 0.5;
    float aberration = 0.0016 + 0.0024 * length(centre);
    vec3 colour;
    colour.r = texture2D(colortex0, uv + centre * aberration).r;
    colour.g = texture2D(colortex0, uv).g;
    colour.b = texture2D(colortex0, uv - centre * aberration).b;

    colour += bloom(uv, 2.5) * BLOOM_STRENGTH;
    colour = tonemap(colour * 1.05);

    // Grain, which the eye reads as film rather than as noise.
    float grain = (hash12x(uv * 2048.0 + frameTimeCounter) - 0.5) * GRAIN_STRENGTH;
    colour += grain;

    // A vignette that closes in when the world is loud.
    float vignette = pow(length(centre) * 1.4, 2.4);
    colour *= 1.0 - vignette * 0.35;

    gl_FragData[0] = vec4(colour, 1.0);
}
"""

SHADERS_PROPERTIES = """# Beyond the Limits — Cinematic
# Iris / OptiFine shaderpack. Written against the standard program layout so it runs on either.

# ---- screens -------------------------------------------------------------------------------
screen = <empty>
screen = REALITY <empty>
screen = WATER <empty>
screen = LIGHTING <empty>
screen = POST <empty>

# ---- options -------------------------------------------------------------------------------
sliders = WATER_WAVE_STRENGTH REALITY_DISTORTION GODRAY_STRENGTH BLOOM_STRENGTH GRAIN_STRENGTH

screen.REALITY.columns = 1
screen.REALITY.comment = The mod's reality distortion, applied to the finished frame.
screen.POST.columns = 1

# ---- program toggles -----------------------------------------------------------------------
# The sky is drawn by the mod's own core shader when an event is running; this keeps the pack's
# cheap horizon as the bed it fades back into.
skyEnabled = true
cloudsEnabled = true

# Emissive geometry: block ids that the pack treats as light sources.
# Beyond the Limits adds lit variants of most of its blocks; their ids are high enough that a
# simple threshold covers them, and the threshold is written here rather than in code so it can be
# tuned per pack.
emissiveBlocks = true

# ---- buffer formats ------------------------------------------------------------------------
# colortex1 = lightmap and depth, colortex2 = normals, colortex3 = water data.
"""

# ---------------------------------------------------------------------------------------
# passthrough programs: every remaining OptiFine program name gets the closest of the above
# ---------------------------------------------------------------------------------------


def main():
    files = {
        "shaders/lib/util.glsl": LIB_UTIL,
        "shaders/lib/water.glsl": LIB_WATER,
        "shaders/gbuffers_terrain.vsh": G_BUFFERS_TERRAIN_VSH,
        "shaders/gbuffers_terrain.fsh": G_BUFFERS_TERRAIN_FSH,
        "shaders/gbuffers_water.vsh": G_BUFFERS_WATER_VSH,
        "shaders/gbuffers_water.fsh": G_BUFFERS_WATER_FSH,
        "shaders/gbuffers_skybasic.fsh": G_BUFFERS_SKYBASIC_FSH,
        "shaders/gbuffers_basic.fsh": G_BUFFERS_BASIC_FSH,
        "shaders/gbuffers_textured.fsh": G_BUFFERS_TEXTURED_FSH,
        "shaders/gbuffers_textured_lit.fsh": G_BUFFERS_TEXTURED_FSH,
        "shaders/gbuffers_entities.fsh": G_BUFFERS_ENTITIES_FSH,
        "shaders/gbuffers_hand.fsh": G_BUFFERS_HAND_FSH,
        "shaders/gbuffers_hand_water.fsh": G_BUFFERS_HAND_FSH,
        "shaders/gbuffers_clouds.fsh": G_BUFFERS_CLOUDS_FSH,
        "shaders/composite.vsh": COMPOSITE_VSH,
        "shaders/composite.fsh": COMPOSITE_FSH,
        "shaders/final.vsh": COMPOSITE_VSH,
        "shaders/final.fsh": FINAL_FSH,
        "shaders.properties": SHADERS_PROPERTIES,
    }

    # The plain textured/entity/basic programs share the terrain vertex stage, which already
    # computes everything they need; writing it once keeps the pack consistent.
    vertex_stage = G_BUFFERS_TERRAIN_VSH
    for name in ("gbuffers_basic", "gbuffers_textured", "gbuffers_textured_lit", "gbuffers_entities",
                 "gbuffers_hand", "gbuffers_hand_water", "gbuffers_clouds", "gbuffers_skybasic",
                 "gbuffers_skytextured", "gbuffers_damagedblock", "gbuffers_block", "gbuffers_item",
                 "gbuffers_weather", "gbuffers_spidereyes", "gbuffers_beaconbeam",
                 "gbuffers_armor_glint", "gbuffers_glint", "gbuffers_glint_water"):
        files.setdefault(f"shaders/{name}.vsh", vertex_stage)

    # Programs with no dedicated fragment stage fall back to the plain textured one.
    for name in ("gbuffers_skytextured", "gbuffers_damagedblock", "gbuffers_block", "gbuffers_item",
                 "gbuffers_weather", "gbuffers_beaconbeam", "gbuffers_armor_glint"):
        files.setdefault(f"shaders/{name}.fsh", G_BUFFERS_TEXTURED_FSH)
    for name in ("gbuffers_spidereyes", "gbuffers_glint", "gbuffers_glint_water"):
        files.setdefault(f"shaders/{name}.fsh", G_BUFFERS_BASIC_FSH)

    for path, body in files.items():
        full = os.path.join(ROOT, path)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w") as handle:
            handle.write(body)

    # A pack icon, so the shader list is not a grey rectangle. 128x128, same art as the mod icon.
    print(f"shaderpack: {len(files)} files under {os.path.relpath(ROOT)}")


if __name__ == "__main__":
    main()
