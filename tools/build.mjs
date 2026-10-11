/**
 * THE MULTIVERSE: SIMOLYSIS — build script
 * ------------------------------------------------------------
 * Bundles src/main.js -> game/bundle.js using esbuild.
 *
 * esbuild doubles as our static verifier: it fails hard on syntax errors and
 * on unresolved imports, which is the closest thing to a compiler this
 * project gets. Any failure here means the game would have died at boot.
 */
import * as esbuild from 'esbuild';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const outfile = path.join(root, 'game', 'bundle.js');
mkdirSync(path.join(root, 'game'), { recursive: true });

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: [path.join(root, 'src', 'main.js')],
  outfile,
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  platform: 'browser',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  metafile: true,
  define: {
    __DEV__: JSON.stringify(!!dev),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  banner: {
    js: '/* THE MULTIVERSE: SIMOLYSIS — a three.js reality engine. Built ' +
      new Date().toISOString() + ' */',
  },
};

async function run() {
  const started = Date.now();
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('[build] watching for changes…');
    return;
  }
  const result = await esbuild.build(options);
  const size = statSync(outfile).size;
  const inputs = Object.keys(result.metafile.inputs).length;
  console.log(
    `[build] ok — ${inputs} modules -> game/bundle.js ` +
    `(${(size / 1048576).toFixed(2)} MB, ${Date.now() - started}ms)`
  );
}

run().catch((err) => {
  console.error('\n[build] FAILED — the game would not have booted:');
  console.error(err.message || err);
  // Print a compact, readable location for syntax/resolve errors.
  if (err.errors?.length) {
    for (const e of err.errors.slice(0, 20)) {
      const where = e.location ? `${e.location.file}:${e.location.line}:${e.location.column}` : '';
      console.error(` • ${where} ${e.text}${e.location?.lineText ? '\n   ' + e.location.lineText.trim() : ''}`);
    }
  }
  process.exit(1);
});
