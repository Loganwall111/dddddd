#version 120
// 0.17: lit Sift pass (was gbuffers_plain) so the composite can add shadows and sky-tinted lighting.
#define SIFT_DIM_FOG 0.85 // [0.0 0.25 0.5 0.85 1.0]
#define SIFT_PASS 1
#include "/program/gbuffers_siftlit.fsh"
