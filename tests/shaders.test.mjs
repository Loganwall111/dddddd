/**
 * Shader audits.
 * ==================================================================
 * GLSL cannot be compiled in the sandbox, but the most common way a shader
 * silently misbehaves is not a compile error — it is a uniform that the
 * shader declares and the material never provides. It defaults to zero, and
 * zero is quiet: point sprites become invisible, fog stops fogging, wind
 * stops blowing. Nothing throws, nothing logs.
 *
 * So this file reads shaders.js the way a compiler would: it collects every
 * `uniform` declaration in every shader string and checks that the enclosing
 * material factory actually supplies it.
 */
import { test } from '../tools/runner.mjs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'src/render/shaders.js'), 'utf8');

/** Uniforms three itself supplies, so a material need not declare them. */
const ENGINE_UNIFORMS = new Set([
  'cameraPosition',
  'viewMatrix',
  'modelMatrix',
  'projectionMatrix',
  'modelViewMatrix',
  'normalMatrix',
  'viewMatrixInverse',
  'isOrthographic',
  'fogColor',
  'fogDensity',
  'fogNear',
  'fogFar',
  'ambientLightColor',
  'directionalLights',
  'directionalLightShadows',
  'pointLights',
  'spotLights',
  'hemisphereLights',
  'rectAreaLights',
  'ltc_1',
  'ltc_2',
  'spotLightMap',
  'spotLightMatrix',
  'lightMapIntensity',
  'envMapIntensity',
  'diffuse',
  'emissive',
  'roughness',
  'metalness',
  'opacity',
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'alphaMap',
  'aoMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'normalScale',
  'clearcoat',
  'clearcoatRoughness',
  'iridescence',
  'iridescenceIOR',
  'sheen',
  'sheenRoughness',
  'sheenColor',
  'specularIntensity',
  'specularColor',
  'anisotropy',
  'anisotropyRotation',
  'anisotropyMap',
  'transmission',
  'thickness',
  'attenuationDistance',
  'attenuationColor',
  'ior',
  'dispersion',
  'uDiffuseMap',
  'uRoughnessMap',
  'uNormalMap',
]);

/** Split a module into named top-level function blocks. */
function functionBlocks(text) {
  const blocks = [];
  const pattern = /export (?:function|const) (\w+)\s*[=(]/g;
  const matches = [...text.matchAll(pattern)];
  matches.forEach((match, index) => {
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
    blocks.push({ name: match[1], body: text.slice(start, end) });
  });
  return blocks;
}

/** Every uniform name the GLSL in this text declares. */
function declaredUniforms(text) {
  const names = new Set();
  for (const match of text.matchAll(/\buniform\s+(?:lowp|mediump|highp)?\s*\w+\s+(\w+)\s*(\[[^\]]*\])?\s*;/g)) {
    names.add(match[1]);
  }
  return names;
}

/** Every name the JS side of the block mentions as a uniform key. */
function providedUniforms(text) {
  const names = new Set();
  // `uThing: { value: ... }` inside any object literal
  for (const match of text.matchAll(/(?:^|[\s{,])(u[A-Z]\w*)\s*:\s*\{/g)) names.add(match[1]);
  for (const match of text.matchAll(/(?:^|[\s{,])(u[A-Z]\w*)\s*:\s*(?![{])/g)) names.add(match[1]);
  // `uniforms.uThing = ...`
  for (const match of text.matchAll(/uniforms\.(\w+)\s*=/g)) names.add(match[1]);
  // `uniforms: { ... }` keys and `UniformsUtils.merge([..., { key: ... }])`
  for (const match of text.matchAll(/['"]?(u[A-Z]\w*)['"]?\s*:/g)) names.add(match[1]);
  return names;
}

const blocks = functionBlocks(source);

test('every shader factory exists and is non-trivial', (h) => {
  h.gt(blocks.length, 10, 'shaders.js should define a healthy set of factories');
  for (const block of blocks) {
    h.gt(block.body.length, 120, `${block.name} looks like a stub`);
  }
});

test('each shader passes through GLSL validation (balanced braces, no ES3-only syntax)', (h) => {
  for (const block of blocks) {
    // `GLSL_COMMON` and the other *_SHADER strings are libraries: they are
    // concatenated into a stage that supplies its own main().
    // Compiled into someone else's stage: shared libraries and the fragments
    // that patchers splice into three's own chunk pipeline.
    const isLibrary = /_COMMON$|_SHADER$|_PARS$/.test(block.name) || /onBeforeCompile|\.replace\(/.test(block.body);
    for (const glsl of glslStrings(block.body)) {
      const open = (glsl.match(/\{/g) || []).length;
      const close = (glsl.match(/\}/g) || []).length;
      h.eq(open, close, `${block.name} has unbalanced braces in a shader (${open} open, ${close} close)`);
      const parens = (glsl.match(/\(/g) || []).length;
      const parensClose = (glsl.match(/\)/g) || []).length;
      h.eq(parens, parensClose, `${block.name} has unbalanced parentheses in a shader`);
      // three r155+ always compiles non-raw materials as `#version 300 es`,
      // so sampler3D and texture() are legal here — but `gl_FragColor` must
      // not be mixed with a hand-declared output, which would not link.
      const declaresOut = /^\s*out\s+\w+\s+\w+\s*;/m.test(glsl) || /layout\s*\(\s*location\s*=\s*0\s*\)\s*out/.test(glsl);
      h.ok(!(declaresOut && /gl_FragColor/.test(glsl)), `${block.name} declares its own out variable and still writes gl_FragColor`);
      if (!isLibrary) h.ok(/\bvoid\s+main\s*\(/.test(glsl), `${block.name} has a shader string with no main()`);
    }
  }
});

test('shaders only use varyings that both stages declare', (h) => {
  for (const block of blocks) {
    const strings = glslStrings(block.body);
    const vertex = strings.filter((s) => s.includes('gl_Position'));
    const fragment = strings.filter((s) => s.includes('gl_FragColor') || s.includes('pc_fragColor'));
    if (!vertex.length || !fragment.length) continue;
    const vertexVaryings = new Set();
    for (const stage of vertex) for (const name of varyingNames(stage, 'varying')) vertexVaryings.add(name);
    const fragmentVaryings = new Set();
    for (const stage of fragment) for (const name of varyingNames(stage, 'varying')) fragmentVaryings.add(name);
    for (const name of fragmentVaryings) {
      if (name.startsWith('v')) {
        h.ok(
          vertexVaryings.has(name) || block.body.includes(`${name}`) === false,
          `${block.name} reads varying ${name} that the vertex stage never writes`,
        );
      }
    }
  }
});

/** Pull GLSL template-literal strings out of a block. */
function glslStrings(text) {
  const out = [];
  for (const match of text.matchAll(/\/\* glsl \*\/\s*`([\s\S]*?)`/g)) out.push(match[1]);
  return out;
}

function varyingNames(glsl, keyword) {
  const names = [];
  for (const match of glsl.matchAll(new RegExp(`${keyword}\\s+\\w+\\s+(\\w+)`, 'g'))) names.push(match[1]);
  return names;
}

test('no material declares a uniform and forgets to provide it', (h) => {
  const problems = [];
  for (const block of blocks) {
    if (!/new ShaderMaterial|new RawShaderMaterial/.test(block.body)) continue;
    const declared = declaredUniforms(block.body);
    const provided = providedUniforms(block.body);
    for (const name of declared) {
      if (ENGINE_UNIFORMS.has(name)) continue;
      if (provided.has(name)) continue;
      problems.push(`${block.name}: ${name}`);
    }
  }
  if (problems.length) console.log(`\n    unprovided uniforms: ${problems.join(', ')}`);
  h.eq(problems.length, 0, 'a uniform defaulting to zero is a silent visual bug');
});

test('every #include names a chunk three actually ships', async (h) => {
  const THREE = await import('three');
  const shipped = new Set(Object.keys(THREE.ShaderChunk ?? {}));
  h.gt(shipped.size, 100, 'three should expose its shader chunk library');
  const files = ['src/render/shaders.js', 'src/render/sky.js', 'src/render/post.js', 'src/render/textures.js'];
  const missing = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    for (const match of text.matchAll(/#include\s*<([a-zA-Z0-9_]+)>/g)) {
      if (!shipped.has(match[1])) missing.push(`${file}: <${match[1]}>`);
    }
  }
  if (missing.length) console.log(`\n    unknown chunk includes: ${missing.join(', ')}`);
  h.eq(missing.length, 0, 'a misspelled chunk include is a compile error that only shows in the browser');
});

test('every patcher installs its cache key so materials do not share programs', (h) => {
  // three caches programs per material by cache key: two patched materials
  // with different uniforms but the same key would fight over one program.
  const patchers = blocks.filter((block) => /onBeforeCompile/.test(block.body));
  h.gt(patchers.length, 2, 'expected several onBeforeCompile patchers');
  for (const block of patchers) {
    const hasKey =
      /customProgramCacheKey/.test(block.body) ||
      /material\.userData\.cacheKey/.test(block.body) ||
      /\.cacheKey\s*=/.test(block.body);
    h.ok(hasKey, `${block.name} patches a material without setting a cache key`);
  }
});

test('material uniforms that are animated are reachable from the returned handle', (h) => {
  // Every factory that animates (uTime) must expose the uniforms object it
  // hands to the shader, or the caller cannot advance the clock.
  for (const block of blocks) {
    if (!/uTime/.test(block.body)) continue;
    const returnsMaterial = /return\s+material/.test(block.body);
    if (!returnsMaterial) continue;
    const exposes =
      /material\.userData\.uniforms/.test(block.body) ||
      /material\.uniforms/.test(block.body) ||
      /uniforms\.uTime/.test(block.body) ||
      /const uniforms\b/.test(block.body);
    h.ok(exposes, `${block.name} animates uTime but never exposes the uniforms`);
  }
});
