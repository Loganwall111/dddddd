import { MaterialPluginBase } from '@babylonjs/core/Materials/materialPluginBase';
import { ShaderLanguage } from '@babylonjs/core/Materials/shaderLanguage';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture';
import type { UniformBuffer } from '@babylonjs/core/Materials/uniformBuffer';
import { ATLAS_COLS, ATLAS_ROWS } from '../blocks/registry';

// World-space UVs repeat one atlas tile per block, even on a large greedy quad.
export class VoxelAtlasPlugin extends MaterialPluginBase {
  time = 0; sea = 26; caustics = 1;
  constructor(material: PBRMaterial, private normals: BaseTexture) { super(material, 'VoxelAtlasTiling', 180, {}, true, true); this.doNotSerialize = true; }
  getClassName() { return 'VoxelAtlasTiling'; }
  isCompatible() { return true; }
  getSamplers(samplers: string[]) { samplers.push('voxelNormal'); }
  getUniforms(language?: ShaderLanguage) { return { ubo: [{ name: 'voxelTime', size: 1, type: 'float' }, { name: 'voxelSea', size: 1, type: 'float' }, { name: 'voxelCaustics', size: 1, type: 'float' }], fragment: language === ShaderLanguage.WGSL ? '' : 'uniform float voxelTime; uniform float voxelSea; uniform float voxelCaustics;' }; }
  bindForSubMesh(buffer: UniformBuffer) { buffer.setTexture('voxelNormal', this.normals); buffer.updateFloat('voxelTime', this.time); buffer.updateFloat('voxelSea', this.sea); buffer.updateFloat('voxelCaustics', this.caustics); }
  getCustomCode(shaderType: string, language?: ShaderLanguage): Record<string, string> | null {
    if (shaderType !== 'fragment') return null;
    if (language === ShaderLanguage.WGSL) return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'var voxelNormal: texture_2d<f32>; var voxelNormalSampler: sampler;',
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        var voxelPlane: vec2f = fragmentInputs.vPositionW.xy;
        if (abs(fragmentInputs.vNormalW.y) > 0.5) { voxelPlane = fragmentInputs.vPositionW.xz; }
        else if (abs(fragmentInputs.vNormalW.x) > 0.5) { voxelPlane = fragmentInputs.vPositionW.zy; }
        let voxelTile: vec2f = floor(fragmentInputs.vAlbedoUV * vec2f(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0));
        let voxelAtlasUV: vec2f = (voxelTile + clamp(fract(voxelPlane), vec2f(0.035), vec2f(0.965))) / vec2f(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
      `,
      '!fragmentInputs\\.vAlbedoUV\\+uvOffset': 'voxelAtlasUV',
      '!fragmentInputs\\.vReflectivityUV\\+uvOffset': 'voxelAtlasUV',
      '!fragmentInputs\\.vEmissiveUV\\+uvOffset': 'voxelAtlasUV',
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        let detailNormal: vec3f = textureSample(voxelNormal, voxelNormalSampler, voxelAtlasUV).xyz * 2.0 - 1.0;
        var perturb: vec3f = vec3f(detailNormal.x, detailNormal.y, 0.0);
        if (abs(fragmentInputs.vNormalW.y) > 0.5) { perturb = vec3f(detailNormal.x, 0.0, detailNormal.y); }
        else if (abs(fragmentInputs.vNormalW.x) > 0.5) { perturb = vec3f(0.0, detailNormal.y, detailNormal.x); }
        normalW = normalize(normalW + perturb * 0.08);
        let depth: f32 = max(0.0, uniforms.voxelSea - fragmentInputs.vPositionW.y);
        let ripple: f32 = abs(sin(fragmentInputs.vPositionW.x * 1.9 + sin(fragmentInputs.vPositionW.z * 1.3 + uniforms.voxelTime)) * cos(fragmentInputs.vPositionW.z * 1.6 + uniforms.voxelTime * 0.6));
        let caustic: f32 = pow(1.0-ripple, 14.0) * exp(-depth * 0.08) * step(0.01,depth) * max(fragmentInputs.vNormalW.y,0.0) * uniforms.voxelCaustics;
        surfaceAlbedo *= vec3f(1.0) + vec3f(0.22,0.45,0.42) * caustic;
      `,
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: 'uniform sampler2D voxelNormal;',
      CUSTOM_FRAGMENT_MAIN_BEGIN: `
        vec2 voxelPlane = vPositionW.xy;
        if (abs(vNormalW.y) > 0.5) { voxelPlane = vPositionW.xz; }
        else if (abs(vNormalW.x) > 0.5) { voxelPlane = vPositionW.zy; }
        vec2 voxelTile = floor(vAlbedoUV * vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0));
        vec2 voxelAtlasUV = (voxelTile + clamp(fract(voxelPlane), vec2(0.035), vec2(0.965))) / vec2(${ATLAS_COLS}.0, ${ATLAS_ROWS}.0);
      `,
      '!vAlbedoUV\\+uvOffset': 'voxelAtlasUV',
      '!vReflectivityUV\\+uvOffset': 'voxelAtlasUV',
      '!vEmissiveUV\\+uvOffset': 'voxelAtlasUV',
      CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        vec3 detailNormal = texture2D(voxelNormal, voxelAtlasUV).xyz * 2.0 - 1.0;
        vec3 perturb = vec3(detailNormal.xy,0.0);
        if (abs(vNormalW.y) > 0.5) { perturb = vec3(detailNormal.x,0.0,detailNormal.y); }
        else if (abs(vNormalW.x) > 0.5) { perturb = vec3(0.0,detailNormal.y,detailNormal.x); }
        normalW = normalize(normalW + perturb * 0.08);
        float depth = max(0.0,voxelSea-vPositionW.y);
        float ripple = abs(sin(vPositionW.x*1.9+sin(vPositionW.z*1.3+voxelTime))*cos(vPositionW.z*1.6+voxelTime*.6));
        float caustic = pow(1.0-ripple,14.0)*exp(-depth*.08)*step(.01,depth)*max(vNormalW.y,0.0)*voxelCaustics;
        surfaceAlbedo *= vec3(1.0)+vec3(.22,.45,.42)*caustic;
      `,
    };
  }
}