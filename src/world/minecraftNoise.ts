import { fbm, noise2 } from './noise';

// Smooth large-scale terrain shape, inspired by vanilla low/high/selector/depth routing.
// Frequencies follow the supplied reference values. Octave counts are reduced from
// 16/8 to 6/4 for real-time chunk generation while preserving large smooth features.
export const MC = {
  lowFreq: 0.00522, lowOctaves: 6, lowSeed: 11,
  highFreq: 0.00261, highOctaves: 4, highSeed: 77,
  selFreq: 0.00522, selOctaves: 6, selSeed: 301, selFactor: 1.024,
  depthFreq: 0.00153, depthOctaves: 4, depthSeed: 999,
  fillFreq: 0.00781, fillOctaves: 4, fillSeed: 1401,
  tempFreq: 0.0016, moistFreq: 0.0021,
  forestFreq: 0.02, detailFreq: 0.05,
};

export function mcLow(x: number, z: number, seed: number) {
  return fbm(x * MC.lowFreq, z * MC.lowFreq, seed + MC.lowSeed, MC.lowOctaves);
}
export function mcHigh(x: number, z: number, seed: number) {
  return fbm(x * MC.highFreq + 0.5, z * MC.highFreq, seed + MC.highSeed, MC.highOctaves);
}
export function mcSelector(x: number, z: number, seed: number) {
  return fbm(x * MC.selFreq, z * MC.selFreq, seed + MC.selSeed, MC.selOctaves) * MC.selFactor;
}
export function mcDepth(x: number, z: number, seed: number) {
  return fbm(x * MC.depthFreq, z * MC.depthFreq, seed + MC.depthSeed, MC.depthOctaves);
}
export function mcFill(x: number, z: number, seed: number) {
  return fbm(x * MC.fillFreq + 3, z * MC.fillFreq, seed + MC.fillSeed, MC.fillOctaves);
}
export function mcTemp(x: number, z: number, seed: number) {
  return fbm(x * MC.tempFreq + 13.7, z * MC.tempFreq - 4.2, seed + 2001, 4);
}
export function mcMoist(x: number, z: number, seed: number) {
  return fbm(x * MC.moistFreq + 47.3, z * MC.moistFreq + 9.1, seed + 3001, 4);
}
export function mcForest(x: number, z: number, seed: number) {
  return fbm(x * MC.forestFreq, z * MC.forestFreq, seed + 4001, 3);
}
export function mcWeird(x: number, z: number, seed: number) {
  return noise2(x * 0.004 + 91.2, z * 0.004 - 33.7, seed + 5000);
}
export function mcRare(x: number, z: number, seed: number) {
  return noise2(x * 0.0011 + 7.7, z * 0.0011 + 17.3, seed + 6000);
}
export function mcDetail(x: number, z: number, seed: number) {
  return noise2(x * MC.detailFreq, z * MC.detailFreq, seed + 7000);
}
export function mcCave(x: number, y: number, z: number, seed: number) {
  return { cheese: noise2(x * 0.045 + y * 0.031, z * 0.045 - y * 0.017, seed + 880), wormA: noise2(x * 0.06 + y * 0.09, z * 0.06, seed + 453), wormB: noise2(x * 0.055 - y * 0.07, z * 0.055 + y * 0.05, seed + 454) };
}
