// Lightweight sky clouds and screen-space shafts, NOT volumetric transport or shadow maps.
#define SIFT_CLOUDS 0.65 // [0.0 0.35 0.65 1.0]
#define SIFT_SHAFTS 0.25 // [0.0 0.15 0.25 0.4]
float cloudHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float cloudNoise(vec2 p) {
    vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(cloudHash(i),cloudHash(i+vec2(1,0)),f.x),mix(cloudHash(i+vec2(0,1)),cloudHash(i+vec2(1,1)),f.x),f.y);
}
vec3 overworldClouds(vec3 original, vec3 dir, float t, float dayTicks) {
    vec2 p=dir.xz/max(dir.y+0.12,0.12)*3.0+vec2(t*.008,t*.004);
    float density=cloudNoise(p)*.6+cloudNoise(p*2.1)*.27+cloudNoise(p*4.3)*.13;
    float clouds=smoothstep(.48,.73,density)*smoothstep(.02,.3,dir.y)*SIFT_CLOUDS;
    float day=smoothstep(-.3,.2,cos((dayTicks-6000.0)/24000.0*6.2831853));
    vec3 shade=mix(vec3(.13,.17,.25),vec3(.87,.89,.92),day);
    shade+=vec3(.12,.08,.04)*smoothstep(.55,.7,density)*day;
    return mix(original,shade,clouds);
}
