// Capture an animated demo of the studio. Drives the page through a
// short script (cell clicks, embedding toggle, dialogue navigation),
// captures one PNG frame per scene, then asks ffmpeg to assemble them
// into public/demo.gif.
//
// Usage:
//   npm run dev        # in one terminal
//   npm run record     # in another, once the dev server is up
//
// The script targets http://localhost:3000 by default; override with
// CODA_URL=... in the env.

import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL = process.env.CODA_URL ?? "http://localhost:3000";
const OUT = "public/demo.gif";
const W = 1400;
const H = 896;
const FPS = 6; // gif playback rate; one frame per scene step
const SETTLE_MS = 280;

const tmp = mkdtempSync(join(tmpdir(), "coda-record-"));
console.log(`scratch dir: ${tmp}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1.5,
});
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: "networkidle" });
// Give canvas-rendered panels and three.js a moment to draw their first frame.
await page.waitForTimeout(1500);

let frame = 0;
async function shoot() {
  const path = join(tmp, `f${String(frame).padStart(4, "0")}.png`);
  await page.screenshot({ path });
  frame++;
}

// Hold on a scene for `repeats` frames so it lingers in the looping gif.
async function hold(repeats = 1) {
  for (let i = 0; i < repeats; i++) await shoot();
}

await page.waitForTimeout(SETTLE_MS);
await hold(6); // opening still

// Walk through a handful of (rhythm, tempo) cells to show how the
// click-pattern and selected-cell panels respond. The alphabet panel
// is a single canvas with a click handler that computes the (rhythm,
// tempo) from the click position, so we have to drive it by clicking
// at the right CSS pixel inside the canvas.
//
// Layout constants must match components/AlphabetGrid.tsx:
//   PAD = 36, LEGEND_W = 56, 18 rhythm rows x 5 tempo columns.
const PAD = 36;
const LEGEND_W = 56;
const TEMPO_CLASSES = 5;
const RHYTHM_CLASSES = 18;
const canvas = page.locator(".phonetic-alphabet-canvas, canvas").first();
// Use the alphabet section's heading to find the right canvas reliably:
// the alphabet grid is the first canvas inside the column that holds the
// "phonetic alphabet" panel.
const alphabetCanvas = page
  .locator("section", { has: page.getByText("phonetic alphabet") })
  .locator("canvas")
  .first();
void canvas;
const box = await alphabetCanvas.boundingBox();
if (!box) throw new Error("alphabet canvas not found");
const cellW = (box.width - PAD - PAD - LEGEND_W) / TEMPO_CLASSES;
const cellH = (box.height - PAD - PAD) / RHYTHM_CLASSES;
const route = [
  [5, 0], [9, 2], [12, 4], [3, 1], [15, 3], [0, 2], [7, 4], [10, 1],
];
for (const [rhythm, tempo] of route) {
  const x = box.x + PAD + (tempo + 0.5) * cellW;
  const y = box.y + PAD + (rhythm + 0.5) * cellH;
  await page.mouse.click(x, y);
  await page.waitForTimeout(SETTLE_MS);
  await hold(3);
}

// Toggle the embedding to PCA, hold, then back to UMAP.
const pcaBtn = page.getByRole("button", { name: /^pca$/i }).first();
if (await pcaBtn.count()) {
  await pcaBtn.click();
  await page.waitForTimeout(SETTLE_MS);
  await hold(4);
}
const umapBtn = page.getByRole("button", { name: /^umap$/i }).first();
if (await umapBtn.count()) {
  await umapBtn.click();
  await page.waitForTimeout(SETTLE_MS);
  await hold(4);
}

// Step through a couple of recordings in the dialogue panel.
const nextBtn = page.getByRole("button", { name: /^next$/i }).first();
for (let i = 0; i < 2; i++) {
  if (!(await nextBtn.count())) break;
  await nextBtn.click();
  await page.waitForTimeout(SETTLE_MS);
  await hold(3);
}

await browser.close();

const frames = readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
console.log(`captured ${frames.length} frames, assembling gif...`);

execFileSync(
  "ffmpeg",
  [
    "-y",
    "-framerate", String(FPS),
    "-i", join(tmp, "f%04d.png"),
    "-vf",
    `scale=${W}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160[p];[s1][p]paletteuse=dither=sierra2_4a`,
    "-loop", "0",
    OUT,
  ],
  { stdio: "inherit" },
);

rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${OUT}`);
