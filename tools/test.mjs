/**
 * THE MULTIVERSE: SIMOLYSIS — test runner.
 *
 * Usage: node tools/test.mjs [filter]
 *
 * WebGL is unavailable in Node, so the suite covers what can be verified
 * without a GPU: noise, the terrain field, the lore/quest graph, navigation,
 * the save system, the audio mix graph, settings clamps — plus an audit of
 * every string the game speaks (balanced quotes/tags, no placeholder text).
 * A typo in the intro narration would otherwise surface only in the browser.
 */
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { tests } from './runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tests');
const filter = process.argv[2];

const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort();

let pass = 0;
let fail = 0;
const failures = [];

for (const file of files) {
  const before = tests.length;
  await import(pathToFileURL(path.join(dir, file)).href);
  const mine = tests.slice(before);
  console.log(`\n\x1b[36m${file}\x1b[0m  \x1b[90m(${mine.length} tests)\x1b[0m`);
  for (const t of mine) {
    const started = performance.now();
    try {
      await t.fn((await import('./harness-assert.mjs')).default);
      pass++;
      const ms = (performance.now() - started).toFixed(1);
      console.log(`  \x1b[32m✓\x1b[0m ${t.name} \x1b[90m${ms}ms\x1b[0m`);
    } catch (err) {
      fail++;
      failures.push({ file, name: t.name, err });
      console.log(`  \x1b[31m✗ ${t.name}\x1b[0m`);
    }
  }
}

console.log(`\n${'─'.repeat(64)}`);
if (fail === 0) {
  console.log(`\x1b[32mALL GREEN\x1b[0m — ${pass} tests passed across ${files.length} files.`);
} else {
  console.log(`\x1b[31m${fail} FAILED\x1b[0m / ${pass + fail} tests across ${files.length} files`);
  for (const f of failures) {
    console.log(`\n\x1b[31m✗ ${f.file} › ${f.name}\x1b[0m`);
    console.log(String(f.err?.stack || f.err).split('\n').slice(0, 10).join('\n'));
  }
  process.exit(1);
}
