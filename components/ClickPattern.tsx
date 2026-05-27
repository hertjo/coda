"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Coda } from "@/lib/dataset";
import { playCoda } from "@/lib/audio";
import { ACCENT_CYAN, ACCENT_PINK } from "@/lib/colormap";

const SAMPLE_URL = "/sperm-whale.ogg";

type Props = {
  coda: Coda | null;
  /** Codas in the same (rhythm, tempo) cell, for the small "neighbour" stripe. */
  siblings: Coda[];
};

export default function ClickPattern({ coda, siblings }: Props) {
  const [playingAt, setPlayingAt] = useState<number | null>(null);
  const [recordingPlaying, setRecordingPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const audio = new Audio(SAMPLE_URL);
    audio.preload = "auto";
    audio.onended = () => setRecordingPlaying(false);
    audio.onpause = () => setRecordingPlaying(false);
    audioRef.current = audio;
    return () => {
      audio.pause();
      audio.src = "";
      audioRef.current = null;
    };
  }, []);

  const toggleRecording = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (recordingPlaying) {
      audio.pause();
      audio.currentTime = 0;
      setRecordingPlaying(false);
    } else {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      setRecordingPlaying(true);
    }
  };

  // Layout the click times for the main coda.
  const clickTimes = useMemo(() => {
    if (!coda) return [];
    const times = [0];
    for (const ici of coda.icis) times.push(times[times.length - 1] + ici);
    return times;
  }, [coda]);

  const maxDuration = useMemo(() => {
    if (!coda) return 1;
    return Math.max(0.4, coda.duration * 1.05);
  }, [coda]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 480;
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

      const pad = 26 * dpr;
      const W = canvas.width - 2 * pad;
      const H = canvas.height - 2 * pad;
      const project = (t: number) => pad + (t / maxDuration) * W;

      // Time grid: faint vertical lines every 100ms.
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let t = 0; t <= maxDuration; t += 0.1) {
        ctx.beginPath();
        ctx.moveTo(project(t), pad);
        ctx.lineTo(project(t), pad + H);
        ctx.stroke();
      }
      // Axis tick labels.
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "center";
      for (let t = 0; t <= maxDuration; t += 0.2) {
        ctx.fillText(`${t.toFixed(1)}s`, project(t), pad + H + 14 * dpr);
      }

      // Sibling codas, faint, stacked above the main strip.
      const stripeY = pad + H * 0.15;
      const stripeH = H * 0.20;
      const showSiblings = siblings.slice(0, 16);
      for (let si = 0; si < showSiblings.length; si++) {
        const s = showSiblings[si];
        let acc = 0;
        const sTimes: number[] = [0];
        for (const ici of s.icis) {
          acc += ici;
          sTimes.push(acc);
        }
        const y = stripeY + (si / Math.max(1, showSiblings.length - 1)) * stripeH;
        for (const t of sTimes) {
          ctx.fillStyle = "rgba(120,180,230,0.30)";
          ctx.fillRect(project(t) - 0.6 * dpr, y - 1.4 * dpr, 1.2 * dpr, 2.8 * dpr);
        }
      }

      // Main coda click strip.
      const mainY = pad + H * 0.55;
      const tickH = H * 0.32;
      const now = audioNow();
      for (let i = 0; i < clickTimes.length; i++) {
        const t = clickTimes[i];
        const x = project(t);
        // Glow if currently sounding.
        const dt = playingAt == null ? Infinity : now - (playingAt + t);
        const alpha = dt > 0 && dt < 0.25 ? 1 - dt / 0.25 : 0;
        if (alpha > 0) {
          const grad = ctx.createRadialGradient(x, mainY, 0, x, mainY, 18 * dpr);
          grad.addColorStop(0, `rgba(255,140,230,${alpha})`);
          grad.addColorStop(1, "rgba(255,140,230,0)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - 20 * dpr, mainY - 20 * dpr, 40 * dpr, 40 * dpr);
        }
        ctx.strokeStyle = alpha > 0 ? ACCENT_PINK : ACCENT_CYAN;
        ctx.lineWidth = 2 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, mainY - tickH / 2);
        ctx.lineTo(x, mainY + tickH / 2);
        ctx.stroke();
      }

      // ICI labels between clicks.
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.round(9 * dpr)}px ui-monospace`;
      ctx.textAlign = "center";
      for (let i = 0; i < (coda?.icis.length ?? 0); i++) {
        const x = (project(clickTimes[i]) + project(clickTimes[i + 1])) / 2;
        const y = mainY - tickH / 2 - 6 * dpr;
        ctx.fillText(`${(coda!.icis[i] * 1000).toFixed(0)}`, x, y);
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [coda, clickTimes, maxDuration, playingAt, siblings]);

  const onPlay = () => {
    if (!coda) return;
    setPlayingAt(audioNow());
    playCoda(coda.icis);
    setTimeout(() => setPlayingAt(null), Math.max(800, coda.duration * 1000 + 600));
  };

  return (
    <div className="w-full h-full flex flex-col">
      <canvas
        ref={canvasRef}
        className="w-full block rounded-lg flex-1 min-h-0"
      />
      <div className="flex items-center gap-2 mt-2.5 shrink-0">
        <button
          onClick={onPlay}
          disabled={!coda}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/55 bg-cyan-400/15 px-3.5 py-1.5 text-[12px] font-medium text-cyan-100 shadow-[0_0_0_1px_rgba(86,224,255,0.18),0_0_18px_rgba(86,224,255,0.18)] hover:bg-cyan-400/25 hover:text-white transition-colors disabled:opacity-25 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-white/40 disabled:shadow-none"
        >
          <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden>
            <path d="M1.5 1 L1.5 8 L7.5 4.5 Z" />
          </svg>
          <span>synth this coda</span>
        </button>
        <button
          onClick={toggleRecording}
          className="inline-flex items-center gap-2 rounded-lg border border-pink-400/55 bg-pink-400/10 px-3.5 py-1.5 text-[12px] font-medium text-pink-100 shadow-[0_0_0_1px_rgba(255,122,219,0.16),0_0_18px_rgba(255,122,219,0.18)] hover:bg-pink-400/20 hover:text-white transition-colors"
          title="Public-domain NOAA recording: rapid clicks and a coda from a pod of sperm whales"
        >
          {recordingPlaying ? (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden>
              <rect x="1.5" y="1.5" width="2.2" height="6" />
              <rect x="5.3" y="1.5" width="2.2" height="6" />
            </svg>
          ) : (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="currentColor" aria-hidden>
              <path d="M1.5 1 L1.5 8 L7.5 4.5 Z" />
            </svg>
          )}
          <span>real recording</span>
        </button>
        <span className="ml-auto text-[10px] text-white/35 truncate">
          synth uses this coda's icis · recording: noaa pd
        </span>
      </div>
    </div>
  );
}

function audioNow(): number {
  return performance.now() / 1000;
}
