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
uniform vec3 WitnessDirection;
uniform vec4 WitnessAnchor;
uniform float Time;
uniform float Motion;
uniform float IntroPhase;
uniform float EffectStrength;
uniform float RaySteps;
uniform float LensMode;
uniform float Transition;
uniform float RealmTheme;
uniform float CosmicPresence;
uniform float NebulaProximity;
uniform float Era;
uniform float Tunnel;
uniform float TunnelPhase;
uniform vec4 Node0;
uniform vec4 Node1;
uniform vec4 Node2;
uniform vec4 Node3;
uniform vec4 Node4;
uniform vec4 Node5;
uniform vec4 Style0;
uniform vec4 Style1;
uniform vec4 Style2;
uniform vec4 Style3;
uniform vec4 Style4;
uniform vec4 Style5;
uniform float Wave0;
uniform float Wave1;
uniform float Wave2;
uniform float Wave3;
uniform float Wave4;
uniform float Wave5;
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
float valueNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x),
                   mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                   mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
    float f = 0.0, a = .5;
    for (int i = 0; i < 4; i++) { f += valueNoise(p) * a; p = p * 2.03 + vec3(13.1,7.7,19.3); a *= .5; }
    return f;
}
vec3 spectral(float theme, float x) {
    vec3 c = .5 + .5 * cos(6.28318 * (vec3(.02,.32,.65) + x * .15 + theme * .09));
    if (theme < .5 && theme > -.5) c = mix(vec3(.05,.55,.36), vec3(.52,1.0,.82), x);
    if (theme > .5 && theme < 1.5) c = mix(vec3(.24,.10,.42), vec3(.78,.49,1.0), x);
    if (theme > 1.5 && theme < 2.5) c = mix(vec3(.85,.035,.07), vec3(1.0,.66,.15), x);
    if (theme > 2.5 && theme < 3.5) c = mix(vec3(.10,.28,.62), vec3(.75,.94,1.0), x);
    if (theme > 3.5 && theme < 4.5) c = mix(vec3(.5,.10,.47), vec3(1.0,.65,.90), x);
    if (theme > 4.5 && theme < 5.5) c = mix(vec3(.015,.20,.43), vec3(.16,.85,.91), x);
    if (theme > 5.5 && theme < 6.5) c = mix(vec3(.06,.055,.12), vec3(.5,.95,.81), x);
    if (theme > 6.5 && theme < 7.5) c = mix(vec3(.38,.25,.10), vec3(.91,.78,.44), x);
    if (theme > 7.5 && theme < 8.5) c = mix(vec3(.55,.60,.66), vec3(.99,.99,1.0), x);
    if (theme > 8.5 && theme < 9.5) c = mix(vec3(.37,.51,.60), vec3(.24,.45,.72), x);
    if (theme > 9.5 && theme < 10.5) c = mix(vec3(.72,.74,.78), vec3(1.0,.99,.96), x);
    if (theme > 10.5) c = mix(vec3(.06,.05,.11), vec3(.70,.72,.86), x);
    return c;
}
vec3 compressLight(vec3 c) { return vec3(1.0) - exp(-max(c, vec3(0.0))); }
float capsule2(vec2 p, vec2 a, vec2 b, float r) {
    vec2 ap = p - a, ab = b - a;
    return length(ap - ab * clamp(dot(ap, ab) / max(dot(ab, ab), EPS), 0.0, 1.0)) - r;
}
float ellipse(vec2 p, vec2 c, vec2 r) { return length((p - c) / max(r, vec2(EPS))) - 1.0; }

// ---------------------------------------------------------------------------------------------
// Sky. The nebula thickens as you fly into it (NebulaProximity), which is what makes the well's
// surroundings reachable rather than painted on.
vec3 skyField(vec3 rd, float theme) {
    float horizon = pow(1.0 - abs(rd.y), 4.0);
    float n = fbm(rd * 3.8 + vec3(0.0, Time * .006, 0.0));
    float ribbon = exp(-abs(dot(rd, normalize(vec3(.15,.91,.40))) + (n - .5) * .8) * 13.0);
    vec3 color = mix(vec3(.006,.009,.032), vec3(.11,.045,.19), horizon * .6);
    color += ribbon * mix(vec3(.04,.09,.24), vec3(.31,.055,.40), n) * (n * 1.5);
    color += spectral(theme, n) * pow(n, 4.0) * .23;
    // Reachable nebula: dust and lit gas that grow from the horizon into the local sky.
    float nebula = fbm(rd * 2.1 + vec3(Time * .004, 0.0, Time * .003));
    float veil = smoothstep(.34, .78, nebula) * NebulaProximity;
    color += veil * (spectral(theme, nebula * .8) * .55 + vec3(.16,.10,.28));
    color += pow(veil, 3.0) * vec3(.30,.24,.52) * .6;
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

// ---------------------------------------------------------------------------------------------
// The Witness, as a person rather than an eye: a colossal figure in the sky that is anchored to a
// real world position (WitnessAnchor), so flying toward the nebula brings you under its hand.
float personBody(vec2 q, float presence) {
    float breath = sin(Time * .14) * .012 * Motion;
    float sway = sin(Time * .07) * .02 * Motion;
    float body = ellipse(q, vec2(sway * .4, .62 + breath), vec2(.20, .25));                       // head
    body = min(body, capsule2(q, vec2(0.0, .40), vec2(0.0, .44), .09));                            // neck
    body = min(body, capsule2(q, vec2(-.44, .37), vec2(.44, .37), .16));                          // shoulders
    body = min(body, capsule2(q, vec2(sway, .34), vec2(sway * .3, -.02 + breath), .35));          // torso
    body = min(body, capsule2(q, vec2(sway * .5, -.02), vec2(sway * .2, -.92), .46));             // robe
    body = min(body, capsule2(q, vec2(.40, .35), vec2(.58, .02 + breath * 2.0), .105));           // left arm
    body = min(body, capsule2(q, vec2(-.40, .35), vec2(-.54, -.30 + breath * 2.0), .105));        // right arm
    // The reaching hand, fingers spread, drifting as if it were about to close.
    vec2 palm = vec2(-.56 + sway * .3, -.44 + breath * 2.5);
    body = min(body, capsule2(q, vec2(-.54, -.30), palm, .085));
    for (int finger = 0; finger < 5; finger++) {
        float f = float(finger) - 2.0;
        vec2 tip = palm + vec2(f * .075 + .02, -.12 - abs(f) * .022 + sin(Time * .3 + f) * .012 * Motion);
        body = min(body, capsule2(q, palm, tip, .022));
    }
    return body * presence;
}
vec3 witness(vec3 background, vec3 rd) {
    vec3 axis;
    float angular = 1.0;
    float anchored = 0.0;
    float nearFade = 1.0;
    if (WitnessAnchor.w > 0.5 && length(WitnessAnchor.xyz) > 1.0) {
        float distance = length(WitnessAnchor.xyz);
        axis = WitnessAnchor.xyz / distance;
        // Capped hard: the figure may fill the sky, never the screen.
        angular = clamp(WitnessAnchor.w * 7.0 / distance, .04, 1.6);
        anchored = 1.0;
        // Flying up to the well brings its anchored figure with you. Without this it becomes a dark
        // slab across the view, which is the "box in front of your face". It dissolves well before
        // you can reach its body, so the only thing up there is the black hole itself.
        nearFade = smoothstep(WitnessAnchor.w * 1.4, WitnessAnchor.w * 4.5, distance);
    } else {
        axis = normalize(WitnessDirection);
    }
    vec3 right = normalize(cross(axis, vec3(0,1,0)) + vec3(.00001,0,0));
    vec3 up = normalize(cross(right, axis));
    float facing = dot(rd, axis);
    if (facing <= .12) return background;
    vec2 q = vec2(dot(rd, right), dot(rd, up)) / (facing * max(angular, .04));
    float presence = (IntroPhase < 0.0 ? mix(.14, .95, anchored)
        : smoothstep(.2, 2.7, IntroPhase) * (1.0 - smoothstep(10.5, 14.0, IntroPhase))) * nearFade;
    float dissolve = IntroPhase < 0.0 ? 0.0 : smoothstep(6.5, 12.5, IntroPhase);
    float body = personBody(q, max(presence, .35));
    float skin = 1.0 - smoothstep(-.012, .02, body);
    float lines = pow(abs(sin(q.y * 64.0 + fbm(vec3(q * 6.0, 3.1)) * 8.0)), 26.0);
    float veins = pow(abs(sin(q.x * 40.0 + q.y * 22.0 + fbm(vec3(q * 9.0, 5.0)) * 6.0)), 18.0);
    vec3 bodyColor = vec3(.018,.025,.059) + vec3(.10,.055,.19) * lines + vec3(.05,.11,.16) * veins;
    background = mix(background, bodyColor, skin * .70 * max(presence, .4));
    // Two eyes now, both burning red: the face of the figure you can fly up to.
    vec2 gaze = vec2(sin(Time * .07) * .008, .62 + sin(Time * .14) * .012);
    float blinkPhase = fract(Time * .11);
    float blink = 1.0 - smoothstep(.0, .06, abs(blinkPhase - .5) * 2.0) * step(.485, blinkPhase) * step(blinkPhase, .515);
    float eyeMask = 0.0;
    vec3 eye = vec3(0.0);
    for (int side = 0; side < 2; side++) {
        float sgn = side == 0 ? -1.0 : 1.0;
        vec2 e = (q - gaze - vec2(sgn * .072, 0.0)) * mix(1.0, .91, Motion);
        float lidHeight = .075 * (1.0 - pow(clamp(abs(e.x) / .085, 0.0, 1.0), 1.7)) * blink;
        float edge = abs(e.y) - lidHeight;
        float mask = (1.0 - smoothstep(-.004, .008, edge)) * (1.0 - smoothstep(.082, .094, abs(e.x)));
        float r = length(e), theta = atan(e.y, e.x);
        vec3 sclera = mix(vec3(.17,.06,.06), vec3(.58,.30,.26), exp(-abs(e.x) * 3.0));
        float irisMask = 1.0 - smoothstep(.030, .036, r);
        float striation = .5 + .5 * sin(theta * 156.0 + sin(theta * 47.0) * 2.0 + r * 190.0);
        vec3 iris = mix(vec3(.22,.01,.01), vec3(1.0,.13,.07), striation * .73 + .2);
        iris += vec3(.95,.30,.05) * exp(-abs(r - .020) * 190.0);
        vec3 thisEye = mix(sclera, iris, irisMask);
        thisEye = mix(thisEye, vec3(.02,.0,.0), 1.0 - smoothstep(.010,.014,r));
        thisEye += vec3(1.0,.55,.45) * exp(-length((e - vec2(-.009,.010)) * vec2(1.0,1.7)) * 420.0);
        // Beaming: a red glow that leaks out of the socket and stains the face around it.
        thisEye += vec3(1.0,.08,.05) * exp(-r * 26.0) * .55;
        eyeMask = max(eyeMask, mask);
        eye = max(eye, thisEye);
    }
    float cells = hash12(floor(q * vec2(76,58)));
    float pixelKeep = 1.0 - smoothstep(cells - .08, cells + .08, dissolve);
    background = mix(background, eye, eyeMask * presence * pixelKeep);
    // The gaze: two hard red beams leaving the eyes and cutting down through the sky, wide enough
    // to be seen from the ground and always aimed away from the figure's face.
    for (int beam = 0; beam < 2; beam++) {
        float sgn = beam == 0 ? -1.0 : 1.0;
        vec2 from = gaze + vec2(sgn * .072, 0.0);
        vec2 dir = normalize(vec2(sgn * .42, -1.0));
        vec2 rel = q - from;
        float along = dot(rel, dir);
        float across = abs(rel.x * dir.y - rel.y * dir.x);
        float core = exp(-across * 46.0) * smoothstep(-.02, .12, along) * exp(-along * .85);
        float bloom = exp(-across * 11.0) * smoothstep(-.02, .18, along) * exp(-along * 1.5) * .4;
        background += vec3(1.0, .09, .05) * (core + bloom) * presence * pixelKeep * 1.5;
    }
    // Filaments instead of hair: the figure is stitched from the same code as the veil.
    float halo = exp(-abs(body) * 34.0);
    background += halo * vec3(.18,.26,.52) * presence * .5;
    if (IntroPhase >= 0.0) {
        vec2 grid = q * vec2(69,43);
        vec2 cell = floor(grid);
        float stream = fract(cell.y * .06 + Time * (.20 + hash12(vec2(cell.x, 3.0)) * .18));
        vec2 glyph = fract(grid) - .5;
        float ink = step(.32, abs(glyph.x)) * step(abs(glyph.y), .37) + step(abs(glyph.x), .33) * step(abs(glyph.y), .045);
        float rain = ink * pow(stream, 9.0) * step(.55, hash12(cell));
        background += rain * vec3(.16,.68,.49) * dissolve * (1.0 - dissolve) * 1.5 * presence;
    }
    return background;
}

// ---------------------------------------------------------------------------------------------
vec3 directionFor(vec2 uv) {
    vec4 view = InverseProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
    return normalize((CameraToWorld * vec4(normalize(view.xyz / max(abs(view.w), EPS)), 0.0)).xyz);
}
float sceneDistance(vec2 uv, float depth) {
    if (depth > .9999999) return 1e8;
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
    if (depth > .9999999 && CosmicPresence > .5) sampled = mix(sampled, skyField(direction, RealmTheme), .87);
    return sampled;
}

struct LightRay { vec3 direction; vec3 emission; float transmission; float footprint; };
// Schwarzschild null-orbit equation in a plane, expressed in Cartesian affine coordinates:
// d²p/dλ² = -(3/2) rs |p×v|² p / |p|^5. Coordinates are normalized to rs = 1.
// Velocity-Verlet integration (32..72 adaptive steps) conserves angular momentum approximately.
// This is a finite-budget lensing approximation, NOT Kerr spin, a GR renderer or path tracing.
LightRay bendRay(vec3 rd, vec3 center, float rs, float geometryDistance, float seed, float kind) {
    LightRay result = LightRay(rd, vec3(0), 1.0, 0.0);
    vec3 origin = -center / max(rs, .001);
    float along = dot(center, rd) / max(rs, .001);
    float impact2 = max(0.0, dot(origin, origin) - along * along);
    const float domain = 9.0;
    if (along < 0.0 || impact2 > domain * domain) return result;
    // The integration domain may contain the CAMERA for a nearby well. Its entry distance is then
    // zero and is not a valid occlusion proxy, so foreground surfaces are rejected against a
    // conservative photon-sphere envelope before any scene ray is sampled.
    if (geometryDistance < max(0.0, (along - 2.8) * rs)) return result;
    float nearT = max(0.0, along - sqrt(max(0.0, domain * domain - impact2)));
    if (nearT * rs > geometryDistance) return result;
    vec3 p = origin + rd * nearT, v = rd;
    float angular2 = dot(cross(p, v), cross(p, v));
    vec3 diskNormal = normalize(vec3(.14, 1.0, .32));
    float opacity = 0.0;
    vec3 radiance = vec3(0);
    bool captured = false, escaped = false;
    float budgetScale = 72.0 / max(RaySteps, 16.0);
    bool quasar = kind > 4.5 && kind < 5.5;
    bool wormhole = kind > 3.5 && kind < 4.5;
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
        if (diskRadius > (quasar ? 1.1 : 1.8) && diskRadius < 6.8 && abs(diskHeight) < .48) {
            float phi = atan(diskPoint.z, diskPoint.x);
            float bands = .64 + .36 * sin(diskRadius * 19.0 - phi * 3.0 + Time * .42);
            float turbulent = .55 + .45 * valueNoise(vec3(diskRadius * 4.0, phi * 6.0 + Time * .06, seed * .0001));
            float density = exp(-abs(diskHeight) * 18.0) * smoothstep(1.8,2.3,diskRadius) * (1.0 - smoothstep(5.5,6.8,diskRadius));
            density *= bands * turbulent * ds * (quasar ? 4.2 : 2.6);
            float heat = pow(2.0 / diskRadius, .72);
            vec3 hot = mix(vec3(.82,.055,.14), vec3(1.0,.69,.30), heat);
            hot = mix(hot, vec3(.72,.83,1.0), pow(heat, 4.0) * .7);
            if (quasar) hot = mix(hot, vec3(.55,.85,1.0), .55);
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
    // A wormhole is a lens with a rotating throat: it tints and twists what passes through it.
    if (wormhole) {
        float twist = sin(atan(origin.z, origin.x) * 3.0 + Time * .6);
        result.direction = normalize(v + vec3(.06 * twist, .04 * twist, .06));
        result.emission = radiance + vec3(.35,.75,.95) * photon * 1.4 + vec3(.10,.32,.55) * exp(-abs(impact - 1.6) * 6.0) * .5;
        result.transmission = captured ? 0.0 : exp(-opacity) * .92;
        result.footprint = 1.0 - smoothstep(7.6, 9.0, impact);
        return result;
    }
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
// Membranes (1) and tears (3). A tear is a ragged cut: finer filaments, lightning crawling along
// the edge, and whole alternate worlds hanging inside it like bubbles.
vec3 rift(vec3 background, vec3 rd, float depth, vec4 node, vec4 style, float wave) {
    if (node.w < .025) return background;
    bool tear = style.x > 2.5 && style.x < 3.5;
    vec3 normal = vec3(-sin(style.y),0,cos(style.y));
    float denom = dot(rd, normal);
    if (abs(denom) < .0001) return background;
    float distance = dot(node.xyz, normal) / denom;
    if (distance <= 0.0 || distance > depth) return background;
    vec3 point = rd * distance - node.xyz;
    vec3 right = vec3(cos(style.y),0,sin(style.y));
    vec2 uv = vec2(dot(point,right) / node.w, point.y / (node.w * 1.35));
    float shape = pow(abs(uv.x),4.0) + pow(abs(uv.y),4.0);
    // Rags: the tear's silhouette bites inward with noise instead of a clean rounded rectangle.
    float rag = tear ? (fbm(vec3(uv * 3.4, Time * .12)) - .5) * .5 : 0.0;
    float wave2 = sin(uv.y * (tear ? 11.0 : 7.0) + Time * (tear ? 1.4 : .75)) * (tear ? .016 : .009) * Motion;
    float edge = shape - 1.0 + wave2 + rag;
    float aa = max(fwidth(shape) * 1.2, .007);
    float inside = 1.0 - smoothstep(-aa, aa, edge);
    vec3 color = background;
    if (inside > 0.0) {
        vec2 lensUv = uv + sin(uv.yx * (tear ? 9.0 : 5.0) + Time * .16) * .008 * Motion;
        vec3 vista = realmVista(lensUv, style.z, style.w, dot(-node.xyz, right) / max(length(node.xyz), .1));
        float membraneSheen = pow(1.0 - abs(denom), 2.0);
        vista += spectral(style.w,.8) * membraneSheen * .12;
        if (tear) {
            // Bubbles: smaller worlds drifting inside the cut, each with its own palette.
            for (int i = 0; i < 5; i++) {
                float fi = float(i);
                vec2 centre = vec2(sin(fi * 2.3 + Time * .05) * .55, cos(fi * 1.7 - Time * .04) * .45);
                float radius = .12 + .05 * sin(fi * 3.1);
                float bubble = length(uv - centre) - radius;
                float skin = 1.0 - smoothstep(-.01, .01, bubble);
                float rim = exp(-abs(bubble) * 30.0);
                vec3 tint = .5 + .5 * cos(vec3(0.0, 2.1, 4.2) + fi * 1.7 + Time * .1);
                vista = mix(vista, tint * (.35 + .3 * sin(uv.y * 12.0 + Time)), skin * .7);
                vista += tint * rim * .6;
            }
            // A hot violet core, so the cut has depth instead of reading as a flat sheet.
            vista += vec3(.62,.34,1.0) * exp(-length(uv * vec2(1.5, .5)) * 3.2) * .85;
            // Whole islands hang inside the rift, pulled apart block by block, lit from behind.
            for (int isl = 0; isl < 7; isl++) {
                float fi = float(isl);
                vec2 islandCentre = vec2(sin(fi * 1.7 + Time * .06) * .62, cos(fi * 2.1 - Time * .05) * .5);
                vec2 d = abs(uv - islandCentre);
                float isize = .045 + .035 * hash12(vec2(fi, 3.0));
                float shape2 = step(d.x, isize * 1.7) * step(d.y, isize);
                float shade = .45 + .5 * hash12(vec2(fi, 7.0));
                vec3 rock = mix(vec3(.19,.09,.33), spectral(style.w, fi * .31), shade) * shade;
                vista = mix(vista, rock, shape2 * .85);
                vista += vec3(.60,.40,1.0) * exp(-max(d.x - isize * 1.7, d.y - isize) * 26.0) * .3;
            }
            float lightning = pow(abs(sin(atan(uv.y, uv.x) * 47.0 + fbm(vec3(uv * 8.0, Time * .5)) * 14.0)), 30.0);
            vista += vec3(.7,.85,1.0) * lightning * .8;
            // Arcs that cross the whole cut, the way the reference art throws bolts from rim to rim.
            for (int arc = 0; arc < 3; arc++) {
                float fi = float(arc);
                float phase = fi * 2.1 + Time * (.24 + fi * .07);
                vec2 a = vec2(sin(phase) * 1.15, -1.25 + .22 * fi);
                vec2 b = vec2(cos(phase * .7) * 1.2, 1.25 - .25 * fi);
                vec2 seg = b - a;
                float t = clamp(dot(uv - a, seg) / max(dot(seg, seg), EPS), 0.0, 1.0);
                vec2 closest = a + seg * t;
                float jag = (fbm(vec3(uv * 6.0, Time * .45 + fi)) - .5) * .17;
                float bolt = exp(-abs(length(uv - closest) + jag) * 20.0)
                           + exp(-abs(length(uv - closest) + jag) * 95.0) * 1.5;
                vista += mix(vec3(.78,.58,1.0), vec3(.50,.88,1.0), fract(fi * .37)) * bolt * .6;
            }
        }
        color = mix(color, vista, inside);
    }
    float rim = exp(-abs(edge) * (tear ? 60.0 : 36.0));
    float halo = exp(-abs(edge) * 6.0) * .11;
    float filament = .65 + .35 * sin(atan(uv.y,uv.x) * 33.0 - Time * 1.1);
    vec3 rimColor = tear ? mix(vec3(.62,.24,1.0), vec3(.72,.86,1.0), .35) : mix(vec3(.33,.13,1.0), spectral(style.w,.85), .42);
    color += rimColor * (rim * (1.1 + filament) + halo);
    color += vec3(.56,.88,1.0) * exp(-abs(edge) * 125.0) * .55;
    // Opening shockwave: a ring that expands once, timed from the node's birth, then settles.
    float birth = 1.0 - saturate(wave);
    if (birth > 0.0) {
        float ringRadius = (1.0 - birth) * 3.4;
        float ring = exp(-abs(length(uv) - ringRadius) * 9.0);
        color += rimColor * ring * birth * 1.6;
        color += vec3(1.0) * exp(-abs(length(uv) - ringRadius) * 40.0) * birth * .8;
    }
    vec2 tile = floor(uv * 13.0), cell = fract(uv * 13.0) - .5;
    float shard = step(.89, hash12(tile + style.z * .001)) * (1.0 - smoothstep(.30,.34,max(abs(cell.x),abs(cell.y))));
    color += rimColor * shard * smoothstep(1.05,1.2,shape) * (1.0 - smoothstep(1.8,2.6,shape)) * .5;
    return color;
}

// ---------------------------------------------------------------------------------------------
// The glasses switch realities rather than tinting the screen: each branch re-authors the image.
vec3 realityTreatment(vec3 color, vec2 uv, vec3 rd, float depth) {
    if (LensMode < -.5) return color;
    float luminance = dot(color, vec3(.2126,.7152,.0722));
    if (LensMode < .5) {                                   // Lucid
        color = mix(vec3(luminance), color, 1.14);
        color *= vec3(.91,1.02,1.06);
    } else if (LensMode < 1.5) {                           // Aurora
        color = mix(color, color * vec3(.72,1.13,1.10), .42);
    } else if (LensMode < 2.5) {                           // Prismatic
        vec2 facet = floor(uv * vec2(63,37));
        vec3 prism = .78 + .22 * cos(vec3(.0,2.1,4.2) + hash12(facet) * 6.0);
        color = mix(color, color * prism + vec3(.03,.018,.07), .6);
    } else if (LensMode < 3.5) {                           // Negative Space
        color = mix(vec3(.009,.018,.035), vec3(.68,.88,.88), pow(saturate(luminance), .64));
        color += vec3(.10,.04,.16) * (1.0 - luminance) * .26;
    } else if (LensMode < 4.5) {                           // Living Membrane
        float ripple = fbm(rd * 4.0 + CameraPosition * .003 + vec3(Time * .027,0,0));
        if (depth > .9999999) {
            float blob = smoothstep(.56,.65,ripple);
            vec3 membraneColor = .4 + .4 * cos(vec3(0,2,4) + ripple * 18.0 + rd.y * 3.0);
            color = mix(color, membraneColor * (.27 + .5 * max(0.0,rd.y)), blob * .80);
            color += vec3(.2,.07,.3) * exp(-abs(ripple - .58) * 75.0);
        } else color = mix(color, color * (.9 + spectral(1.0,ripple) * .25), .45);
    } else if (LensMode < 5.5) {                           // Echo Memory
        vec3 memory = vec3(luminance) * vec3(1.13,.94,.72);
        color = mix(color, memory, .6);
        vec2 shift = vec2(1.5 / max(Resolution.x,1.0), 0);
        color += texture(SceneSampler, clamp(uv + shift, 0.001, .999)).rgb * .035;
    } else if (LensMode < 6.5) {                           // Neon City
        float edges = 1.0 - smoothstep(.0, .34, abs(luminance - .34));
        vec2 block = floor(uv * vec2(Resolution.y / 10.0, Resolution.y / 14.0));
        float window = step(.62, hash12(block + floor(Time * 1.4)));
        vec3 neon = .5 + .5 * cos(vec3(0.0, 2.4, 4.4) + hash12(block) * 7.0);
        color *= vec3(.62,.66,.92);
        color += neon * window * .22 * (1.0 - smoothstep(.05, .5, abs(rd.y + .15)));
        color += vec3(.05,.02,.10) * edges;
        color = mix(color, color * color * 1.25, .35);
    } else if (LensMode < 7.5) {                           // Backrooms
        vec3 mono = vec3(.86,.79,.52) * (.35 + .75 * pow(saturate(luminance), .8));
        float tube = step(.86, sin(uv.y * Resolution.y * .09)) * .06;
        float flicker = 1.0 - .12 * step(.985, hash12(vec2(floor(Time * 9.0), 3.0)));
        color = mix(color, mono, .72) * flicker;
        color += vec3(.9,.85,.5) * tube;
        color *= .92 + .08 * (1.0 - length((uv - .5) * 1.35));
    } else if (LensMode < 8.5) {                           // Poolrooms
        float caustic = sin(uv.x * 26.0 + Time * .6 + sin(uv.y * 19.0 + Time * .4)) * .5 + .5;
        color = mix(color, color * vec3(.72,.95,1.0), .55);
        color += vec3(.35,.65,.75) * pow(caustic, 6.0) * .35;
        color = mix(color, vec3(.82,.94,.97), pow(saturate(luminance), 3.0) * .5);
    } else if (LensMode < 9.5) {                           // Cel Animation
        float levels = 6.0;
        vec3 cel = floor(color * levels + .5) / levels;
        float edge = abs(luminance - floor(luminance * levels) / levels);
        color = mix(cel, vec3(.04,.03,.06), smoothstep(.10, .16, edge) * .8);
        color = mix(color, color * vec3(1.06,.98,.96), .3);
    } else if (LensMode < 10.5) {                          // Eighties CRT
        vec2 curved = (uv - .5) * (1.0 + .12 * dot(uv - .5, uv - .5));
        vec2 cuv = clamp(curved + .5, .001, .999);
        color = texture(SceneSampler, cuv).rgb;
        float scan = .82 + .18 * sin(cuv.y * Resolution.y * 1.6);
        float mask = .9 + .1 * sin(cuv.x * Resolution.x * 2.2);
        vec3 shifted = texture(SceneSampler, clamp(cuv + vec2(.0022, 0), .001, .999)).rgb;
        color = mix(color, color * vec3(1.1,.92,.86) + shifted * vec3(.18,.04,.10), .55);
        color *= scan * mask;
        color += vec3(.05,.02,.0) * fract(sin(Time * 12.0) * 43758.5453) * .3;
    } else if (LensMode < 11.5) {                          // Chromatic Fold
        float angle = length(uv - .5) * 6.0 + Time * .2;
        vec2 folded = vec2(cos(angle), sin(angle)) * length(uv - .5);
        vec3 other = texture(SceneSampler, clamp(folded + .5, .001, .999)).rgb;
        color = mix(color, other, .55);
        color = .5 + .5 * cos(vec3(0.0, 2.1, 4.2) + color.rgb * 6.28318 + Time * .3);
        color *= .8 + .4 * fbm(vec3(uv * 8.0, Time * .2));
    } else if (LensMode < 12.5) {                          // Monolith City
        // A dusk skyline: slab towers behind smog, lit windows, a low sun burning through.
        float haze = pow(max(0.0, 1.0 - abs(rd.y + .05)), 6.0);
        color = mix(color, color * vec3(.84,.88,1.08) + vec3(.06,.05,.11) * haze, .5);
        float columns = max(Resolution.x / 22.0, 1.0);
        float column = floor(uv.x * columns);
        float top = .32 + .52 * hash12(vec2(column, 11.0));
        float bodyMask = step(uv.y, top);
        float windows = step(.55, hash12(vec2(floor(uv.x * columns * 2.0), floor(uv.y * Resolution.y / 9.0)) + floor(Time * .4)));
        vec3 skyline = mix(vec3(.05,.06,.12), vec3(.12,.12,.20), hash12(vec2(column, 3.0)));
        color = mix(color, skyline, bodyMask * .72);
        color += vec3(.95,.72,.35) * windows * bodyMask * .22;
        color += vec3(1.0,.55,.25) * pow(max(0.0, 1.0 - abs(rd.y + .02)), 18.0) * .45;
        color = mix(color, color * color * 1.2, .25);
    } else if (LensMode < 13.5) {                          // Deep Void
        // Only edges and lights survive; everything else falls into black.
        vec2 pixel = 1.0 / max(Resolution, vec2(1.0));
        float neighbourX = dot(texture(SceneSampler, clamp(uv + vec2(pixel.x, 0), .001, .999)).rgb, vec3(.2126,.7152,.0722));
        float neighbourY = dot(texture(SceneSampler, clamp(uv + vec2(0, pixel.y), .001, .999)).rgb, vec3(.2126,.7152,.0722));
        float edge = abs(luminance - neighbourX) + abs(luminance - neighbourY);
        color = vec3(.004,.006,.012) + vec3(.55,.72,1.0) * smoothstep(.02, .22, edge);
        color += vec3(.9,.8,1.0) * pow(saturate(luminance), 6.0) * .5;
        color += vec3(1.0) * step(.9955, hash12(floor(uv * Resolution / 3.0) + floor(Time * 2.0))) * .5;
    } else if (LensMode < 14.5) {                          // Solar Bloom
        vec3 warm = color * vec3(1.18,1.02,.78);
        warm += vec3(1.0,.72,.32) * pow(saturate(luminance), 2.0) * .55;
        color = mix(color, warm, .62);
        color += vec3(1.0,.78,.42) * exp(-length((uv - .5) * vec2(1.0,1.6)) * 5.0) * (.25 + .07 * sin(Time * .7));
        color += vec3(1.0,.94,.70) * step(.9975, hash12(floor(uv * Resolution / 4.0) + floor(Time * 3.0))) * .4;
    } else {                                               // Interference
        vec2 tear = vec2(hash12(vec2(floor(Time * 6.0), 3.0)) * .012, 0);
        vec3 split = color;
        split.r = texture(SceneSampler, clamp(uv + tear, .001, .999)).r;
        split.b = texture(SceneSampler, clamp(uv - tear, .001, .999)).b;
        color = mix(color, split, .8);
        float bar = smoothstep(.75, 1.0, sin((uv.y + Time * .12) * 9.0) * .5 + .5);
        float snow = hash12(uv * Resolution * .5 + floor(Time * 24.0));
        color += vec3(.5) * bar * .08 + vec3(snow) * .06;
        color *= .92 + .08 * step(.4, hash12(vec2(floor(Time * 15.0), 9.0)));
    }
    return color;
}

// ---------------------------------------------------------------------------------------------
// The Umbrella Effect: the branch you return to has a different sky, so the era is visible.
vec3 eraTreatment(vec3 color, vec2 uv, vec3 rd) {
    int era = int(Era + .5);
    if (era <= 0) return color;
    if (era == 1) color = mix(color, color * vec3(.86,1.08,.86), .35);                                  // living wood
    else if (era == 2) {                                                                                 // neon eighties
        color = mix(color, color * vec3(1.06,.86,1.12), .38);
        color += vec3(.35,.08,.45) * pow(max(0.0, 1.0 - abs(rd.y + .2)), 6.0) * .35;
    } else if (era == 3) color = mix(color, color * vec3(1.10,.98,.78), .38);                            // primeval
    else if (era == 4) color = mix(color, color * vec3(.92,.72,1.16), .42);                              // alien
    else if (era == 5) color = mix(color, color * vec3(1.12,.80,.80), .36);                              // veined
    else if (era == 6) {                                                                                 // bleached
        float luminance = dot(color, vec3(.2126,.7152,.0722));
        color = mix(color, vec3(luminance) * vec3(1.06,1.05,1.02) + vec3(.05), .62);
    } else color = mix(color, color * vec3(.78,.76,.74), .45);                                           // ashen
    return color;
}

// ---------------------------------------------------------------------------------------------
// The wormhole corridor: a real, walkable tube of barrier blocks that the client paints as a
// tunnel through space and time. It is an overlay, not a second world.
vec3 tunnelOverlay(vec3 color, vec2 uv, vec3 rd) {
    if (Tunnel < .5) return color;
    float phase = TunnelPhase;
    float radial = length(uv - .5);
    float angle = atan(uv.y - .5, uv.x - .5);
    float waves = sin(radial * 46.0 - phase * 26.0 + sin(angle * 7.0 + phase * 9.0) * 2.2);
    float streaks = pow(abs(sin(angle * 90.0 + phase * 34.0 + radial * 6.0)), 26.0);
    vec3 tunnelColor = mix(vec3(.02,.03,.09), vec3(.35,.55,1.0), saturate(waves * .5 + .5));
    tunnelColor += vec3(.85,.95,1.0) * streaks * (1.0 - radial);
    float aperture = smoothstep(.10, .34, radial) * (1.0 - smoothstep(.72, .98, radial));
    color = mix(color, tunnelColor, aperture * .88);
    color += vec3(.55,.85,1.0) * exp(-abs(radial - .38) * 22.0) * .6;
    color *= .55 + .45 * (1.0 - radial);
    float burst = smoothstep(.85, 1.0, abs(sin(phase * PI)));
    color += vec3(.9,.95,1.0) * burst * .18;
    return color;
}

void main() {
    vec2 uv = texCoord;
    vec3 original = texture(SceneSampler, uv).rgb;
    float depth = texture(DepthSampler, uv).r;
    float distance = sceneDistance(uv, depth);
    vec3 rd = directionFor(uv);
    vec3 color = original;
    bool isSky = depth > .9999999;
    if (CosmicPresence > .5 && isSky) {
        vec3 cosmic = skyField(rd, RealmTheme);
        // The distant sky singularity is a real anomaly now: it is also delivered as Node0..5 with
        // a colossal radius, so the loop below bends actual terrain through it. This pre-pass keeps
        // the painted disk for worlds where no snapshot has arrived yet.
        vec3 centre = normalize(WitnessDirection) * 900.0;
        LightRay skyRay = bendRay(rd, centre, 90.0, 1e8, 931.0, 2.0);
        if (skyRay.footprint > 0.0) {
            vec3 skyBehind = skyField(skyRay.direction, RealmTheme);
            vec3 hole = skyBehind * skyRay.transmission + compressLight(skyRay.emission);
            cosmic = mix(cosmic, hole, skyRay.footprint);
        }
        cosmic = witness(cosmic, rd);
        color = mix(color, cosmic, RealmTheme < -.5 ? .88 : .96);
    }
    for (int i = 5; i >= 0; i--) {
        vec4 node = i == 0 ? Node0 : (i == 1 ? Node1 : (i == 2 ? Node2 : (i == 3 ? Node3 : (i == 4 ? Node4 : Node5))));
        vec4 style = i == 0 ? Style0 : (i == 1 ? Style1 : (i == 2 ? Style2 : (i == 3 ? Style3 : (i == 4 ? Style4 : Style5))));
        float wave = i == 0 ? Wave0 : (i == 1 ? Wave1 : (i == 2 ? Wave2 : (i == 3 ? Wave3 : (i == 4 ? Wave4 : Wave5))));
        if (node.w < .025 || style.x < .5) continue;
        if (style.x < 1.5 || (style.x > 2.5 && style.x < 3.5)) {
            color = rift(color, rd, distance, node, style, wave);
        } else {
            // Kinds 2/4/5/6 lens the REAL scene: distant terrain inside the well's reach is bent,
            // which is what makes the black hole read as gravity rather than a sticker.
            LightRay ray = bendRay(rd, node.xyz, node.w, distance, style.z, style.x);
            if (ray.footprint > 0.0) {
                vec3 behind = sampleBentScene(ray.direction, color);
                vec3 warped = behind * ray.transmission + compressLight(ray.emission);
                float birth = 1.0 - saturate(wave);
                if (birth > 0.0) {
                    // The shockwave from a newly opened well, expanding across the lens footprint.
                    float ring = exp(-abs(length(node.xyz) - (1.0 - birth) * node.w * 7.0) / max(node.w, .5));
                    warped += vec3(.75,.85,1.0) * ring * birth * .5;
                }
                color = mix(color, warped, ray.footprint);
            }
        }
    }
    color = realityTreatment(color, uv, rd, depth);
    color = tunnelOverlay(color, uv, rd);
    color = eraTreatment(color, uv, rd);
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
