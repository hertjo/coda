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
  scheduleClickAt(audio, time, 0, 4500, 0.35);
}

function scheduleClickAt(
  audio: AudioContext,
  time: number,
  pan: number,
  filterFreq: number,
  gainValue: number,
  destination?: AudioNode,
): AudioBufferSourceNode {
  const duration = 0.012; // 12 ms click envelope
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
  filt.frequency.value = filterFreq;
  filt.Q.value = 1.8;

  const gain = audio.createGain();
  gain.gain.value = gainValue;

  src.connect(filt);

  // StereoPannerNode is supported on every modern browser; if for any
  // reason it is missing we fall back to a plain mono path so playback
  // is never silent.
  if (typeof audio.createStereoPanner === "function") {
    const panner = audio.createStereoPanner();
    panner.pan.value = pan;
    filt.connect(panner);
    panner.connect(gain);
  } else {
    filt.connect(gain);
  }
  gain.connect(destination ?? audio.destination);

  src.start(time);
  src.stop(time + duration + 0.05);
  return src;
}

export type DialogueEvent = {
  startSec: number;
  icis: number[];
  whale: number;
};

export type DialogueController = {
  stop: () => void;
  /** Returns the current sim-time position based on the playback clock. */
  getSimNow: () => number;
  /** True once the cursor has run past the last scheduled click. */
  isDone: () => boolean;
};

/**
 * Play back a multi-whale dialogue by scheduling every click of every
 * coda with stereo pan and bandpass-centre variation per whale, so the
 * different speakers separate audibly even at high speedup factors.
 *
 *   pan       distributes whales across the stereo field from -0.85 to
 *             +0.85; you can pick out who is on which side.
 *   timbre    each whale gets a slightly different bandpass centre
 *             (~3.0 to ~6.5 kHz spread), giving them distinct voices
 *             reminiscent of body-size variation in real recordings.
 *   speed     plays back faster than wall-clock so multi-minute
 *             conversations are listenable in seconds.
 */
export async function playDialogue(
  events: DialogueEvent[],
  speed = 6,
): Promise<DialogueController | null> {
  if (events.length === 0) return null;
  const audio = getCtx();
  // Awaiting resume is the only thing that reliably unlocks audio after
  // a user gesture across chromium / safari / firefox.
  if (audio.state === "suspended") {
    try {
      await audio.resume();
    } catch {
      // ignore; we'll still try to schedule.
    }
  }
  console.log(
    `[coda] dialogue start: ${events.length} events, ctx ${audio.state}, sr ${audio.sampleRate}`,
  );
  const t0 = audio.currentTime + 0.15;
  const origin = events[0].startSec;

  // Master gain so stop() can ramp the whole stream to silence in a
  // single cheap operation instead of cancelling every buffer source.
  const master = audio.createGain();
  master.gain.value = 1;
  master.connect(audio.destination);

  // Distinct whale ids in this recording.
  const whaleIds = Array.from(new Set(events.map((e) => e.whale))).sort(
    (a, b) => a - b,
  );
  const idxOf = new Map<number, number>(
    whaleIds.map((w, i) => [w, i] as const),
  );

  const panOf = (whale: number) => {
    const i = idxOf.get(whale) ?? 0;
    if (whaleIds.length <= 1) return 0;
    return ((i / (whaleIds.length - 1)) - 0.5) * 1.2;
  };

  const freqOf = (whale: number) => {
    const i = idxOf.get(whale) ?? 0;
    if (whaleIds.length <= 1) return 4500;
    return 3200 + (3400 * i) / (whaleIds.length - 1);
  };

  // Click train within a coda plays at real time so individual clicks
  // are audible (real ICIs are 30 to 60 ms; speeding them up below 12 ms
  // collapses them into noise). Between codas we compress the silences
  // by `speed` so a multi-minute conversation does not take that long
  // to play back.
  const betweenCompress = Math.max(1, speed);

  // Build a piecewise-linear map from audio real-time to sim-time so
  // the dialogue ribbon cursor tracks the playback head exactly.
  const waypoints: Array<{ real: number; sim: number }> = [];
  waypoints.push({ real: t0, sim: origin });

  let prevSimEnd = origin;
  let realCursor = t0;
  for (const ev of events) {
    const gap = Math.max(0, ev.startSec - prevSimEnd);
    realCursor += gap / betweenCompress;
    waypoints.push({ real: realCursor, sim: ev.startSec });

    const pan = panOf(ev.whale);
    const freq = freqOf(ev.whale);
    scheduleClickAt(audio, realCursor, pan, freq, 0.5, master);
    let t = realCursor;
    let simT = ev.startSec;
    for (const ici of ev.icis) {
      t += ici;
      simT += ici;
      scheduleClickAt(audio, t, pan, freq, 0.5, master);
    }
    realCursor = t;
    waypoints.push({ real: realCursor, sim: simT });
    prevSimEnd = simT;
  }
  const endReal = realCursor + 0.2;

  function simAt(realTime: number): number {
    if (realTime <= waypoints[0].real) return waypoints[0].sim;
    if (realTime >= waypoints[waypoints.length - 1].real) {
      return waypoints[waypoints.length - 1].sim;
    }
    // Linear scan is fine for typical recording sizes (< a few hundred codas).
    for (let i = 1; i < waypoints.length; i++) {
      const a = waypoints[i - 1];
      const b = waypoints[i];
      if (realTime <= b.real) {
        const f = (realTime - a.real) / Math.max(1e-6, b.real - a.real);
        return a.sim + (b.sim - a.sim) * f;
      }
    }
    return waypoints[waypoints.length - 1].sim;
  }

  return {
    stop: () => {
      master.gain.cancelScheduledValues(audio.currentTime);
      master.gain.linearRampToValueAtTime(0, audio.currentTime + 0.05);
    },
    getSimNow: () => simAt(audio.currentTime),
    isDone: () => audio.currentTime >= endReal,
  };
}

export function audioContextTime(): number {
  try {
    return getCtx().currentTime;
  } catch {
    return 0;
  }
}
