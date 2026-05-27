/**
 * Loads the Sharma 2024 sperm whale datasets and shapes them into typed
 * records the rest of the app can consume.
 *
 * Two files:
 *
 *   codas.csv      8 719 annotated codas (Dataset 1 in the paper).
 *                  Fields: codaNUM2018, Date, nClicks, Duration,
 *                  ICI1..ICI9, CodaType, Clan, Unit, UnitNum, IDN
 *
 *   dialogues.csv  3 948 timestamped codas from on-animal DTags
 *                  (Dataset 2). Fields: REC, nClicks, Duration,
 *                  ICI1..ICI28, Whale, TsTo
 *
 * Source: https://github.com/pratyushasharma/sw-combinatoriality
 * Paper: Sharma et al. 2024, Nat Commun 15:3617.
 */

import { parseCsv } from "./parseCSV";

export type Coda = {
  id: number;
  date: string;
  nClicks: number;
  duration: number;
  icis: number[]; // length = nClicks - 1
  codaType: string;
  clan: string;
  unit: string;
  unitNum: number;
  whaleId: number;
};

export type DialogueCoda = {
  recording: string;
  nClicks: number;
  duration: number;
  icis: number[];
  whale: number; // 1, 2, ... per recording
  startSeconds: number; // TsTo: time within the recording, seconds
};

export type CodaDataset = {
  codas: Coda[];
};

export type DialogueDataset = {
  /** Codas grouped by recording session. */
  recordings: Map<string, DialogueCoda[]>;
};

function parseFloatSafe(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseIntSafe(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function loadCodas(url: string): Promise<CodaDataset> {
  const text = await fetch(url).then((r) => r.text());
  const rows = parseCsv(text);
  const codas: Coda[] = rows.map((r, i) => {
    const n = parseIntSafe(r.nClicks);
    const icis: number[] = [];
    for (let k = 1; k <= 9; k++) {
      const v = parseFloatSafe(r[`ICI${k}`]);
      if (v > 0) icis.push(v);
    }
    return {
      id: parseIntSafe(r.codaNUM2018) || i,
      date: r.Date ?? "",
      nClicks: n,
      duration: parseFloatSafe(r.Duration),
      icis,
      codaType: r.CodaType ?? "",
      clan: r.Clan ?? "",
      unit: r.Unit ?? "",
      unitNum: parseIntSafe(r.UnitNum),
      whaleId: parseIntSafe(r.IDN),
    };
  });
  return { codas };
}

export async function loadDialogues(url: string): Promise<DialogueDataset> {
  const text = await fetch(url).then((r) => r.text());
  const rows = parseCsv(text);
  const recordings = new Map<string, DialogueCoda[]>();
  for (const r of rows) {
    const icis: number[] = [];
    for (let k = 1; k <= 28; k++) {
      const v = parseFloatSafe(r[`ICI${k}`]);
      if (v > 0) icis.push(v);
    }
    const c: DialogueCoda = {
      recording: r.REC ?? "",
      nClicks: parseIntSafe(r.nClicks),
      duration: parseFloatSafe(r.Duration),
      icis,
      whale: parseIntSafe(r.Whale),
      startSeconds: parseFloatSafe(r.TsTo),
    };
    const list = recordings.get(c.recording) ?? [];
    list.push(c);
    recordings.set(c.recording, list);
  }
  // Sort each recording by start time.
  for (const list of recordings.values()) {
    list.sort((a, b) => a.startSeconds - b.startSeconds);
  }
  return { recordings };
}
