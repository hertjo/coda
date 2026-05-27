/**
 * Synthesize a sperm whale coda click train.
 *
 * Real sperm whale clicks are broadband impulses centred around 1 to 30
 * kHz with multiple internal pulses (the "p1, p2, p3" structure from
 * the spermaceti organ). We approximate each click as a short noise
 * burst windowed by an exponential decay envelope. The result sounds
 * like a series of crisp "knocks" with the exact timing of the real
 * coda.
 */

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) {
    type Win = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    const W = globalThis as Win;
    const Ctor = window.AudioContext ?? W.webkitAudioContext;
    if (!Ctor) throw new Error("Web Audio not available");
    ctx = new Ctor();
  }
  return ctx;
}

/**
 * Play a coda by scheduling click bursts at the cumulative ICI offsets.
 * `icis` is the inter-click-interval array (seconds between consecutive
 * clicks; length = nClicks - 1).
 */
export function playCoda(icis: number[]): void {
  const audio = getCtx();
  if (audio.state === "suspended") audio.resume();
  const now = audio.currentTime + 0.05;

  // First click at time 0; each subsequent click offset by the cumulative ICI.
  const times: number[] = [now];
  for (const ici of icis) times.push(times[times.length - 1] + ici);

  for (const t of times) {
    scheduleClick(audio, t);
  }
}

function scheduleClick(audio: AudioContext, time: number): void {
  // Synthesised click: short burst of bandpassed noise with exponential decay.
  const duration = 0.012; // 12 ms
  const sampleCount = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, sampleCount, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < sampleCount; i++) {
    const env = Math.exp(-i / (audio.sampleRate * 0.0025));
    channel[i] = (Math.random() * 2 - 1) * env;
  }
  const src = audio.createBufferSource();
  src.buffer = buffer;
  const filt = audio.createBiquadFilter();
  filt.type = "bandpass";
  filt.frequency.value = 4500;
  filt.Q.value = 1.6;
  const gain = audio.createGain();
  gain.gain.value = 0.35;
  src.connect(filt);
  filt.connect(gain);
  gain.connect(audio.destination);
  src.start(time);
  src.stop(time + duration + 0.005);
}
