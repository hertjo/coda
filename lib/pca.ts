/**
 * Two-component PCA on a small set of feature vectors.
 *
 * For ~60 points × ~22 features, power iteration on the column-centred,
 * column-standardised covariance matrix is deterministic and converges
 * in well under a millisecond. Returns an (n × 2) projection plus the
 * percent of variance captured by each axis, which the UI shows so the
 * reader knows how much of the structure the picture preserves.
 */

export type PcaResult = {
  /** projected[i] = [x, y, z] for the i-th input vector */
  projected: Array<[number, number, number]>;
  /** fraction of total variance explained by PC1, PC2, PC3 */
  explained: [number, number, number];
};

export function pca3(vectors: Float32Array[]): PcaResult {
  const n = vectors.length;
  if (n === 0) return { projected: [], explained: [0, 0, 0] };
  const d = vectors[0].length;

  // Column-centre and column-standardise so dimensions with different
  // scales (mean tempo in seconds vs rhythm histogram fractions in [0,1])
  // contribute comparably.
  const meanV = new Float64Array(d);
  for (let i = 0; i < n; i++) for (let k = 0; k < d; k++) meanV[k] += vectors[i][k];
  for (let k = 0; k < d; k++) meanV[k] /= n;

  const std = new Float64Array(d);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < d; k++) {
      const v = vectors[i][k] - meanV[k];
      std[k] += v * v;
    }
  }
  for (let k = 0; k < d; k++) std[k] = Math.sqrt(std[k] / Math.max(1, n - 1)) || 1;

  // Build the centred / scaled data matrix X (n × d), row-major.
  const X = new Float64Array(n * d);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < d; k++) {
      X[i * d + k] = (vectors[i][k] - meanV[k]) / std[k];
    }
  }

  // Covariance matrix C = X^T X / (n - 1), size d × d.
  const C = new Float64Array(d * d);
  for (let a = 0; a < d; a++) {
    for (let b = a; b < d; b++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += X[i * d + a] * X[i * d + b];
      const cov = s / Math.max(1, n - 1);
      C[a * d + b] = cov;
      C[b * d + a] = cov;
    }
  }

  // Top three eigenpairs by power iteration with sequential deflation.
  const v1 = powerIter(C, d);
  const lam1 = rayleigh(C, v1, d);
  const C2 = deflate(C, v1, lam1, d);
  const v2 = powerIter(C2, d);
  const lam2 = rayleigh(C, v2, d);
  const C3 = deflate(C2, v2, lam2, d);
  const v3 = powerIter(C3, d);
  const lam3 = rayleigh(C, v3, d);

  let totalVar = 0;
  for (let k = 0; k < d; k++) totalVar += C[k * d + k];

  const projected: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let k = 0; k < d; k++) {
      x += X[i * d + k] * v1[k];
      y += X[i * d + k] * v2[k];
      z += X[i * d + k] * v3[k];
    }
    projected.push([x, y, z]);
  }

  return {
    projected,
    explained: [lam1 / totalVar, lam2 / totalVar, lam3 / totalVar],
  };
}

function deflate(M: Float64Array, v: Float64Array, lam: number, d: number): Float64Array {
  const out = new Float64Array(d * d);
  for (let i = 0; i < d * d; i++) out[i] = M[i];
  for (let a = 0; a < d; a++) {
    for (let b = 0; b < d; b++) {
      out[a * d + b] -= lam * v[a] * v[b];
    }
  }
  return out;
}

function powerIter(M: Float64Array, d: number, iters = 80): Float64Array {
  let v = new Float64Array(d);
  // Deterministic seed avoids the small random jitter that would
  // otherwise re-orient the projection on every page load.
  for (let k = 0; k < d; k++) v[k] = Math.sin(k * 1.234 + 0.7) * 0.5 + 0.5;
  normalize(v);
  for (let it = 0; it < iters; it++) {
    const next = new Float64Array(d);
    for (let a = 0; a < d; a++) {
      let s = 0;
      for (let b = 0; b < d; b++) s += M[a * d + b] * v[b];
      next[a] = s;
    }
    normalize(next);
    v = next;
  }
  return v;
}

function rayleigh(M: Float64Array, v: Float64Array, d: number): number {
  let s = 0;
  for (let a = 0; a < d; a++) {
    let inner = 0;
    for (let b = 0; b < d; b++) inner += M[a * d + b] * v[b];
    s += v[a] * inner;
  }
  return s;
}

function normalize(v: Float64Array): void {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const norm = Math.sqrt(s) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
}
