import { BLOCKS } from '../blocks/registry';
import type { DimensionId, GameMode } from '../core/types';

/** Game rules that are actually implemented. Only doDaylightCycle changes behaviour today. */
export const GAME_RULES = ['doDaylightCycle'] as const;
export type GameRule = (typeof GAME_RULES)[number];

/** Named times map onto the 0..1 day clock (0.25 = noon, 0.75 = midnight). */
const TIME_WORDS: Record<string, number> = { sunrise: 0, day: 0.2, noon: 0.25, sunset: 0.5, night: 0.75, midnight: 0.75 };
const DIMENSION_IDS: DimensionId[] = ['overworld', 'nether', 'end', 'crystal', 'sky', 'sift'];

/** Everything a command may do. Implemented by the Game so commands stay testable without Babylon. */
export interface CommandHost {
  give(id: number, count: number): void;
  setMode(mode: GameMode): void;
  teleport(x: number, y: number, z: number): void;
  setTime(time: number): void;
  getGameRule(rule: GameRule): boolean;
  setGameRule(rule: GameRule, value: boolean): void;
  travel(dimension: DimensionId): void;
}

export interface ParsedCommand { name: string; args: string[] }

export function parseCommand(input: string): ParsedCommand | null {
  const text = input.trim();
  if (!text.startsWith('/')) return null;
  const parts = text.slice(1).split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return { name: parts[0].toLowerCase(), args: parts.slice(1) };
}

/** Finds a block or item by name (spaces or underscores, case-insensitive) or by numeric id. */
export function findBlock(query: string): number | null {
  const q = query.trim().toLowerCase();
  if (/^\d+$/.test(q)) {
    const id = Number(q);
    return id > 0 && id < BLOCKS.length ? id : null;
  }
  const key = q.replace(/_/g, ' ');
  const hit = BLOCKS.find(b => b.id > 0 && b.name.toLowerCase() === key);
  return hit ? hit.id : null;
}

function parseNumber(value: string | undefined, label: string): number {
  const n = Number(value);
  if (value === undefined || !Number.isFinite(n)) throw new Error(`Expected a number for ${label}.`);
  return n;
}

const USAGE = {
  give: '/give <item> [count]',
  gamemode: '/gamemode <creative|survival>',
  tp: '/tp <x> <y> <z>',
  time: '/time set <day|noon|sunset|night|midnight|sunrise|0-1>',
  gamerule: '/gamerule <rule> [true|false]',
  dimension: '/dimension <overworld|nether|end|crystal|sky|sift>',
};

/** Runs one command line and returns feedback text. Throws Error with a player-facing message on failure. */
export function runCommand(input: string, host: CommandHost): string {
  const parsed = parseCommand(input);
  if (!parsed) throw new Error('Commands start with /. Try /help.');
  const { name, args } = parsed;
  switch (name) {
    case 'help':
      return `Commands: ${Object.values(USAGE).join(' | ')}`;
    case 'give': {
      if (!args.length) throw new Error(`Usage: ${USAGE.give}`);
      const itemQuery = args.length > 1 && /^\d+$/.test(args[args.length - 1]) ? args.slice(0, -1).join(' ') : args.join(' ');
      const count = args.length > 1 && /^\d+$/.test(args[args.length - 1]) ? Number(args[args.length - 1]) : 1;
      const id = findBlock(itemQuery);
      if (id === null) throw new Error(`Unknown item "${itemQuery}".`);
      const amount = Math.max(1, Math.min(64, count));
      host.give(id, amount);
      return `Gave ${amount} × ${BLOCKS[id].name}.`;
    }
    case 'gamemode': {
      const raw = (args[0] || '').toLowerCase();
      const mode: GameMode | null = raw === 'creative' || raw === 'c' ? 'creative' : raw === 'survival' || raw === 's' ? 'survival' : null;
      if (!mode) throw new Error(`Usage: ${USAGE.gamemode}`);
      host.setMode(mode);
      return `Game mode set to ${mode}.`;
    }
    case 'tp': {
      if (args.length !== 3) throw new Error(`Usage: ${USAGE.tp}`);
      const [x, y, z] = args.map((v, i) => parseNumber(v, ['x', 'y', 'z'][i]));
      host.teleport(x, y, z);
      return `Teleported to ${x}, ${y}, ${z}.`;
    }
    case 'time': {
      if ((args[0] || '').toLowerCase() !== 'set' || args.length !== 2) throw new Error(`Usage: ${USAGE.time}`);
      const word = args[1].toLowerCase();
      const value = word in TIME_WORDS ? TIME_WORDS[word] : Number(args[1]);
      if (!Number.isFinite(value)) throw new Error(`Usage: ${USAGE.time}`);
      host.setTime(((value % 1) + 1) % 1);
      return `Time set to ${word in TIME_WORDS ? word : value}.`;
    }
    case 'gamerule': {
      const rule = (args[0] || '') as GameRule;
      if (!GAME_RULES.includes(rule)) throw new Error(`Usage: ${USAGE.gamerule}. Rules: ${GAME_RULES.join(', ')}.`);
      if (args.length === 1) return `${rule} is ${host.getGameRule(rule)}.`;
      const raw = args[1].toLowerCase();
      if (raw !== 'true' && raw !== 'false') throw new Error(`Usage: ${USAGE.gamerule}`);
      host.setGameRule(rule, raw === 'true');
      return `${rule} set to ${raw}.`;
    }
    case 'dimension': {
      const id = (args[0] || '').toLowerCase() as DimensionId;
      if (!DIMENSION_IDS.includes(id)) throw new Error(`Usage: ${USAGE.dimension}`);
      host.travel(id);
      return `Travelling to ${id}.`;
    }
    default:
      throw new Error(`Unknown command "/${name}". Try /help.`);
  }
}
