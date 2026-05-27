"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Coda } from "@/lib/dataset";
import type { FeatureSet } from "@/lib/features";
import { ACCENT_CYAN, ACCENT_PINK } from "@/lib/colormap";

type Props = {
  codas: Coda[];
  features: FeatureSet[];
};

/**
 * Reproduce paper figure 2C: the adjacent-vs-random duration-difference
 * histogram is the central piece, because that is where the rubato
 * claim is actually visible (pink distribution far narrower than blue).
 *
 *   adjacent (pink) ─ Duration_{n+1} - Duration_n  for every consecutive
 *                     same-class same-whale pair.
 *   random   (blue) ─ Duration_a   - Duration_b   for random pairs of
 *                     same-tempo-class codas anywhere in the corpus.
 *
 * If codas were independent draws from a fixed template the two
 * distributions would look identical. In the real data the adjacent
 * distribution is tightly peaked at zero and the random distribution
 * is roughly twice as wide. That's the rubato evidence.
 *
 * Below the histogram we show a small strip of example sequences (one
 * coloured line per whale, same-class consecutive durations), echoing
 * the right side of Fig 2C.
 */
function computeStats(
  codas: Coda[],
  features: FeatureSet[],
): {
  adjacentDiffs: number[];
  randomDiffs: number[];
  series: number[][];
  meanAbsAdj: number;
  meanAbsRand: number;
} {
  // Build per-(whale, class) ordered sequences.
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < codas.length; i++) {
    const key = `${codas[i].whaleId}|${features[i].rhythmClass}|${features[i].tempoClass}`;
    const list = byKey.get(key) ?? [];
    list.push(i);
    byKey.set(key, list);
  }
  const adjacentDiffs: number[] = [];
  const sampleCandidates: number[][] = [];
  for (const list of byKey.values()) {
    if (list.length < 4) continue;
    const durations = list.map((idx) => codas[idx].duration);
    sampleCandidates.push(durations);
    for (let j = 0; j < durations.length - 1; j++) {
      adjacentDiffs.push(durations[j + 1] - durations[j]);
    }
  }
  // Pick the four most informative example sequences (longest enough to
  // show drift, but capped so dense whales don't smear into a blob).
  const MAX_SAMPLES = 4;
  const MAX_LEN = 60;
  const chosen = sampleCandidates
    .filter((s) => s.length >= 10)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_SAMPLES);
  const sampleSeries: number[][] = chosen.map((s) => {
    if (s.length <= MAX_LEN) return s;
    const step = s.length / MAX_LEN;
    const out: number[] = [];
    for (let i = 0; i < MAX_LEN; i++) out.push(s[Math.floor(i * step)]);
    return out;
  });

  // Random same-tempo-class pairs: bigger sample so the histogram is smooth.
  const byTempo = new Map<number, number[]>();
  for (let i = 0; i < codas.length; i++) {
    const t = features[i].tempoClass;
    const list = byTempo.get(t) ?? [];
    list.push(i);
    byTempo.set(t, list);
  }
  const randomDiffs: number[] = [];
  const keys = [...byTempo.keys()].filter((k) => (byTempo.get(k)?.length ?? 0) >= 50);
  for (let n = 0; n < 20000; n++) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    const l = byTempo.get(k)!;
    const i = l[Math.floor(Math.random() * l.length)];
    const j = l[Math.floor(Math.random() * l.length)];
    if (i === j) continue;
    randomDiffs.push(codas[i].duration - codas[j].duration);
  }

  const meanAbs = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length;
  return {
    adjacentDiffs,
    randomDiffs,
    series: sampleSeries,
    meanAbsAdj: meanAbs(adjacentDiffs),
    meanAbsRand: meanAbs(randomDiffs),
  };
}

const RANGE = 0.8; // s, x-axis half-width
const BINS = 121;
const KDE_BANDWIDTH = 0.025; // s, smoothing width for the kernel density estimate

/**
 * Gaussian kernel density estimate sampled on a uniform grid. Returns
 * an array of length `bins`, normalised so its area integrates to 1.
 * Smoothing avoids the pathology where a raw histogram puts almost
 * every adjacent-rubato delta into a single zero-centred bin and
 * crushes the rest of the y-axis.
 */
function kde(values: number[], bins: number, lo: number, hi: number, bandwidth: number): Float32Array {
  const out = new Float32Array(bins);
  if (values.length === 0) return out;
  const w = (hi - lo) / bins;
  const invSigma = 1 / bandwidth;
  const norm = 1 / (bandwidth * Math.sqrt(2 * Math.PI));
  for (let b = 0; b < bins; b++) {
    const x = lo + (b + 0.5) * w;
    let s = 0;
    for (let i = 0; i < values.length; i++) {
      const z = (x - values[i]) * invSigma;
      s += Math.exp(-0.5 * z * z);
    }
    out[b] = (s / values.length) * norm;
  }
  return out;
}

export default function RubatoPanel({ codas, features }: Props) {
  const stats = useMemo(() => computeStats(codas, features), [codas, features]);
  const adjHist = useMemo(
    () => kde(stats.adjacentDiffs, BINS, -RANGE, RANGE, KDE_BANDWIDTH),
    [stats.adjacentDiffs],
  );
  const randHist = useMemo(
    () => kde(stats.randomDiffs, BINS, -RANGE, RANGE, KDE_BANDWIDTH),
    [stats.randomDiffs],
  );

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 540;
      const cssH = canvas.clientHeight || 240;
      const tw = Math.max(1, Math.floor(cssW * dpr));
      const th = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }
      const ctxMaybe = canvas.getContext("2d");
      if (!ctxMaybe) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const ctx = ctxMaybe;
      ctx.fillStyle = "rgba(4,6,15,1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const pad = 18 * dpr;
      const labelH = 18 * dpr;
      const seriesH = Math.max(40 * dpr, Math.min(70 * dpr, canvas.height * 0.30));
      const histTop = pad;
      const histBottom = canvas.height - pad - seriesH - 26 * dpr;
      const histH = histBottom - histTop;
      const histW = canvas.width - 2 * pad;

      // Histogram peak (used for scaling both distributions to the same axis).
      let peak = 0;
      for (let i = 0; i < BINS; i++) {
        if (adjHist[i] > peak) peak = adjHist[i];
        if (randHist[i] > peak) peak = randHist[i];
      }
      peak = Math.max(peak, 0.001);

      const xAt = (v: number) =>
        pad + ((v + RANGE) / (2 * RANGE)) * histW;
      const yAt = (d: number) =>
        histBottom - (d / peak) * histH;

      // Faint x=0 reference.
      ctx.strokeStyle = "rgba(255,255,255,0.10)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xAt(0), histTop);
      ctx.lineTo(xAt(0), histBottom);
      ctx.stroke();

      // Filled smooth curve (kde) for each distribution.
      function fillCurve(
        h: Float32Array,
        fill: string,
        stroke: string,
      ) {
        ctx.beginPath();
        ctx.moveTo(xAt(-RANGE), histBottom);
        for (let i = 0; i < BINS; i++) {
          const x = xAt(-RANGE + ((i + 0.5) / BINS) * 2 * RANGE);
          const y = yAt(h[i]);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(xAt(RANGE), histBottom);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.4 * dpr;
        ctx.stroke();
      }

      // Draw the broader (random) distribution first so the narrower
      // (adjacent) one sits in front.
      fillCurve(randHist, "rgba(86,176,255,0.20)", "rgba(120,190,255,0.85)");
      fillCurve(adjHist, "rgba(255,122,219,0.30)", "rgba(255,160,230,0.95)");

      // X axis ticks.
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "center";
      for (const v of [-0.6, -0.3, 0, 0.3, 0.6]) {
        ctx.fillText(`${v}`, xAt(v), histBottom + 12 * dpr);
      }
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Δ duration (s)", canvas.width / 2, histBottom + 24 * dpr);

      // Legend top-right.
      const legY = histTop + 4 * dpr;
      const legX = pad + 6 * dpr;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,160,230,0.95)";
      ctx.fillRect(legX, legY - 4 * dpr, 9 * dpr, 4 * dpr);
      ctx.fillStyle = "rgba(255,255,255,0.80)";
      ctx.font = `${Math.round(10 * dpr)}px ui-sans-serif`;
      ctx.fillText("adjacent (rubato)", legX + 13 * dpr, legY);
      ctx.fillStyle = "rgba(120,190,255,0.95)";
      ctx.fillRect(legX, legY + 10 * dpr, 9 * dpr, 4 * dpr);
      ctx.fillStyle = "rgba(255,255,255,0.80)";
      ctx.fillText("random same-tempo", legX + 13 * dpr, legY + 14 * dpr);

      // Example sequences strip at the bottom: one row per whale, each
      // row normalised to its own min..max so the drift inside each
      // sequence is visible regardless of absolute duration.
      const seriesTop = canvas.height - pad - seriesH;
      const seriesBottom = canvas.height - pad - 4 * dpr;
      const seriesPad = 10 * dpr;
      const seriesCount = Math.max(1, stats.series.length);
      const subW = (histW - seriesPad * (seriesCount - 1)) / seriesCount;
      const subH = seriesBottom - seriesTop;

      for (let si = 0; si < seriesCount; si++) {
        const x0 = pad + si * (subW + seriesPad);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(x0, seriesTop, subW, subH);
        ctx.strokeStyle = "rgba(86,224,255,0.18)";
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(x0 + 0.5, seriesTop + 0.5, subW - 1, subH - 1);
      }

      stats.series.forEach((series, si) => {
        const x0 = pad + si * (subW + seriesPad);
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of series) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const span = Math.max(0.01, hi - lo);
        const projX = (i: number) =>
          x0 + (i / (series.length - 1 || 1)) * subW;
        const projY = (v: number) =>
          seriesBottom - 4 * dpr - ((v - lo) / span) * (subH - 8 * dpr);

        ctx.strokeStyle = "rgba(255,160,230,0.85)";
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let i = 0; i < series.length; i++) {
          const x = projX(i);
          const y = projY(series[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.fillStyle = "rgba(255,200,230,0.95)";
        for (let i = 0; i < series.length; i++) {
          ctx.beginPath();
          ctx.arc(projX(i), projY(series[i]), 1.7 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.textAlign = "left";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.fillText(
        "duration over consecutive same-type codas, one whale per panel",
        pad,
        seriesTop - 4 * dpr,
      );

      // Summary line.
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace`;
      ctx.textAlign = "left";
      ctx.fillStyle = ACCENT_PINK;
      ctx.fillText(
        `adjacent ${(stats.meanAbsAdj * 1000).toFixed(0)} ms`,
        pad,
        canvas.height - 4 * dpr,
      );
      ctx.textAlign = "right";
      ctx.fillStyle = ACCENT_CYAN;
      ctx.fillText(
        `random ${(stats.meanAbsRand * 1000).toFixed(0)} ms`,
        canvas.width - pad,
        canvas.height - 4 * dpr,
      );

      void labelH;
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [adjHist, randHist, stats]);

  return <canvas ref={canvasRef} className="w-full h-full rounded-lg" />;
}
