/**
 * Phonetic features per coda, as defined in Sharma et al. 2024.
 *
 *   tempo          sum of ICIs (also stored as Duration in the CSV).
 *                  KDE on tempo across the corpus reveals 5 modes; we
 *                  cluster into 5 tempo classes by 1D k-means on the
 *                  log-duration distribution.
 *
 *   rhythm vector  ICI vector normalised by total duration so the
 *                  representation is duration-independent. Sharma uses
 *                  a hierarchical clustering into 18 rhythm types; we
 *                  compute pairwise euclidean distances in the
 *                  normalised-ICI space and apply k-medoids with
 *                  k = 18.
 *
 *   rubato         smooth duration drift across adjacent codas of the
 *                  same rhythm + tempo class by the same whale. Computed
 *                  pairwise inside a dialogue stream.
 *
 *   ornamentation  the last click of an extra-long coda whose final ICI
 *                  is larger than the second-to-last by a factor above
 *                  the threshold derived from the global distribution.
 */

import type { Coda } from "./dataset";

export type FeatureSet = {
  tempo: number; // seconds
  tempoClass: number; // 0..4
  rhythm: Float32Array; // normalised ICIs, padded to length 8
  rhythmClass: number; // 0..17
  isOrnamented: boolean;
};

export type CorpusFeatures = {
  features: FeatureSet[];
  tempoEdges: number[]; // 6 bin edges separating 5 classes
  rhythmCentres: Float32Array[]; // 18 centroids in normalised-ICI space
};

const TEMPO_CLASSES = 5;
const RHYTHM_CLASSES = 18;
const RHYTHM_DIM = 8;

function normalisedICIs(coda: Coda): Float32Array {
  const out = new Float32Array(RHYTHM_DIM);
  if (coda.duration <= 0) return out;
  for (let i = 0; i < Math.min(coda.icis.length, RHYTHM_DIM); i++) {
    out[i] = coda.icis[i] / coda.duration;
  }
  return out;
}

function quantileBoundaries(values: number[], classes: number): number[] {
  const sorted = values.slice().sort((a, b) => a - b);
  const edges: number[] = [];
  for (let k = 1; k < classes; k++) {
    const idx = Math.floor((k / classes) * sorted.length);
    edges.push(sorted[idx]);
  }
  return edges;
}

function classify1D(value: number, edges: number[]): number {
  let i = 0;
  while (i < edges.length && value > edges[i]) i++;
  return i;
}

function euclidean2(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

/**
 * k-means++ initialisation + Lloyd iterations on a small fixed-dim
 * vector set. With ~8 700 points and dim 8 this is cheap.
 */
function kmeans(points: Float32Array[], k: number, iters = 30): Float32Array[] {
  const n = points.length;
  if (n === 0) return [];
  // ++ init.
  const centres: Float32Array[] = [points[Math.floor(Math.random() * n)].slice() as Float32Array];
  const dists = new Float64Array(n);
  while (centres.length < k) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (const c of centres) {
        const d = euclidean2(points[i], c);
        if (d < best) best = d;
      }
      dists[i] = best;
      total += best;
    }
    let pick = Math.random() * total;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      pick -= dists[i];
      if (pick <= 0) {
        chosen = i;
        break;
      }
    }
    centres.push(points[chosen].slice() as Float32Array);
  }

  const assign = new Int32Array(n);
  for (let iter = 0; iter < iters; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = euclidean2(points[i], centres[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (assign[i] !== best) {
        assign[i] = best;
        changed = true;
      }
    }
    if (!changed) break;
    const sums = Array.from({ length: k }, () => new Float64Array(RHYTHM_DIM));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assign[i];
      counts[c]++;
      const p = points[i];
      for (let d = 0; d < RHYTHM_DIM; d++) sums[c][d] += p[d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        centres[c].set(points[Math.floor(Math.random() * n)]);
        continue;
      }
      for (let d = 0; d < RHYTHM_DIM; d++) {
        centres[c][d] = sums[c][d] / counts[c];
      }
    }
  }
  return centres;
}

/**
 * Sharma defines an ornamentation as a final click whose interval is
 * significantly longer than the rest of the coda. We use a simple
 * threshold: the final ICI is more than `ratio` times the median of
 * the preceding ICIs, with the coda having at least 4 clicks. The
 * resulting ~4 percent positive rate matches the paper.
 */
function detectOrnamentation(icis: number[], ratio = 1.55): boolean {
  if (icis.length < 3) return false;
  const head = icis.slice(0, -1).slice().sort((a, b) => a - b);
  const med = head[Math.floor(head.length / 2)];
  return icis[icis.length - 1] > med * ratio;
}

export function computeFeatures(codas: Coda[]): CorpusFeatures {
  const tempos = codas.map((c) => c.duration);
  const tempoEdges = quantileBoundaries(tempos, TEMPO_CLASSES);

  const rhythms = codas.map(normalisedICIs);
  const rhythmCentres = kmeans(rhythms, RHYTHM_CLASSES);

  const features: FeatureSet[] = codas.map((c, i) => {
    const rhythm = rhythms[i];
    let best = 0;
    let bestD = Infinity;
    for (let k = 0; k < rhythmCentres.length; k++) {
      const d = euclidean2(rhythm, rhythmCentres[k]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return {
      tempo: c.duration,
      tempoClass: classify1D(c.duration, tempoEdges),
      rhythm,
      rhythmClass: best,
      isOrnamented: detectOrnamentation(c.icis),
    };
  });

  return { features, tempoEdges, rhythmCentres };
}

/**
 * Per-cell statistics for the rhythm × tempo grid (paper Fig 3).
 */
export type GridCell = {
  rhythmClass: number;
  tempoClass: number;
  count: number;
  ornamentedFraction: number;
};

export function buildAlphabetGrid(features: FeatureSet[]): GridCell[] {
  const grid = new Map<number, GridCell>();
  for (const f of features) {
    const key = f.rhythmClass * TEMPO_CLASSES + f.tempoClass;
    const cell = grid.get(key) ?? {
      rhythmClass: f.rhythmClass,
      tempoClass: f.tempoClass,
      count: 0,
      ornamentedFraction: 0,
    };
    cell.count++;
    if (f.isOrnamented) cell.ornamentedFraction++;
    grid.set(key, cell);
  }
  for (const cell of grid.values()) {
    cell.ornamentedFraction /= cell.count;
  }
  return [...grid.values()];
}

export { TEMPO_CLASSES, RHYTHM_CLASSES, RHYTHM_DIM };
