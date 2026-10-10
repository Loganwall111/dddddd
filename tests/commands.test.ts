import assert from 'node:assert/strict';
import test from 'node:test';
import { runCommand, parseCommand, findBlock, type CommandHost } from '../src/commands/commands';
import { BLOCKS } from '../src/blocks/registry';

function host() {
  const calls: unknown[][] = [];
  const rules: Record<string, boolean> = { doDaylightCycle: true };
  const h: CommandHost = {
    give: (id, count) => calls.push(['give', id, count]),
    setMode: mode => calls.push(['mode', mode]),
    teleport: (x, y, z) => calls.push(['tp', x, y, z]),
    setTime: t => calls.push(['time', t]),
    getGameRule: r => rules[r],
    setGameRule: (r, v) => { rules[r] = v; calls.push(['rule', r, v]); },
    travel: d => calls.push(['dim', d]),
  };
  return { h, calls };
}

test('parseCommand requires a leading slash and splits arguments', () => {
  assert.equal(parseCommand('hello'), null);
  assert.deepEqual(parseCommand('/Give  Stone 5'), { name: 'give', args: ['Stone', '5'] });
});

test('findBlock matches names with spaces or underscores and numeric ids', () => {
  const id = findBlock('TNT');
  assert.equal(BLOCKS[id!].name, 'TNT');
  assert.equal(findBlock('tnt'), id);
  assert.equal(findBlock(String(id)), id);
  assert.equal(findBlock('not a real block'), null);
});

test('give clamps the count and reports unknown items', () => {
  const { h, calls } = host();
  const msg = runCommand('/give tnt 500', h);
  assert.equal(calls[0][0], 'give');
  assert.equal(calls[0][2], 64);
  assert.match(msg, /Gave 64/);
  assert.throws(() => runCommand('/give moonrock', h), /Unknown item/);
});

test('gamemode accepts aliases and rejects nonsense', () => {
  const { h, calls } = host();
  runCommand('/gamemode c', h);
  runCommand('/gamemode survival', h);
  assert.deepEqual(calls, [['mode', 'creative'], ['mode', 'survival']]);
  assert.throws(() => runCommand('/gamemode hard', h), /Usage/);
});

test('tp validates coordinates', () => {
  const { h, calls } = host();
  runCommand('/tp 10 64 -3', h);
  assert.deepEqual(calls[0], ['tp', 10, 64, -3]);
  assert.throws(() => runCommand('/tp 1 two 3', h), /number/);
});

test('time understands named times and wraps numeric values', () => {
  const { h, calls } = host();
  runCommand('/time set noon', h);
  runCommand('/time set 1.5', h);
  assert.deepEqual(calls, [['time', 0.25], ['time', 0.5]]);
  assert.throws(() => runCommand('/time add 5', h), /Usage/);
});

test('gamerule reads and writes only implemented rules', () => {
  const { h, calls } = host();
  assert.match(runCommand('/gamerule doDaylightCycle', h), /is true/);
  runCommand('/gamerule doDaylightCycle false', h);
  assert.deepEqual(calls[0], ['rule', 'doDaylightCycle', false]);
  assert.throws(() => runCommand('/gamerule keepInventory true', h), /Rules:/);
});

test('dimension validates the target and unknown commands are rejected', () => {
  const { h, calls } = host();
  runCommand('/dimension nether', h);
  assert.deepEqual(calls[0], ['dim', 'nether']);
  assert.throws(() => runCommand('/dimension hell', h), /Usage/);
  assert.throws(() => runCommand('/fly', h), /Unknown command/);
  assert.throws(() => runCommand('no slash', h), /start with/);
});
