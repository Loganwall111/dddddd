export const RESONANCE_SEQUENCE = [0, 2, 1, 3, 0] as const;
export const NOTE_NAMES = ['C', 'E', 'G', 'B'];
export function advanceResonance(progress: number, note: number): { progress: number; complete: boolean } {
  const next = RESONANCE_SEQUENCE[progress] === note ? progress + 1 : note === RESONANCE_SEQUENCE[0] ? 1 : 0;
  return { progress: next === RESONANCE_SEQUENCE.length ? 0 : next, complete: next === RESONANCE_SEQUENCE.length };
}