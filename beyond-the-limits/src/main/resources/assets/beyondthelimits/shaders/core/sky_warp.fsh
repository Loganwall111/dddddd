#version 150

// The procedural sky.
//
// There is no sky texture here. Everything — stars, clouds, the sun, the horizon — is generated
// from the view direction, which is what makes the lensing possible: because the sky is a
// function rather than a picture, the shader can evaluate it at a *bent* direction and get a sky
// that is genuinely warped around a mass. A texture can only be sampled; this can be lied to.
//
// Mode table (kept in step with SkyRenderer):
//   0 untouched   1 sky crack   2 storm    3 black sun   4 collision   5 the impossible
//   6 Foglands    7 Codescape    8 Backrooms 9 mirrorworld 10 Substrata 11 the Wrong Minecraft

uniform float Time;
uniform float Mode;
uniform float Intensity;
uniform float Reality;
uniform float Aspect;
uniform float Fov;
uniform float CamYaw;
uniform float CamPitch;
uniform float Flash;
uniform float SkyOnly;

in vec2 texCoord;
in vec4 vertexColor;
out vec4 fragColor;

float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}

float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p, int octaves) {
    float total = 0.0;
    float amplitude = 0.5;
    float norm = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= octaves) {
            break;
        }
        total += noise(p) * amplitude;
        norm += amplitude;
        p *= 2.07;
        amplitude *= 0.5;
    }
    return total / max(norm, 0.0001);
}

float ridge(vec2 p, int octaves) {
    return 1.0 - abs(fbm(p, octaves) * 2.0 - 1.0);
}

float stars(vec3 dir, float density, float sharpness, float spin) {
    vec2 uv = vec2(atan(dir.z, dir.x) + spin, asin(clamp(dir.y, -1.0, 1.0)));
    uv *= density;
    vec2 cell = floor(uv);
    float best = 0.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            vec2 neighbour = cell + vec2(float(x), float(y));
            float present = hash21(neighbour);
            if (present > 0.86) {
                vec2 centre = neighbour + vec2(hash21(neighbour + 7.1), hash21(neighbour + 3.7));
                float distance = length(uv - centre);
                float twinkle = 0.7 + 0.3 * sin(Time * 1.7 + present * 30.0);
                best = max(best, pow(max(0.0, 1.0 - distance * sharpness), 8.0) * (present - 0.86) * 7.0 * twinkle);
            }
        }
    }
    return best;
}

vec3 lens(vec3 dir, vec3 centre, float strength) {
    vec3 toCentre = normalize(centre);
    float separation = max(0.0001, distance(normalize(dir), toCentre));
    float pull = clamp(strength / (separation * separation + 0.02), 0.0, 0.92);
    return normalize(mix(normalize(dir), toCentre, pull));
}

float disc(vec3 dir, vec3 centre, float radius, float softness) {
    float angle = distance(normalize(dir), normalize(centre));
    return 1.0 - smoothstep(radius, radius + softness, angle);
}

vec3 cloudLayer(vec3 dir, vec3 sunDir, float height, float speed, float scale, float coverage, vec3 lit, vec3 shadow) {
    // Planar projection: the cloud deck is a plane at a fixed height, so the projection of a view
    // ray onto it is what gives clouds their correct perspective at the horizon.
    if (dir.y < 0.02) {
        return vec3(0.0);
    }
    vec2 uv = dir.xz / max(dir.y, 0.02) * 0.04 * scale + vec2(Time * speed, Time * speed * 0.35);
    float density = fbm(uv, 5);
    density = smoothstep(coverage, coverage + 0.32, density);
    float shade = smoothstep(0.15, 0.85, density);
    float sunAmount = max(0.0, dot(normalize(dir), normalize(sunDir)));
    float silver = pow(sunAmount, 8.0) * density;
    vec3 colour = mix(shadow, lit, shade);
    colour += vec3(1.0, 0.94, 0.82) * silver * 0.7;
    // Thicker clouds near the horizon: the deck, seen edge-on.
    float edge = 1.0 - smoothstep(0.02, 0.35, dir.y);
    return colour * density * mix(1.0, 1.6, edge) * height;
}

void main() {
    // ---- view direction from the screen coordinate -------------------------------------------
    vec2 ndc = texCoord * 2.0 - 1.0;
    float halfHeight = tan(radians(clamp(Fov, 20.0, 130.0)) * 0.5);
    vec3 dir = normalize(vec3(ndc.x * halfHeight * Aspect, ndc.y * halfHeight, -1.0));

    float yaw = radians(CamYaw);
    float pitch = radians(CamPitch);
    // Pitch first, then yaw, matching the camera's own order.
    float cp = cos(pitch);
    float sp = sin(pitch);
    dir = vec3(dir.x, dir.y * cp - dir.z * sp, dir.y * sp + dir.z * cp);
    float cy = cos(yaw);
    float sy = sin(yaw);
    dir = vec3(dir.x * cy - dir.z * sy, dir.y, dir.x * sy + dir.z * cy);
    dir = normalize(dir);

    vec3 sunDir = normalize(vec3(0.35, 0.45, 0.82));
    float night = 0.0;

    // ---- the sky, before any event touches it -------------------------------------------------
    float horizon = clamp(dir.y * 1.4 + 0.12, 0.0, 1.0);
    vec3 skyColour = mix(vec3(0.35, 0.52, 0.83), vec3(0.09, 0.20, 0.52), horizon);
    skyColour = mix(skyColour, vec3(0.62, 0.72, 0.90), pow(1.0 - horizon, 3.0));

    float starField = stars(dir, 26.0, 9.0, 0.0);
    float starWeight = 1.0 - horizon;

    vec3 cloudColour = cloudLayer(dir, sunDir, 0.55, 0.004, 1.0, 0.48,
                                  vec3(1.0, 0.98, 0.94), vec3(0.45, 0.50, 0.60));
    float sunDisc = disc(dir, sunDir, 0.045, 0.02);
    vec3 sunGlow = vec3(1.0, 0.92, 0.75) * pow(max(0.0, dot(dir, sunDir)), 24.0) * 0.6;

    vec3 colour = skyColour + sunGlow + cloudColour;
    colour += vec3(0.9, 0.92, 1.0) * starField * starWeight;
    colour += vec3(1.0, 0.97, 0.88) * sunDisc;

    float alpha = 1.0;

    // ---- events --------------------------------------------------------------------------------
    if (Mode > 0.5 && Mode < 1.5) {
        // 1 — THE SKY IS FAKE. The real sky stays, and cracks open in it: through the gaps is a
        // different sky, lit from nowhere, with stars that turn the wrong way.
        float crawl = Time * 0.01;
        float crack = ridge(vec2(dir.x * 3.2 + crawl, dir.z * 3.2 - crawl * 0.6), 5);
        float opened = smoothstep(0.72 - Intensity * 0.35, 0.95, crack);
        vec3 behind = mix(vec3(0.05, 0.02, 0.12), vec3(0.42, 0.12, 0.65), horizon);
        behind += vec3(1.0, 0.85, 1.0) * stars(dir, 18.0, 7.0, -Time * 0.02) * 1.4;
        float rimLight = smoothstep(0.62, 0.92, crack) * (1.0 - opened);
        colour = mix(colour, behind, opened);
        colour += vec3(0.85, 0.55, 1.0) * rimLight * 0.35 * Intensity;
    } else if (Mode > 1.5 && Mode < 2.5) {
        // 2 — DIMENSIONAL STORM. The sky boils, the light goes the colour of a bruise, and
        // lightning crawls through the cloud deck. Flash is pushed in from the client on strikes.
        vec3 storm = mix(vec3(0.05, 0.05, 0.09), vec3(0.16, 0.14, 0.24), horizon);
        float boil = fbm(vec2(dir.x, dir.z) * 6.0 + vec2(Time * 0.06, -Time * 0.04), 6);
        storm += vec3(0.20, 0.16, 0.30) * boil * 0.7;
        float bolt = ridge(vec2(dir.x * 2.0 + dir.y * 3.0, dir.z * 2.0), 6);
        float strike = smoothstep(0.88, 1.0, bolt) * Intensity;
        storm += vec3(0.85, 0.88, 1.0) * strike * 0.9;
        storm += vec3(0.72, 0.80, 1.0) * Flash * (0.35 + 0.65 * starField);
        colour = storm;
    } else if (Mode > 2.5 && Mode < 3.5) {
        // 3 — THE BLACK SUN. Colour drains out of the sky, the sun is replaced by a mass that
        // bends everything near it, and the world gets darker every day.
        vec3 centre = normalize(vec3(-0.25, 0.35, 0.9));
        float drain = clamp(Intensity, 0.0, 1.0);
        vec3 drained = mix(colour, vec3(dot(colour, vec3(0.299, 0.587, 0.114))) * vec3(0.55, 0.50, 0.62), drain);
        vec3 bent = lens(dir, centre, 0.05 + drain * 0.16);
        float bentStars = stars(bent, 26.0, 9.0, 0.0);
        float bentClouds = fbm(vec2(bent.x, bent.z) * 8.0 + Time * 0.01, 4);
        drained = drained * 0.35 + vec3(0.75, 0.72, 0.85) * bentStars * starWeight * 1.2;
        drained += vec3(0.10, 0.09, 0.14) * bentClouds;
        float mass = disc(dir, centre, 0.085, 0.004);
        float ring = disc(dir, centre, 0.105, 0.03) * (1.0 - mass);
        drained = mix(drained, vec3(0.008, 0.006, 0.014), mass);
        drained += vec3(1.0, 0.32, 0.18) * ring * (0.55 + 0.45 * sin(Time * 0.7));
        drained += vec3(1.0, 0.45, 0.25) * pow(max(0.0, 1.0 - distance(normalize(dir), centre) * 9.0), 6.0) * 0.8;
        colour = drained;
        night = 0.55 * drain;
    } else if (Mode > 3.5 && Mode < 4.5) {
        // 4 — WORLD COLLISION. Two skies occupy the same screen, separated by a seam that moves
        // and that neither side agrees on.
        float seamNoise = fbm(vec2(dir.x * 2.0, dir.z * 2.0 + Time * 0.01), 4);
        float seam = dir.x * 1.6 + seamNoise * 0.5 - 0.15;
        float otherSide = smoothstep(-0.06, 0.06, seam);
        vec3 nether = mix(vec3(0.32, 0.03, 0.02), vec3(0.68, 0.16, 0.05), horizon);
        nether += vec3(1.0, 0.42, 0.15) * fbm(vec2(dir.x, dir.z) * 5.0 + Time * 0.02, 4) * 0.4;
        vec3 end = mix(vec3(0.05, 0.03, 0.09), vec3(0.20, 0.12, 0.32), horizon);
        end += vec3(0.85, 0.75, 1.0) * stars(dir, 14.0, 6.0, Time * 0.01) * 0.8;
        vec3 intruder = mix(nether, end, smoothstep(0.0, 0.5, seamNoise));
        colour = mix(intruder, colour, otherSide);
        float rim = 1.0 - abs(seam) * 8.0;
        colour += vec3(1.0, 0.85, 0.55) * max(0.0, rim) * 0.5 * Intensity;
    } else if (Mode > 4.5 && Mode < 5.5) {
        // 5 — THE IMPOSSIBLE. A sky that is not a sky: arcs that cannot meet, colours that are
        // the wrong side of the spectrum, and stars arranged in rows.
        vec3 a = normalize(vec3(sin(Time * 0.05), 0.3, cos(Time * 0.05)));
        vec3 b = normalize(vec3(sin(Time * 0.05 + 2.1), -0.4, cos(Time * 0.05 + 2.1)));
        vec3 c = normalize(vec3(sin(Time * 0.05 + 4.2), 0.7, cos(Time * 0.05 + 4.2)));
        float arcs = pow(max(0.0, 1.0 - distance(dir, a) * 3.0), 6.0)
                   + pow(max(0.0, 1.0 - distance(dir, b) * 3.0), 6.0)
                   + pow(max(0.0, 1.0 - distance(dir, c) * 3.0), 6.0);
        vec3 base = mix(vec3(0.10, 0.02, 0.16), vec3(0.28, 0.06, 0.38), horizon);
        float grid = step(0.965, fract(dir.x * 12.0)) + step(0.965, fract(dir.z * 12.0));
        colour = base + vec3(0.85, 0.35, 1.0) * arcs * 0.7 + vec3(0.45, 1.0, 0.55) * grid * 0.06;
        colour += vec3(1.0, 0.95, 1.0) * stars(dir, 22.0, 10.0, Time * 0.03) * 0.9;
    } else if (Mode > 5.5 && Mode < 6.5) {
        // 6 — THE FOGLANDS. Everything is white, and the white is closer than it looks.
        float murk = fbm(vec2(dir.x, dir.z) * 3.0 + Time * 0.006, 4);
        colour = mix(vec3(0.80, 0.83, 0.85), vec3(0.95, 0.97, 0.98), murk);
        colour += vec3(0.06) * stars(dir, 10.0, 5.0, 0.0) * (1.0 - horizon);
    } else if (Mode > 6.5 && Mode < 7.5) {
        // 7 — THE CODESCAPE. The sky is a terminal: black, with green text falling through it.
        vec3 base = vec3(0.005, 0.02, 0.01);
        float columns = step(0.72, fract(dir.x * 8.0 + floor(dir.z * 8.0) * 0.37));
        float fall = fract(dir.y * 0.5 - Time * 0.06 + hash11(floor(dir.x * 8.0)) * 4.0);
        float trail = pow(1.0 - fall, 6.0) * columns;
        colour = base + vec3(0.15, 1.0, 0.35) * trail * (0.5 + horizon * 0.5);
        colour += vec3(0.02, 0.12, 0.05) * fbm(vec2(dir.x, dir.z) * 12.0, 3);
    } else if (Mode > 7.5 && Mode < 8.5) {
        // 8 — THE BACKROOMS. There is no sky here, only a ceiling of fluorescent panels.
        vec3 ceiling = vec3(0.34, 0.30, 0.14);
        float panels = (step(0.80, fract(dir.x * 5.0)) + step(0.80, fract(dir.z * 5.0))) * 0.5;
        float buzz = 0.92 + 0.08 * sin(Time * 6.0 + hash11(floor(dir.x * 5.0) + floor(dir.z * 5.0)) * 9.0);
        colour = ceiling * buzz + vec3(1.0, 0.96, 0.80) * panels * 0.55;
        colour *= mix(0.55, 1.0, smoothstep(-0.4, 0.3, dir.y));
    } else if (Mode > 8.5 && Mode < 9.5) {
        // 9 — THE MIRROR WORLD. The sky is the same sky, reflected, and slightly late.
        vec3 flipped = vec3(dir.x, -dir.y, -dir.z);
        vec3 mirrored = mix(vec3(0.30, 0.34, 0.42), vec3(0.06, 0.09, 0.16), clamp(flipped.y, 0.0, 1.0));
        mirrored += vec3(0.9, 0.95, 1.0) * stars(flipped, 30.0, 8.0, 0.0) * clamp(flipped.y, 0.0, 1.0) * 1.1;
        mirrored += vec3(0.7, 0.8, 0.95) * (1.0 - smoothstep(0.0, 0.25, abs(flipped.y))) * 0.35;
        colour = mirrored;
    } else if (Mode > 9.5 && Mode < 10.5) {
        // 10 — THE SUBSTRATA. Under everything, the sky is stone.
        float rock = fbm(vec2(dir.x, dir.z) * 7.0, 5);
        colour = mix(vec3(0.015, 0.013, 0.012), vec3(0.06, 0.055, 0.05), rock);
        colour += vec3(0.35, 0.05, 0.05) * pow(max(0.0, rock - 0.72), 2.0) * 4.0;
    } else if (Mode > 10.5) {
        // 11 — THE WRONG MINECRAFT. Familiar, and wrong: the sun is in the wrong place, the
        // clouds travel backwards, and the blue is a degree off.
        vec3 wrongSun = normalize(vec3(-0.6, 0.25, 0.75));
        float wrongClouds = fbm(vec2(dir.x, dir.z) * 9.0 - Time * 0.01, 4);
        colour = mix(vec3(0.22, 0.30, 0.26), vec3(0.05, 0.11, 0.14), horizon);
        colour += vec3(1.0, 0.95, 0.70) * disc(dir, wrongSun, 0.05, 0.03);
        colour += vec3(0.35, 0.45, 0.35) * wrongClouds * 0.4;
        colour += vec3(1.0, 0.2, 0.2) * stars(dir, 12.0, 12.0, Time * 0.02) * 0.5;
    }

    // ---- the world's own damage, applied to every mode ----------------------------------------
    // As reality falls the sky loses saturation, gains a violet cast and starts to band.
    float damage = clamp(1.0 - Reality, 0.0, 1.0);
    float bands = step(0.96, fract(dir.y * 40.0 + Time * 0.6)) * damage;
    colour = mix(colour, vec3(dot(colour, vec3(0.299, 0.587, 0.114))) * vec3(0.7, 0.5, 0.9), damage * 0.5);
    colour += vec3(0.20, 0.02, 0.30) * bands * 0.6;

    // Night, for the black sun and for the Substrata.
    colour *= mix(1.0, 0.22, night);

    // Lightning, from anywhere in the mod.
    colour += vec3(0.65, 0.72, 0.85) * clamp(Flash, 0.0, 1.0) * 0.45;

    // The event is faded in and out by the client, so it never snaps on or off.
    colour *= clamp(Intensity, 0.0, 1.0);
    alpha = clamp(Intensity, 0.0, 1.0);

    // In a sky-only dimension the sky is the world and is always fully opaque.
    alpha = mix(alpha, 1.0, step(0.5, SkyOnly));

    // Gentle dithering: large flat gradients band badly at 8 bits, and a sky is nothing but
    // large flat gradients.
    float dither = (hash21(texCoord * 4096.0 + Time) - 0.5) / 255.0;
    fragColor = vec4(colour + dither, alpha);
}
