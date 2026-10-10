import { spawnSync } from 'node:child_process';

const commands = [
  ['--no-install', 'tsc', '--noEmit'],
  ['--no-install', 'tsx', '--test', 'tests/core.test.ts', 'tests/player.test.ts', 'tests/commands.test.ts'],
];
if (process.argv.includes('--browser')) commands.push(['--no-install', 'playwright', 'test']);
for (const args of commands) {
  console.log(`\n> npx ${args.join(' ')}\n`);
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) { console.error(result.error); process.exit(1); }
  if (result.status !== 0) process.exit(result.status || 1);
}