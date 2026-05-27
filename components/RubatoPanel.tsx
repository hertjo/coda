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
 * Per Sharma 2024 Fig 2C: adjacent codas of the same (rhythm, tempo)
 * class by the same whale drift smoothly in duration. We compute the
 * mean abs drift between adjacent same-class same-whale pairs and
 * compare to the mean abs drift across random same-class pairs.
 */
function computeStats(codas: Coda[], features: FeatureSet[]): {
  adjacent: number;
  random: number;
  series: number[][]; // sample drift sequences
} {
  // Pairs of same-class consecutive codas by whale order.
  const adjacentDiffs: number[] = [];
  // Build sequences per (whale, class). Use index order from the CSV
  // (it preserves the original recording order within a date).
  const byKey = new Map<string, number[]>();
  for (let i = 0; i < codas.length; i++) {
    const key = `${codas[i].whaleId}|${features[i].rhythmClass}|${features[i].tempoClass}`;
    const list = byKey.get(key) ?? [];
    list.push(i);
    byKey.set(key, list);
  }
  const sampleSeries: number[][] = [];
  for (const list of byKey.values()) {
    if (list.length < 4) continue;
    const durations = list.map((idx) => codas[idx].duration);
    if (sampleSeries.length < 14) sampleSeries.push(durations);
    for (let j = 0; j < durations.length - 1; j++) {
      adjacentDiffs.push(Math.abs(durations[j + 1] - durations[j]));
    }
  }

  // Random same-class pairs (sample 10000).
  const byClass = new Map<string, number[]>();
  for (let i = 0; i < codas.length; i++) {
    const key = `${features[i].rhythmClass}|${features[i].tempoClass}`;
    const list = byClass.get(key) ?? [];
    list.push(i);
    byClass.set(key, list);
  }
  const randomDiffs: number[] = [];
  const classKeys = [...byClass.keys()].filter((k) => (byClass.get(k)?.length ?? 0) >= 8);
  for (let n = 0; n < 10000; n++) {
    const key = classKeys[Math.floor(Math.random() * classKeys.length)];
    const list = byClass.get(key)!;
    const i = list[Math.floor(Math.random() * list.length)];
    const j = list[Math.floor(Math.random() * list.length)];
    if (i === j) continue;
    randomDiffs.push(Math.abs(codas[i].duration - codas[j].duration));
  }

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    adjacent: mean(adjacentDiffs),
    random: mean(randomDiffs),
    series: sampleSeries,
  };
}

export default function RubatoPanel({ codas, features }: Props) {
  const stats = useMemo(() => computeStats(codas, features), [codas, features]);
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
      const cssH = canvas.clientHeight || 200;
      const tw = Math.max(1, Math.floor(cssW * dpr));
      const th = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== tw || canvas.height !== th) {
        canvas.width = tw;
        canvas.height = th;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(draw);
        return;
      }
      ctx.fillStyle = "rgba(4,6,15,1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const pad = 22 * dpr;
      const W = canvas.width - 2 * pad;
      const H = canvas.height - 2 * pad - 24 * dpr;

      const allValues = stats.series.flat();
      const lo = Math.min(...allValues);
      const hi = Math.max(...allValues);
      const projX = (i: number, len: number) => pad + (i / (len - 1 || 1)) * W;
      const projY = (v: number) => pad + H - ((v - lo) / Math.max(1e-6, hi - lo)) * H;

      // Faint grid.
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      for (let frac = 0; frac <= 1; frac += 0.25) {
        const y = pad + H * frac;
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + W, y);
        ctx.stroke();
      }

      // Sample drift series.
      stats.series.forEach((series, si) => {
        const t = si / stats.series.length;
        ctx.strokeStyle = `rgba(${Math.round(86 + (255 - 86) * t)},${Math.round(224 - 130 * t)},${Math.round(255 - 35 * t)},0.65)`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (let i = 0; i < series.length; i++) {
          const x = projX(i, series.length);
          const y = projY(series[i]);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        for (let i = 0; i < series.length; i++) {
          ctx.fillStyle = `rgba(${Math.round(86 + (255 - 86) * t)},${Math.round(224 - 130 * t)},${Math.round(255 - 35 * t)},0.9)`;
          ctx.beginPath();
          ctx.arc(projX(i, series.length), projY(series[i]), 1.8 * dpr, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Stats line at the bottom.
      const sy = canvas.height - 8 * dpr;
      ctx.fillStyle = ACCENT_CYAN;
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace`;
      ctx.textAlign = "left";
      ctx.fillText(
        `mean drift, adjacent same-class same-whale: ${(stats.adjacent * 1000).toFixed(1)} ms`,
        pad,
        sy,
      );
      ctx.fillStyle = ACCENT_PINK;
      ctx.textAlign = "right";
      ctx.fillText(
        `random same-class: ${(stats.random * 1000).toFixed(1)} ms`,
        canvas.width - pad,
        sy,
      );

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [stats]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full rounded-lg"
    />
  );
}
