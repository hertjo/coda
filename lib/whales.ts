/**
 * Aggregate codas into one feature vector per individual whale.
 *
 * Each profile encodes how that whale talks:
 *
 *   meanTempo       average coda duration (s)
 *   tempoStd        intra-whale tempo variability (s)
 *   rhythmHist[18]  fraction of this whale's codas in each rhythm class
 *   ornamentRate    fraction of codas with an ornament
 *   logCount        log(1 + number of codas), down-weighted so a whale
 *                   with 500 codas does not dominate the projection
 *   rubatoDrift     mean abs duration diff between consecutive
 *                   same-class codas by this whale; 0 if too few pairs
 *
 * The whale also carries its Unit and UnitNum labels from the corpus so
 * downstream views can colour by social unit.
 *
 * IDN == 0 marks unknown whales in the CSV; we drop those.
 */

import type { Coda } from "./dataset";
import type { FeatureSet } from "./features";
import { RHYTHM_CLASSES } from "./features";

export type WhaleProfile = {
  id: number;
  unit: string;
  unitNum: number;
  count: number;
  vector: Float32Array; // length = FEATURE_DIM
  meanTempo: number;
  tempoStd: number;
  ornamentRate: number;
  rubatoDrift: number;
  dominantRhythms: number[]; // top 3 rhythm classes for this whale
};

export const FEATURE_DIM = 2 /* tempo + std */ + RHYTHM_CLASSES + 2 /* ornament + log count */ + 1 /* rubato */;

const MIN_CODAS_PER_WHALE = 20;

export function buildWhaleProfiles(
  codas: Coda[],
  features: FeatureSet[],
): WhaleProfile[] {
  // Group coda indices by whale id.
  const groups = new Map<number, number[]>();
  for (let i = 0; i < codas.length; i++) {
    const id = codas[i].whaleId;
    if (id === 0) continue;
    const list = groups.get(id) ?? [];
    list.push(i);
    groups.set(id, list);
  }

  const profiles: WhaleProfile[] = [];
  for (const [id, indices] of groups.entries()) {
    if (indices.length < MIN_CODAS_PER_WHALE) continue;
    const profile = computeProfile(id, indices, codas, features);
    // Skip sentinel "unknown unit" labels. The CSV uses "ZZZ" or empty
    // strings for whales whose social unit was not determined.
    if (!profile.unit || profile.unit === "ZZZ" || profile.unit === "?") continue;
    profiles.push(profile);
  }
  return profiles.sort((a, b) => b.count - a.count);
}

function computeProfile(
  id: number,
  indices: number[],
  codas: Coda[],
  features: FeatureSet[],
): WhaleProfile {
  // Tempo stats.
  const tempos = indices.map((i) => codas[i].duration);
  const meanTempo = mean(tempos);
  const tempoStd = std(tempos, meanTempo);

  // Rhythm histogram normalised.
  const hist = new Float32Array(RHYTHM_CLASSES);
  for (const i of indices) hist[features[i].rhythmClass]++;
  for (let k = 0; k < RHYTHM_CLASSES; k++) hist[k] /= indices.length;

  // Ornament rate.
  let ornaments = 0;
  for (const i of indices) if (features[i].isOrnamented) ornaments++;
  const ornamentRate = ornaments / indices.length;

  // Rubato drift: mean abs duration diff between consecutive same-class
  // codas by this whale. "Consecutive" means consecutive in the CSV order
  // (which preserves recording-session order), filtered to the same
  // (rhythm, tempo) class.
  const driftSamples: number[] = [];
  const sorted = indices.slice();
  for (let pos = 0; pos < sorted.length - 1; pos++) {
    const a = features[sorted[pos]];
    const b = features[sorted[pos + 1]];
    if (a.rhythmClass === b.rhythmClass && a.tempoClass === b.tempoClass) {
      driftSamples.push(Math.abs(codas[sorted[pos + 1]].duration - codas[sorted[pos]].duration));
    }
  }
  const rubatoDrift = driftSamples.length > 0 ? mean(driftSamples) : 0;

  // Most-frequent rhythm classes.
  const sortedHist = Array.from(hist)
    .map((v, k) => [k, v] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  // Build the dense feature vector.
  const vec = new Float32Array(FEATURE_DIM);
  let p = 0;
  vec[p++] = meanTempo;
  vec[p++] = tempoStd;
  for (let k = 0; k < RHYTHM_CLASSES; k++) vec[p++] = hist[k];
  vec[p++] = ornamentRate;
  vec[p++] = Math.log1p(indices.length) * 0.05; // soft size weight
  vec[p++] = rubatoDrift;

  return {
    id,
    unit: codas[indices[0]].unit,
    unitNum: codas[indices[0]].unitNum,
    count: indices.length,
    vector: vec,
    meanTempo,
    tempoStd,
    ornamentRate,
    rubatoDrift,
    dominantRhythms: sortedHist,
  };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const v of xs) s += v;
  return s / xs.length;
}

function std(xs: number[], m: number): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const v of xs) {
    const d = v - m;
    s += d * d;
  }
  return Math.sqrt(s / xs.length);
}
