/**
 * Two embeddings for the per-whale feature profiles.
 *
 *   pca   deterministic, linear, preserves global variance. Good when
 *         you want to read between-cluster distance as a quantity.
 *   umap  non-linear, neighbour-preserving. Good when local cluster
 *         structure is what you care about; with ~60 points and
 *         ~22-dim profiles, this is the one that actually reveals
 *         within-clan dialect groupings.
 *
 * Both return [n × 3] arrays normalised to fit in the unit sphere.
 */

import { UMAP } from "umap-js";
import { pca3 } from "./pca";

export type EmbedMethod = "pca" | "umap";

export type EmbedResult = {
  method: EmbedMethod;
  points: Array<[number, number, number]>;
  /** Variance explained per axis; only meaningful for PCA. */
  explained?: [number, number, number];
};

function normalise(points: Array<[number, number, number]>): Array<[number, number, number]> {
  if (points.length === 0) return [];
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const [x, y, z] of points) {
    cx += x;
    cy += y;
    cz += z;
  }
  cx /= points.length;
  cy /= points.length;
  cz /= points.length;
  let max = 0;
  for (const [x, y, z] of points) {
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d > max) max = d;
  }
  const s = max > 0 ? 2.0 / max : 1;
  return points.map(([x, y, z]) => [
    (x - cx) * s,
    (y - cy) * s,
    (z - cz) * s,
  ]);
}

/**
 * A simple seeded LCG so umap-js gets a deterministic random source.
 * The default umap-js random uses Math.random which changes each load.
 */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

export function embed(
  vectors: Float32Array[],
  method: EmbedMethod,
): EmbedResult {
  if (vectors.length === 0) return { method, points: [] };

  if (method === "pca") {
    const r = pca3(vectors);
    return {
      method,
      points: normalise(r.projected),
      explained: r.explained,
    };
  }

  // UMAP path. With n ~ 60 we want a small neighbourhood so local
  // structure has a chance to emerge.
  const nNeighbors = Math.max(4, Math.min(10, vectors.length - 1));
  const umap = new UMAP({
    nNeighbors,
    minDist: 0.25,
    nComponents: 3,
    spread: 1.2,
    random: seededRng(0xc0da),
  });
  const data = vectors.map((v) => Array.from(v));
  const out = umap.fit(data) as number[][];
  const points: Array<[number, number, number]> = out.map(([x, y, z]) => [x, y, z]);
  return { method, points: normalise(points) };
}
