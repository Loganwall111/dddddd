import { ShaderStore } from '@babylonjs/core/Engines/shaderStore';
import '@babylonjs/materials/water/water.fragment';
import '@babylonjs/materials/water/wgsl/water.fragment';

// Keep Babylon's reflection/refraction path; add only the Sift's spatial oil-film spectrum.
const marker='#define CUSTOM_FRAGMENT_MAIN_END';
const glsl=ShaderStore.ShadersStore.waterPixelShader;
if(glsl&&!glsl.includes('siftIridescence'))ShaderStore.ShadersStore.waterPixelShader=glsl.replace(marker,`
  if(colorBlendFactor > 0.39 && colorBlendFactor < 0.8){
    float siftIridescence = vPositionW.x*.045+vPositionW.z*.036+sin(vPositionW.x*.08+time*14.)*.32+time*6.;
    vec3 spectrum = .5+.5*cos(6.28318*(vec3(0.,.33,.67)+siftIridescence));
    gl_FragColor.rgb = mix(gl_FragColor.rgb, spectrum*.7+gl_FragColor.rgb*.5,.38);
  }
  ${marker}`);
const wgsl=ShaderStore.ShadersStoreWGSL.waterPixelShader;
if(wgsl&&!wgsl.includes('siftIridescence'))ShaderStore.ShadersStoreWGSL.waterPixelShader=wgsl.replace(marker,`
  if(uniforms.colorBlendFactor > 0.39 && uniforms.colorBlendFactor < 0.8){
    let siftIridescence: f32 = fragmentInputs.vPositionW.x*.045+fragmentInputs.vPositionW.z*.036+sin(fragmentInputs.vPositionW.x*.08+uniforms.time*14.)*.32+uniforms.time*6.;
    let spectrum: vec3f = vec3f(.5)+vec3f(.5)*cos(6.28318*(vec3f(0.,.33,.67)+vec3f(siftIridescence)));
    fragmentOutputs.color = vec4f(mix(fragmentOutputs.color.rgb, spectrum*.7+fragmentOutputs.color.rgb*.5,.38),fragmentOutputs.color.a);
  }
  ${marker}`);