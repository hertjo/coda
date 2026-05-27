"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DialogueCoda, DialogueDataset } from "@/lib/dataset";
import { biolumin, rgbToCss } from "@/lib/colormap";
import { playDialogue, type DialogueController } from "@/lib/audio";

type Props = {
  data: DialogueDataset;
};

export default function DialogueRibbon({ data }: Props) {
  const recordings = useMemo(() => {
    return [...data.recordings.entries()]
      .map(([id, list]) => ({ id, list }))
      .filter((r) => r.list.length >= 12) // skip very short
      .sort((a, b) => b.list.length - a.list.length); // longest first
  }, [data]);

  const [recIdx, setRecIdx] = useState(0);
  const rec = recordings[recIdx];

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<DialogueController | null>(null);
  const [playing, setPlaying] = useState(false);
  // Bumped each animation frame during playback so the cursor redraws.
  const [, setTick] = useState(0);

  // Stop playback when switching recordings or unmounting.
  useEffect(() => {
    return () => {
      controllerRef.current?.stop();
      controllerRef.current = null;
    };
  }, []);
  useEffect(() => {
    controllerRef.current?.stop();
    controllerRef.current = null;
    setPlaying(false);
  }, [recIdx]);

  // Animation loop while playing so the sweeping cursor moves.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const loop = () => {
      setTick((t) => t + 1);
      const c = controllerRef.current;
      if (c && c.isDone()) {
        controllerRef.current = null;
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const togglePlay = async () => {
    if (!rec) return;
    if (playing) {
      controllerRef.current?.stop();
      controllerRef.current = null;
      setPlaying(false);
      return;
    }
    const events = rec.list.map((c) => ({
      startSec: c.startSeconds,
      icis: c.icis,
      whale: c.whale,
    }));
    setPlaying(true);
    try {
      const ctrl = await playDialogue(events, 12);
      controllerRef.current = ctrl;
    } catch (e) {
      console.error("[coda] playDialogue failed", e);
      setPlaying(false);
    }
  };

  const whales = useMemo(() => {
    if (!rec) return [];
    const set = new Set<number>();
    for (const c of rec.list) set.add(c.whale);
    return [...set].sort((a, b) => a - b);
  }, [rec]);

  const timeRange = useMemo(() => {
    if (!rec) return { t0: 0, t1: 1 };
    const t0 = rec.list[0].startSeconds;
    const t1 =
      rec.list[rec.list.length - 1].startSeconds +
      rec.list[rec.list.length - 1].duration;
    return { t0, t1 };
  }, [rec]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas || !rec) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 700;
      const cssH = canvas.clientHeight || 220;
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

      const padL = 56 * dpr;
      const padR = 22 * dpr;
      const padT = 22 * dpr;
      const padB = 10 * dpr;
      const span = Math.max(0.001, timeRange.t1 - timeRange.t0);
      const project = (t: number) =>
        padL + ((t - timeRange.t0) / span) * (canvas.width - padL - padR);

      const trackH = (canvas.height - padT - padB) / Math.max(1, whales.length);

      // Track lanes.
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < whales.length; i++) {
        const y = padT + (i + 0.5) * trackH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(canvas.width - padR, y);
        ctx.stroke();
      }

      // Lane labels.
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `${Math.round(10 * dpr)}px ui-monospace`;
      ctx.textAlign = "right";
      for (let i = 0; i < whales.length; i++) {
        const y = padT + (i + 0.5) * trackH;
        ctx.fillText(`whale ${whales[i]}`, padL - 8 * dpr, y + 4 * dpr);
      }

      // Draw each coda as a click train along its whale lane.
      const codasByWhale = new Map<number, DialogueCoda[]>();
      for (const c of rec.list) {
        const list = codasByWhale.get(c.whale) ?? [];
        list.push(c);
        codasByWhale.set(c.whale, list);
      }

      // Per-whale colours.
      for (let wi = 0; wi < whales.length; wi++) {
        const w = whales[wi];
        const y = padT + (wi + 0.5) * trackH;
        const list = codasByWhale.get(w) ?? [];
        const [r, g, b] = biolumin(0.25 + (wi / Math.max(1, whales.length - 1)) * 0.6);

        for (const c of list) {
          const x0 = project(c.startSeconds);
          const x1 = project(c.startSeconds + c.duration);
          // Background bar for the coda.
          ctx.fillStyle = rgbToCss([r, g, b], 0.18);
          ctx.fillRect(x0, y - trackH * 0.30, x1 - x0, trackH * 0.60);
          // Individual clicks.
          ctx.strokeStyle = rgbToCss([r, g, b], 0.95);
          ctx.lineWidth = 1.4 * dpr;
          let t = c.startSeconds;
          ctx.beginPath();
          ctx.moveTo(project(t), y - trackH * 0.30);
          ctx.lineTo(project(t), y + trackH * 0.30);
          ctx.stroke();
          for (const ici of c.icis) {
            t += ici;
            ctx.beginPath();
            ctx.moveTo(project(t), y - trackH * 0.30);
            ctx.lineTo(project(t), y + trackH * 0.30);
            ctx.stroke();
          }
        }
      }

      // Connection lines between consecutive codas across whales: shows
      // "turn-taking" (paper Fig 1). Connect end of one coda to start of
      // the next coda by a different whale within 2 s.
      const sorted = rec.list.slice().sort((a, b) => a.startSeconds - b.startSeconds);
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([4 * dpr, 4 * dpr]);
      for (let i = 0; i < sorted.length - 1; i++) {
        const a = sorted[i];
        const b = sorted[i + 1];
        if (a.whale === b.whale) continue;
        const gap = b.startSeconds - (a.startSeconds + a.duration);
        if (gap < 0 || gap > 2) continue;
        const yA = padT + (whales.indexOf(a.whale) + 0.5) * trackH;
        const yB = padT + (whales.indexOf(b.whale) + 0.5) * trackH;
        ctx.beginPath();
        ctx.moveTo(project(a.startSeconds + a.duration), yA);
        ctx.lineTo(project(b.startSeconds), yB);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Time axis ticks along the top so they do not crowd the prev/next
      // button row that sits immediately below the canvas.
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "center";
      const tickStep = chooseTickStep(span);
      for (let t = Math.ceil(timeRange.t0 / tickStep) * tickStep; t < timeRange.t1; t += tickStep) {
        const x = project(t);
        ctx.fillText(`${t.toFixed(0)}s`, x, padT - 4 * dpr);
      }

      // Sweeping playback cursor.
      const ctrl = controllerRef.current;
      if (ctrl) {
        const simNow = ctrl.getSimNow();
        if (simNow >= timeRange.t0 && simNow <= timeRange.t1) {
          const cx = project(simNow);
          const grad = ctx.createLinearGradient(cx - 18 * dpr, 0, cx + 18 * dpr, 0);
          grad.addColorStop(0, "rgba(255,200,255,0)");
          grad.addColorStop(0.5, "rgba(255,200,255,0.55)");
          grad.addColorStop(1, "rgba(255,200,255,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(cx - 18 * dpr, padT, 36 * dpr, canvas.height - padT - padB);
          ctx.strokeStyle = "rgba(255,255,255,0.85)";
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.moveTo(cx, padT);
          ctx.lineTo(cx, canvas.height - padB);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [rec, whales, timeRange]);

  return (
    <div className="w-full h-full flex flex-col">
      <canvas ref={canvasRef} className="w-full flex-1 min-h-0 rounded-lg" />
      <div className="flex items-center gap-2 mt-2 shrink-0">
        <button
          onClick={togglePlay}
          disabled={!rec}
          className="inline-flex items-center gap-1.5 rounded-md border border-cyan-400/55 bg-cyan-400/15 px-2 py-1 text-[10.5px] font-medium text-cyan-100 hover:bg-cyan-400/25 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/40"
          title="6x synthesised playback with stereo separation per whale"
        >
          {playing ? (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
              <rect x="1" y="1" width="2" height="6" />
              <rect x="5" y="1" width="2" height="6" />
            </svg>
          ) : (
            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
              <path d="M1 0.5 L1 7.5 L7 4 Z" />
            </svg>
          )}
          <span>{playing ? "stop" : "listen"}</span>
        </button>
        <button
          onClick={() => setRecIdx((i) => Math.max(0, i - 1))}
          disabled={recIdx === 0}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10.5px] text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-colors disabled:opacity-30"
        >
          prev
        </button>
        <button
          onClick={() => setRecIdx((i) => Math.min(recordings.length - 1, i + 1))}
          disabled={recIdx >= recordings.length - 1}
          className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10.5px] text-white/70 hover:text-white hover:bg-white/[0.06] hover:border-white/20 transition-colors disabled:opacity-30"
        >
          next
        </button>
        <span className="ml-auto text-[10px] text-white/35 truncate">
          {rec ? `${rec.list.length} codas · ${whales.length} whales` : ""}
        </span>
      </div>
    </div>
  );
}

function chooseTickStep(span: number): number {
  const candidates = [1, 2, 5, 10, 30, 60, 120];
  const target = span / 8;
  for (const c of candidates) if (c >= target) return c;
  return candidates[candidates.length - 1];
}
