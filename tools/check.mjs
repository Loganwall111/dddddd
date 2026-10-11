/**
 * STATIC VERIFIER — bundles *every* module under src/ through esbuild.
 *
 * The game cannot be run in this sandbox (no GPU, no browser), so this is the
 * closest thing to a compiler we have: it parses every file, resolves every
 * import and reports the first syntax/reference error with a file and line,
 * exactly as the browser would fail at boot.
 *
 * Usage: node tools/check.mjs
 */
import * as esbuild from 'esbuild';
import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'src');

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const files = walk(srcDir).sort();
if (files.length === 0) {
  console.error('[check] no source files found');
  process.exit(1);
}

const entry = files.map((f) => `import ${JSON.stringify('./' + path.relative(root, f).split(path.sep).join('/'))};`).join('\n');
const started = Date.now();

try {
  const result = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, sourcefile: 'all-modules.js', loader: 'js' },
    bundle: true,
    write: false,
    format: 'esm',
    target: ['es2020'],
    platform: 'browser',
    logLevel: 'silent',
    metafile: true,
    define: { __DEV__: 'true', __BUILD_TIME__: '"check"' },
  });
  const bytes = result.outputFiles?.[0]?.text.length ?? 0;
  const modules = Object.keys(result.metafile.inputs).length;
  console.log(
    `[check] OK — ${files.length} source files, ${modules} modules linked, ${(bytes / 1048576).toFixed(2)} MB unminified (${Date.now() - started}ms)`
  );
} catch (err) {
  console.error('[check] FAILED');
  const errors = err.errors?.length ? err.errors : [{ text: String(err.message || err) }];
  for (const e of errors.slice(0, 25)) {
    const where = e.location ? `${path.relative(root, e.location.file)}:${e.location.line}:${e.location.column}` : '';
    console.error(`  • ${where} ${e.text}`);
    if (e.location?.lineText) console.error(`    ${e.location.lineText.trim()}`);
  }
  process.exit(1);
}
