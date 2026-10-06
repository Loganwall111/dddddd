#version 150
// Beyond Minecraft / original GLSL 150. No external pack, imported textures or runtime code generation.
// Colors are stylized. Depth-aware screen-space composition cannot reveal off-screen world geometry.
uniform sampler2D SceneSampler;
uniform sampler2D DepthSampler;
uniform mat4 InverseProjection;
uniform mat4 Projection;
uniform mat4 CameraToWorld;
uniform mat4 WorldToCamera;
uniform vec2 Resolution;
uniform vec3 CameraPosition;
uniform float Time;
uniform float Motion;
uniform float IntroPhase;
uniform float EffectStrength;
uniform float RaySteps;
uniform float LensMode;
uniform float Transition;
uniform float RealmTheme;
uniform float CosmicPresence;
uniform vec4 Node0;
uniform vec4 Node1;
uniform vec4 Node2;
uniform vec4 Node3;
uniform vec4 Style0;
uniform vec4 Style1;
uniform vec4 Style2;
uniform vec4 Style3;
in vec2 texCoord;
out vec4 fragColor;

const float PI = 3.141592653589793;
const float EPS = 0.00001;
float saturate(float x) { return clamp(x, 0.0, 1.0); }
float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p) {
    p = fract(p * .1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                   mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                   mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float f = 0.0, a = .5;
    for (int i = 0; i < 4; i++) { f += noise3(p) * a; p = p * 2.03 + vec3(13.1,7.7,19.3); a *= .5; }
    return f;
}
vec3 spectral(float theme, float x) {
    vec3 c = .5 + .5 * cos(6.28318 * (vec3(.02,.32,.65) + x * .15 + theme * .09));
    if (theme < .5 && theme > -.5) c = mix(vec3(.05,.55,.36), vec3(.52,1.0,.82), x);
    if (theme > 1.5 && theme < 2.5) c = mix(vec3(.85,.035,.07), vec3(1.0,.66,.15), x);
    if (theme > 2.5 && theme < 3.5) c = mix(vec3(.10,.28,.62), vec3(.75,.94,1.0), x);
    if (theme > 3.5 && theme < 4.5) c = mix(vec3(.5,.10,.47), vec3(1.0,.65,.90), x);
    if (theme > 4.5 && theme < 5.5) c = mix(vec3(.015,.20,.43), vec3(.16,.85,.91), x);
    if (theme > 5.5 && theme < 6.5) c = mix(vec3(.06,.055,.12), vec3(.5,.95,.81), x);
    if (theme > 6.5) c = mix(vec3(.38,.25,.10), vec3(.91,.78,.44), x);
    return c;
}
vec3 compressLight(vec3 c) { return vec3(1.0) - exp(-max(c, vec3(0.0))); }
float capsule2(vec2 p, vec2 a, vec2 b, float r) {
    vec2 ap = p - a, ab = b - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), EPS), 0.0, 1.0)) - r;
}

vec3 skyField(vec3 rd, float theme) {
    float horizon = pow(1.0 - abs(rd.y), 4.0);
    float n = fbm(rd * 3.8 + vec3(0.0, Time * .006, 0.0));
    float ribbon = exp(-abs(dot(rd, normalize(vec3(.15,.91,.40))) + (n - .5) * .8) * 13.0);
    vec3 color = mix(vec3(.006,.009,.032), vec3(.11,.045,.19), horizon * .6);
    color += ribbon * mix(vec3(.04,.09,.24), vec3(.31,.055,.40), n) * (n * 1.5);
    color += spectral(theme, n) * pow(n, 4.0) * .23;
    vec3 starCell = rd * 490.0;
    vec3 cell = floor(starCell);
    vec3 point = fract(starCell) - .5;
    float stars = pow(max(0.0, 1.0 - length(point) * 2.0), 11.0) * step(.971, hash13(cell));
    color += mix(vec3(.48,.65,1.0), vec3(1.0,.78,.48), hash13(cell + 5.0)) * stars * 2.8;
    // A slow auroral curtain, not a scrolling skybox image.
    if ((LensMode > .5 && LensMode < 1.5) || (theme > 2.5 && theme < 3.5)) {
        float curtain = sin(rd.x * 13.0 + rd.z * 8.0 + fbm(rd * 5.0) * 5.0 + Time * .045);
        curtain = exp(-abs(curtain) * 13.0) * smoothstep(.05, .38, rd.y) * (1.0 - smoothstep(.6, .95, rd.y));
        color += curtain * mix(vec3(.03,.7,.34), vec3(.31,.11,.8), n) * .7;
    }
    return color;
}

vec3 witness(vec3 background, vec3 rd) {
    vec3 axis = normalize(vec3(0.0,.48,-1.0));
    vec3 right = vec3(1,0,0), up = normalize(cross(right, axis));
    float facing = dot(rd, axis);
    if (facing <= .12) return background;
    vec2 q = vec2(dot(rd, right), dot(rd, up)) / facing;
    float active = IntroPhase < 0.0 ? .12 : smoothstep(.2, 2.7, IntroPhase) * (1.0 - smoothstep(10.5, 14.0, IntroPhase));
    float dissolve = IntroPhase < 0.0 ? 0.0 : smoothstep(6.5, 12.5, IntroPhase);
    // A celestial forearm, reaching fingers and a head-shaped silhouette sit BEHIND terrain.
    float body = capsule2(q, vec2(-.85,-.75), vec2(-.28,-.26), .17);
    body = min(body, capsule2(q, vec2(-.28,-.26), vec2(.43,-.39), .14));
    for (int finger = 0; finger < 4; finger++) {
        float f = float(finger);
        body = min(body, capsule2(q, vec2(.28 + f * .07,-.38), vec2(.40 + f * .095,-.65 - f * .025), .035));
    }
    float skin = 1.0 - smoothstep(-.015, .025, body);
    float lines = pow(abs(sin(q.y * 64.0 + fbm(vec3(q * 6.0, 3.1)) * 8.0)), 26.0);
    vec3 bodyColor = vec3(.018,.025,.059) + vec3(.10,.055,.19) * lines;
    background = mix(background, bodyColor, skin * .66 * max(active, .4));
    vec2 e = q * mix(1.0, .91, IntroPhase < 0.0 ? 0.0 : smoothstep(1.0, 6.0, IntroPhase) * Motion);
    float lidHeight = .22 * (1.0 - pow(clamp(abs(e.x) / .60, 0.0, 1.0), 1.7));
    float edge = abs(e.y) - lidHeight;
    float eyeMask = (1.0 - smoothstep(-.005, .009, edge)) * (1.0 - smoothstep(.588, .607, abs(e.x)));
    float r = length(e), theta = atan(e.y, e.x);
    vec3 sclera = mix(vec3(.20,.115,.16), vec3(.72,.72,.64), exp(-abs(e.x) * 1.6));
    float veins = pow(abs(sin(theta * 22.0 + r * 39.0 + noise3(vec3(e * 32.0,2.0)) * 6.0)), 22.0) * smoothstep(.22,.51,r);
    sclera = mix(sclera, vec3(.35,.065,.12), veins * .4);
    float striation = .5 + .5 * sin(theta * 156.0 + sin(theta * 47.0) * 2.0 + r * 30.0);
    float irisMask = 1.0 - smoothstep(.191, .207, r);
    vec3 iris = mix(vec3(.04,.14,.21), vec3(.24,.80,.71), striation * .73 + .2);
    iris += vec3(.35,.16,.045) * exp(-abs(r - .105) * 38.0);
    iris *= .40 + .65 * smoothstep(.070, .15, r);
    vec3 eye = mix(sclera, iris, irisMask);
    eye = mix(eye, vec3(.001,.002,.006), 1.0 - smoothstep(.066,.079,r));
    eye += vec3(.8,.91,1.0) * exp(-length((e - vec2(-.055,.061)) * vec2(1.0,1.7)) * 110.0);
    eye *= .68 + .32 * smoothstep(-.24,.18,e.y);
    float cells = hash12(floor(e * vec2(76,58)));
    float pixelKeep = 1.0 - smoothstep(cells - .08, cells + .08, dissolve);
    float aura = exp(-abs(edge) * 70.0) * (1.0 - smoothstep(.59,.68,abs(e.x)));
    background += aura * vec3(.20,.31,.58) * active * .5;
    background = mix(background, eye, eyeMask * active * pixelKeep);
    if (IntroPhase >= 0.0) {
        vec2 grid = q * vec2(69,43);
        vec2 cell = floor(grid);
        float stream = fract(cell.y * .06 + Time * (.20 + hash12(vec2(cell.x, 3.0)) * .18));
        vec2 glyph = fract(grid) - .5;
        float ink = step(.32, abs(glyph.x)) * step(abs(glyph.y), .37) + step(abs(glyph.x), .33) * step(abs(glyph.y), .045);
        float rain = ink * pow(stream, 9.0) * step(.55, hash12(cell));
        background += rain * vec3(.16,.68,.49) * dissolve * (1.0 - dissolve) * 1.5 * active;
    }
    return background;
}

vec3 directionFor(vec2 uv) {
    vec4 view = InverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    return normalize((CameraToWorld * vec4(normalize(view.xyz / max(abs(view.w), EPS)), 0.0)).xyz);
}
float sceneDistance(vec2 uv, float depth) {
    if (depth > .999995) return 1e8;
    vec4 view = InverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return length(view.xyz / max(abs(view.w), EPS));
}
vec3 sampleBentScene(vec3 direction, vec3 original) {
    vec4 clip = Projection * WorldToCamera * vec4(direction, 0.0);
    if (clip.w <= EPS) return skyField(direction, RealmTheme);
    vec2 uv = clip.xy / clip.w * .5 + .5;
    if (min(uv.x, uv.y) < .002 || max(uv.x,uv.y) > .998) return skyField(direction, RealmTheme);
    vec3 sampled = texture(SceneSampler, uv).rgb;
    float depth = texture(DepthSampler, uv).r;
    if (depth > .999995 && CosmicPresence > .5) sampled = mix(sampled, skyField(direction, RealmTheme), .87);
    return sampled;
}

struct LightRay { vec3 direction; vec3 emission; float transmission; float footprint; };
// Schwarzschild null-orbit equation in a plane, expressed in Cartesian affine coordinates:
// d²p/dλ² = -(3/2) rs |p×v|² p / |p|^5. Coordinates are normalized to rs = 1.
// Velocity-Verlet integration (32..72 adaptive steps) conserves angular momentum approximately.
// This is a finite-budget lensing approximation, NOT Kerr spin, a GR renderer or path tracing.
LightRay bendRay(vec3 rd, vec3 center, float rs, float geometryDistance, float seed) {
    LightRay result = LightRay(rd, vec3(0), 1.0, 0.0);
    vec3 origin = -center / max(rs, .001);
    float along = dot(center, rd) / max(rs, .001);
    float impact2 = max(0.0, dot(origin, origin) - along * along);
    const float domain = 9.0;
    if (along < 0.0 || impact2 > domain * domain) return result;
    float nearT = max(0.0, along - sqrt(max(0.0, domain * domain - impact2)));
    if (nearT * rs > geometryDistance) return result;
    vec3 p = origin + rd * nearT, v = rd;
    float angular2 = dot(cross(p, v), cross(p, v));
    vec3 diskNormal = normalize(vec3(.14, 1.0, .32));
    float opacity = 0.0;
    vec3 radiance = vec3(0);
    bool captured = false, escaped = false;
    float budgetScale = 72.0 / max(RaySteps, 16.0);
    for (int i = 0; i < 80; i++) {
        if (float(i) >= RaySteps) break;
        float r = length(p);
        if (r < 1.025) { captured = true; break; }
        if (r > domain + .2 && dot(p, v) > 0.0) { escaped = true; break; }
        float ds = clamp(r * .105, .025, .84) * budgetScale;
        vec3 acceleration = -1.5 * angular2 * p / max(pow(r, 5.0), .01);
        vec3 next = p + v * ds + .5 * acceleration * ds * ds;
        float nr = max(length(next), .7);
        vec3 nextAcceleration = -1.5 * angular2 * next / max(pow(nr, 5.0), .01);
        v += .5 * (acceleration + nextAcceleration) * ds;
        vec3 mid = (p + next) * .5;
        float diskHeight = dot(mid, diskNormal);
        vec3 diskPoint = mid - diskNormal * diskHeight;
        float diskRadius = length(diskPoint);
        if (diskRadius > 1.8 && diskRadius < 6.8 && abs(diskHeight) < .48) {
            float phi = atan(diskPoint.z, diskPoint.x);
            float bands = .64 + .36 * sin(diskRadius * 19.0 - phi * 3.0 + Time * .42);
            float turbulent = .55 + .45 * noise3(vec3(diskRadius * 4.0, phi * 6.0 + Time * .06, seed * .0001));
            float density = exp(-abs(diskHeight) * 18.0) * smoothstep(1.8,2.3,diskRadius) * (1.0 - smoothstep(5.5,6.8,diskRadius));
            density *= bands * turbulent * ds * 2.6;
            float heat = pow(2.0 / diskRadius, .72);
            vec3 hot = mix(vec3(.82,.055,.14), vec3(1.0,.69,.30), heat);
            hot = mix(hot, vec3(.72,.83,1.0), pow(heat, 4.0) * .7);
            vec3 tangent = normalize(cross(diskNormal, diskPoint) + vec3(EPS));
            float doppler = pow(clamp(1.0 - dot(normalize(v), tangent) * .42, .48, 1.6), 3.0);
            radiance += hot * density * doppler * exp(-opacity) * 2.3;
            opacity += density * .35;
        }
        p = next;
    }
    if (!escaped && length(p) < 5.0) captured = true;
    float impact = sqrt(impact2);
    float photon = exp(-abs(impact - 2.598) * 15.0) * .28;
    result.direction = normalize(v);
    result.emission = radiance + vec3(.62,.28,.75) * photon;
    result.transmission = captured ? 0.0 : exp(-opacity);
    result.footprint = 1.0 - smoothstep(7.6, 9.0, impact);
    return result;
}

float boxSdf(vec3 p, vec3 halfSize) {
    vec3 d = abs(p) - halfSize;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}
vec2 realmSdf(vec3 p, float seed, float theme) {
    vec2 tile = floor((p.xz + 3.8) / 7.6);
    vec2 local = mod(p.xz + 3.8, 7.6) - 3.8;
    float h = hash12(tile + seed * .00007);
    float y = p.y - (h - .5) * 5.0;
    float size = 1.35 + h * 1.6;
    float slab = max(max(abs(local.x),abs(local.y)) - (size + min(y,0.0) * .36), max(y - .18,-y - 2.5));
    vec2 result = vec2(slab, y > -.12 ? 2.0 : 1.0);
    float pillar = boxSdf(vec3(local.x - .3,y - (1.0 + h),local.y), vec3(.23,.8 + h,.23));
    if (pillar < result.x && h > .48) result = vec2(pillar, 3.0);
    if ((theme < .5 || abs(theme - 4.0) < .5) && h < .65) {
        float trunk = boxSdf(vec3(local.x,y - .8,local.y), vec3(.12,.65,.12));
        float foliage = boxSdf(vec3(local.x,y - 1.65,local.y), vec3(.7,.52,.7)) - .05;
        float tree = min(trunk, foliage);
        if (tree < result.x) result = vec2(tree, foliage < trunk ? 4.0 : 1.0);
    }
    if (h > .72) {
        float waterfall = boxSdf(vec3(local.x - size,y + 3.5,local.y), vec3(.025,3.8,.24));
        if (waterfall < result.x) result = vec2(waterfall, 5.0);
    }
    return result;
}
vec3 realmVista(vec2 uv, float seed, float theme, float parallax) {
    vec3 ro = vec3(parallax * .5, 1.8, 6.5);
    vec3 rd = normalize(vec3(uv.x * 1.4, uv.y * 1.4 + .05, -1.7));
    vec3 sky = skyField(normalize(rd + vec3(.1,.4,0)), theme) * 1.7;
    sky += spectral(theme, .68) * pow(max(0.0, 1.0 - abs(rd.y + .12)), 8.0) * .25;
    float travel = 0.0, material = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 56; i++) {
        if (float(i) > RaySteps * .75 + 5.0) break;
        p = ro + rd * travel;
        vec2 field = realmSdf(p, seed, theme);
        if (field.x < .018) { material = field.y; break; }
        travel += clamp(field.x * .72, .025, .85);
        if (travel > 34.0) break;
    }
    if (material < .5) return sky;
    vec2 e = vec2(.02,0);
    vec3 normal = normalize(vec3(
        realmSdf(p + e.xyy,seed,theme).x - realmSdf(p - e.xyy,seed,theme).x,
        realmSdf(p + e.yxy,seed,theme).x - realmSdf(p - e.yxy,seed,theme).x,
        realmSdf(p + e.yyx,seed,theme).x - realmSdf(p - e.yyx,seed,theme).x) + vec3(EPS));
    float light = max(0.0,dot(normal,normalize(vec3(-.6,1.0,.4))));
    float blockGrain = hash13(floor(p * 8.0));
    vec3 albedo = spectral(theme, material > 1.5 ? .72 : .24) * (.65 + blockGrain * .35);
    if (material > 2.5 && material < 3.5) albedo = spectral(theme,.92) * 1.6;
    if (material > 3.5 && material < 4.5) albedo = theme < .5 ? vec3(.12,.50,.26) : vec3(.71,.25,.55);
    if (material > 4.5) albedo = vec3(.08,.47,.95) * (.6 + .4 * sin(p.y * 9.0 + Time * 1.2));
    vec3 color = albedo * (.25 + light * .83) + spectral(theme,.5) * .08;
    return mix(color, sky, 1.0 - exp(-travel * .027));
}
vec3 membrane(vec3 background, vec3 rd, float depth, vec4 node, vec4 style) {
    if (node.w < .025) return background;
    vec3 normal = vec3(-sin(style.y),0,cos(style.y));
    float denom = dot(rd, normal);
    if (abs(denom) < .0001) return background;
    float distance = dot(node.xyz, normal) / denom;
    if (distance <= 0.0 || distance > depth) return background;
    vec3 point = rd * distance - node.xyz;
    vec3 right = vec3(cos(style.y),0,sin(style.y));
    vec2 uv = vec2(dot(point,right) / node.w, point.y / (node.w * 1.35));
    float shape = pow(abs(uv.x),4.0) + pow(abs(uv.y),4.0);
    if (shape > 2.6) return background;
    float wave = sin(uv.y * 7.0 + Time * .75) * .009 * Motion;
    float edge = shape - 1.0 + wave;
    float aa = max(fwidth(shape) * 1.2, .007);
    float inside = 1.0 - smoothstep(-aa, aa, edge);
    vec3 color = background;
    if (inside > 0.0) {
        vec2 lensUv = uv + sin(uv.yx * 5.0 + Time * .16) * .008 * Motion;
        vec3 vista = realmVista(lensUv, style.z, style.w, dot(-node.xyz, right) / max(length(node.xyz), .1));
        // Fresnel-like pearlescent skin over a destination-inspired procedural scene.
        float membraneSheen = pow(1.0 - abs(denom), 2.0);
        vista += spectral(style.w,.8) * membraneSheen * .12;
        color = mix(color, vista, inside);
    }
    float rim = exp(-abs(edge) * 36.0);
    float halo = exp(-abs(edge) * 6.0) * .11;
    float filament = .65 + .35 * sin(atan(uv.y,uv.x) * 33.0 - Time * 1.1);
    vec3 rimColor = mix(vec3(.33,.13,1.0), spectral(style.w,.85), .42);
    color += rimColor * (rim * (1.1 + filament) + halo);
    color += vec3(.56,.88,1.0) * exp(-abs(edge) * 125.0) * .55;
    vec2 tile = floor(uv * 13.0), cell = fract(uv * 13.0) - .5;
    float shard = step(.89, hash12(tile + style.z * .001)) * (1.0 - smoothstep(.30,.34,max(abs(cell.x),abs(cell.y))));
    color += rimColor * shard * smoothstep(1.05,1.2,shape) * (1.0 - smoothstep(1.8,2.6,shape)) * .5;
    return color;
}

vec3 mandela(vec3 color, vec2 uv, vec3 rd, float depth) {
    if (LensMode < -.5) return color;
    float luminance = dot(color, vec3(.2126,.7152,.0722));
    if (LensMode < .5) {
        color = mix(vec3(luminance), color, 1.14);
        color *= vec3(.91,1.02,1.06);
    } else if (LensMode < 1.5) {
        color = mix(color, color * vec3(.72,1.13,1.10), .42);
    } else if (LensMode < 2.5) {
        vec2 facet = floor(uv * vec2(63,37));
        vec3 prism = .78 + .22 * cos(vec3(.0,2.1,4.2) + hash12(facet) * 6.0);
        color = mix(color, color * prism + vec3(.03,.018,.07), .6);
    } else if (LensMode < 3.5) {
        color = mix(vec3(.009,.018,.035), vec3(.68,.88,.88), pow(saturate(luminance), .64));
        color += vec3(.10,.04,.16) * (1.0 - luminance) * .26;
    } else if (LensMode < 4.5) {
        float ripple = fbm(rd * 4.0 + CameraPosition * .003 + vec3(Time * .027,0,0));
        if (depth > .999995) {
            float blob = smoothstep(.56,.65,ripple);
            vec3 membraneColor = .4 + .4 * cos(vec3(0,2,4) + ripple * 18.0 + rd.y * 3.0);
            color = mix(color, membraneColor * (.27 + .5 * max(0.0,rd.y)), blob * .80);
            color += vec3(.2,.07,.3) * exp(-abs(ripple - .58) * 75.0);
        } else color = mix(color, color * (.9 + spectral(1.0,ripple) * .25), .45);
    } else {
        vec3 memory = vec3(luminance) * vec3(1.13,.94,.72);
        color = mix(color, memory, .6);
        vec2 shift = vec2(1.5 / max(Resolution.x,1.0), 0);
        color += texture(SceneSampler, clamp(uv + shift, 0.001, .999)).rgb * .035;
    }
    return color;
}

void main() {
    vec2 uv = texCoord;
    vec3 original = texture(SceneSampler, uv).rgb;
    float depth = texture(DepthSampler, uv).r;
    float distance = sceneDistance(uv, depth);
    vec3 rd = directionFor(uv);
    vec3 color = original;
    bool isSky = depth > .999995;
    if (CosmicPresence > .5 && isSky) {
        vec3 cosmic = skyField(rd, RealmTheme);
        cosmic = witness(cosmic, rd);
        // Distant sky singularity is visual only. The relic's local singularities below have server gravity.
        vec3 center = normalize(vec3(-.58,.42,-.87)) * 1200.0;
        LightRay skyRay = bendRay(rd, center, 112.0, 1e8, 931.0);
        if (skyRay.footprint > 0.0) {
            vec3 skyBehind = skyField(skyRay.direction, RealmTheme);
            vec3 hole = skyBehind * skyRay.transmission + compressLight(skyRay.emission);
            cosmic = mix(cosmic, hole, skyRay.footprint);
        }
        color = mix(color, cosmic, RealmTheme < -.5 ? .88 : .96);
    }
    for (int i = 3; i >= 0; i--) {
        vec4 node = i == 0 ? Node0 : (i == 1 ? Node1 : (i == 2 ? Node2 : Node3));
        vec4 style = i == 0 ? Style0 : (i == 1 ? Style1 : (i == 2 ? Style2 : Style3));
        if (node.w < .025 || style.x < .5) continue;
        if (style.x < 1.5) color = membrane(color, rd, distance, node, style);
        else {
            LightRay ray = bendRay(rd, node.xyz, node.w, distance, style.z);
            if (ray.footprint > 0.0) {
                vec3 behind = sampleBentScene(ray.direction, color);
                vec3 warped = behind * ray.transmission + compressLight(ray.emission);
                color = mix(color, warped, ray.footprint);
            }
        }
    }
    color = mandela(color, uv, rd, depth);
    if (IntroPhase > 6.0 && IntroPhase < 13.0 && Motion > .5) {
        float dissolve = sin((IntroPhase - 6.0) / 7.0 * PI);
        vec2 grid = vec2(Resolution.x / 6.0, Resolution.y / 6.0);
        vec2 pixelUv = (floor(uv * grid) + .5) / grid;
        color = mix(color, texture(SceneSampler, pixelUv).rgb * vec3(.65,.93,.84), dissolve * .15 * (1.0 - float(isSky)));
    }
    // No strobe, HDR flash or forced camera movement. Transition closes to dark, never white.
    float vignette = 1.0 - smoothstep(.28,.85,length((uv - .5) * vec2(1.0,.8)));
    if (LensMode > -.5) color *= .93 + .07 * vignette;
    color *= 1.0 - Transition * .75;
    color = mix(original, color, clamp(EffectStrength,0.0,1.0));
    // Guard bad driver/interpolation values from becoming a screen-wide NaN feedback chain.
    if (any(isnan(color)) || any(isinf(color))) color = original;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
