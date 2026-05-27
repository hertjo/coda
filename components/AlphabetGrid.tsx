"use client";

import { useEffect, useMemo, useRef } from "react";
import { biolumin, rgbToCss } from "@/lib/colormap";
import {
  buildAlphabetGrid,
  RHYTHM_CLASSES,
  TEMPO_CLASSES,
  type FeatureSet,
} from "@/lib/features";

type Props = {
  features: FeatureSet[];
  selected: { rhythmClass: number; tempoClass: number } | null;
  onSelect: (rhythm: number, tempo: number) => void;
};

const PAD = 36;
const LEGEND_W = 56;

export default function AlphabetGrid({ features, selected, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cells = useMemo(() => buildAlphabetGrid(features), [features]);

  const maxCount = useMemo(
    () => cells.reduce((m, c) => Math.max(m, c.count), 1),
    [cells],
  );

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 600;
      const cssH = canvas.clientHeight || 400;
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

      const padL = PAD * dpr;
      const padT = PAD * dpr;
      const padR = (PAD + LEGEND_W) * dpr;
      const padB = PAD * dpr;
      const cellW = (canvas.width - padL - padR) / TEMPO_CLASSES;
      const cellH = (canvas.height - padT - padB) / RHYTHM_CLASSES;

      for (const cell of cells) {
        const x = padL + cell.tempoClass * cellW;
        const y = padT + cell.rhythmClass * cellH;
        const t = Math.pow(cell.count / maxCount, 0.6);
        const [r, g, b] = biolumin(t);
        ctx.fillStyle = rgbToCss([r, g, b], 0.95);
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);

        // Ornament prevalence: small pink wedge in the upper-right corner.
        const orn = cell.ornamentedFraction;
        if (orn > 0.01) {
          const wedge = Math.min(cellW, cellH) * 0.32 * Math.sqrt(orn);
          ctx.beginPath();
          ctx.moveTo(x + cellW - 2, y + 2);
          ctx.lineTo(x + cellW - 2 - wedge, y + 2);
          ctx.lineTo(x + cellW - 2, y + 2 + wedge);
          ctx.closePath();
          ctx.fillStyle = "rgba(255,120,230,0.85)";
          ctx.fill();
        }

        // Highlight the selected cell.
        if (
          selected &&
          cell.rhythmClass === selected.rhythmClass &&
          cell.tempoClass === selected.tempoClass
        ) {
          ctx.strokeStyle = "rgba(255,255,255,0.9)";
          ctx.lineWidth = 2 * dpr;
          ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
        }
      }

      // Axis labels.
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.font = `${Math.round(10 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "center";
      for (let t = 0; t < TEMPO_CLASSES; t++) {
        ctx.fillText(
          `T${t + 1}`,
          padL + (t + 0.5) * cellW,
          canvas.height - padB + 14 * dpr,
        );
      }
      ctx.textAlign = "right";
      for (let r = 0; r < RHYTHM_CLASSES; r++) {
        ctx.fillText(`R${r + 1}`, padL - 6 * dpr, padT + (r + 0.7) * cellH);
      }
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.fillText(
        "tempo class (short to long)",
        padL,
        canvas.height - 6 * dpr,
      );
      ctx.save();
      ctx.translate(8 * dpr, padT);
      ctx.rotate(Math.PI / 2);
      ctx.fillText("rhythm cluster (1 to 18)", 0, 0);
      ctx.restore();

      // Legend on the right.
      const legX = canvas.width - padR + 18 * dpr;
      const legY = padT;
      const legH = canvas.height - padT - padB;
      const legW = 8 * dpr;
      const grad = ctx.createLinearGradient(0, legY + legH, 0, legY);
      grad.addColorStop(0, rgbToCss(biolumin(0)));
      grad.addColorStop(0.4, rgbToCss(biolumin(0.4)));
      grad.addColorStop(0.7, rgbToCss(biolumin(0.7)));
      grad.addColorStop(1, rgbToCss(biolumin(1)));
      ctx.fillStyle = grad;
      ctx.fillRect(legX, legY, legW, legH);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${maxCount} codas`, legX + legW + 4 * dpr, legY + 8 * dpr);
      ctx.fillText("1", legX + legW + 4 * dpr, legY + legH);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [cells, maxCount, selected]);

  // Click handling: map canvas coords back to (rhythm, tempo) class.
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const x = (e.clientX - rect.left) * dpr;
    const y = (e.clientY - rect.top) * dpr;
    const padL = PAD * dpr;
    const padT = PAD * dpr;
    const padR = (PAD + LEGEND_W) * dpr;
    const padB = PAD * dpr;
    const cellW = (canvas.width - padL - padR) / TEMPO_CLASSES;
    const cellH = (canvas.height - padT - padB) / RHYTHM_CLASSES;
    if (x < padL || y < padT || x > canvas.width - padR || y > canvas.height - padB) return;
    const tempo = Math.floor((x - padL) / cellW);
    const rhythm = Math.floor((y - padT) / cellH);
    if (
      tempo >= 0 &&
      tempo < TEMPO_CLASSES &&
      rhythm >= 0 &&
      rhythm < RHYTHM_CLASSES
    ) {
      onSelect(rhythm, tempo);
    }
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="w-full h-full rounded-lg cursor-pointer"
    />
  );
}
