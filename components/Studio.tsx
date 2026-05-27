"use client";

import { useEffect, useMemo, useState } from "react";
import type { Coda, DialogueDataset } from "@/lib/dataset";
import { loadCodas, loadDialogues } from "@/lib/dataset";
import { computeFeatures, type CorpusFeatures } from "@/lib/features";
import dynamic from "next/dynamic";
import AlphabetGrid from "./AlphabetGrid";
import ClickPattern from "./ClickPattern";
import DialogueRibbon from "./DialogueRibbon";
import RubatoPanel from "./RubatoPanel";

// The 3D scatter pulls in three.js, react-three-fiber and post-processing,
// which all assume the DOM. Render client-side only.
const WhaleScatter = dynamic(() => import("./WhaleScatter"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full grid place-items-center text-white/35 text-xs uppercase tracking-[0.24em]">
      preparing pca...
    </div>
  ),
});

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      codas: Coda[];
      features: CorpusFeatures;
      dialogues: DialogueDataset;
    };

export default function Studio() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selected, setSelected] = useState<{ rhythmClass: number; tempoClass: number } | null>(
    null,
  );

  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const [codaSet, dialogueSet] = await Promise.all([
          loadCodas("/codas.csv"),
          loadDialogues("/dialogues.csv"),
        ]);
        if (aborted) return;
        const features = computeFeatures(codaSet.codas);
        if (aborted) return;
        setState({
          kind: "ready",
          codas: codaSet.codas,
          features,
          dialogues: dialogueSet,
        });
      } catch (e) {
        if (!aborted) {
          setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      }
    })();
    return () => {
      aborted = true;
    };
  }, []);

  // Once features are ready, default-select the cell with the most codas
  // so the click pattern and selected-cell panels are populated on load.
  useEffect(() => {
    if (state.kind !== "ready" || selected) return;
    const counts = new Map<string, { r: number; t: number; n: number }>();
    for (const f of state.features.features) {
      const key = `${f.rhythmClass}|${f.tempoClass}`;
      const cell = counts.get(key) ?? { r: f.rhythmClass, t: f.tempoClass, n: 0 };
      cell.n++;
      counts.set(key, cell);
    }
    let best = { r: 0, t: 0, n: 0 };
    for (const cell of counts.values()) if (cell.n > best.n) best = cell;
    setSelected({ rhythmClass: best.r, tempoClass: best.t });
  }, [state, selected]);

  if (state.kind === "loading") return <LoadingState />;
  if (state.kind === "error") return <ErrorState message={state.message} />;

  return (
    <Body
      codas={state.codas}
      features={state.features}
      dialogues={state.dialogues}
      selected={selected}
      onSelect={setSelected}
    />
  );
}

function Body({
  codas,
  features,
  dialogues,
  selected,
  onSelect,
}: {
  codas: Coda[];
  features: CorpusFeatures;
  dialogues: DialogueDataset;
  selected: { rhythmClass: number; tempoClass: number } | null;
  onSelect: (sel: { rhythmClass: number; tempoClass: number } | null) => void;
}) {
  const siblings = useMemo(() => {
    if (!selected) return [];
    const list: Coda[] = [];
    for (let i = 0; i < codas.length; i++) {
      const f = features.features[i];
      if (
        f.rhythmClass === selected.rhythmClass &&
        f.tempoClass === selected.tempoClass
      ) {
        list.push(codas[i]);
      }
    }
    return list;
  }, [codas, features, selected]);

  const focus = siblings[0] ?? null;

  return (
    <div className="w-full px-8 pb-4 grid grid-cols-12 gap-4">
      <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
        <Panel className="h-[120px] justify-center">
          <Brief />
        </Panel>
        <Panel className="h-[200px]" title="dataset">
          <Stats
            codaCount={codas.length}
            dialogueCount={[...dialogues.recordings.values()].reduce((s, l) => s + l.length, 0)}
            recordings={dialogues.recordings.size}
          />
        </Panel>
        <Panel
          className="flex-1 min-h-[220px]"
          title="rubato drift"
          subtitle="paper fig 2c"
        >
          <RubatoPanel codas={codas} features={features.features} />
        </Panel>
      </aside>

      <main className="col-span-12 lg:col-span-6 flex flex-col gap-4">
        <Panel
          className="aspect-[5/4]"
          title="phonetic alphabet"
          subtitle="18 rhythm × 5 tempo  ·  pink wedge = ornament rate"
        >
          <AlphabetGrid
            features={features.features}
            selected={selected}
            onSelect={(rhythmClass, tempoClass) =>
              onSelect({ rhythmClass, tempoClass })
            }
          />
        </Panel>
        <Panel
          className="h-[280px]"
          title="click pattern"
          subtitle={
            focus
              ? `${focus.codaType}  ·  ${focus.nClicks} clicks  ·  ${focus.duration.toFixed(3)} s`
              : "no selection"
          }
        >
          <ClickPattern coda={focus} siblings={siblings} />
        </Panel>
      </main>

      <aside className="col-span-12 lg:col-span-3 flex flex-col gap-4">
        <Panel
          className="h-[300px]"
          title="recorded dialogue"
          subtitle="dataset 2  ·  on-animal dtags"
        >
          <DialogueRibbon data={dialogues} />
        </Panel>
        <Panel
          className="h-[300px]"
          title="whale dialects"
          subtitle="pca of per-whale profiles · coloured by social unit"
        >
          <WhaleScatter codas={codas} features={features.features} />
        </Panel>
        <Panel
          className="flex-1 min-h-[220px]"
          title="selected cell"
          subtitle={
            selected
              ? `R${selected.rhythmClass + 1} · T${selected.tempoClass + 1}`
              : ""
          }
        >
          <SelectionInfo selected={selected} siblings={siblings} />
        </Panel>
      </aside>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="w-full px-8 py-12 text-center">
      <div className="text-[11px] uppercase tracking-[0.28em] text-white/55">
        loading dominica coda dataset
      </div>
      <div className="mt-2 text-[10px] text-white/30">
        8 719 codas, 3 948 timestamped dialogues, computing tempo + rhythm clusters
      </div>
      <div className="mt-4 mx-auto h-[3px] w-44 rounded-full bg-white/[0.06] overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-cyan-400/60 via-purple-400/60 to-pink-400/60 animate-pulse" />
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="w-full px-8 py-12 text-center">
      <div className="text-[12px] uppercase tracking-[0.28em] text-pink-300/80">
        failed to load dataset
      </div>
      <div className="mt-2 text-[10px] text-white/40 font-mono">{message}</div>
    </div>
  );
}

function Panel({
  children,
  title,
  subtitle,
  className = "",
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative flex flex-col rounded-2xl border border-white/[0.08] bg-[#070a18]/65 backdrop-blur-md p-4 overflow-hidden ${className}`}
      style={{
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 1px 0 rgba(0,0,0,0.4), 0 20px 50px -20px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at top left, rgba(86,224,255,0.05), transparent 70%), radial-gradient(ellipse 80% 60% at bottom right, rgba(255,122,219,0.04), transparent 70%)",
        }}
      />
      {(title || subtitle) && (
        <header className="relative mb-2.5 flex items-baseline justify-between shrink-0">
          {title && (
            <h2 className="text-[13px] font-medium tracking-tight text-white/90">
              {title}
            </h2>
          )}
          {subtitle && (
            <span className="text-[10px] uppercase tracking-[0.24em] text-white/35">
              {subtitle}
            </span>
          )}
        </header>
      )}
      <div className="relative flex-1 min-h-0 min-w-0">{children}</div>
    </section>
  );
}

function Brief() {
  return (
    <p className="text-[11.5px] leading-relaxed text-white/55">
      Sperm whales build codas from four independent features: tempo, rhythm,
      rubato, ornamentation. Sharma et al. 2024 found at least 143 attested
      combinations in the Dominica clan corpus. Click a cell to inspect.
    </p>
  );
}

function Stats({
  codaCount,
  dialogueCount,
  recordings,
}: {
  codaCount: number;
  dialogueCount: number;
  recordings: number;
}) {
  return (
    <dl className="grid grid-cols-2 gap-y-2 gap-x-3 text-[12px] font-mono">
      <Stat label="codas (DS1)" value={codaCount.toString()} />
      <Stat label="codas (DS2)" value={dialogueCount.toString()} />
      <Stat label="recordings" value={recordings.toString()} />
      <Stat label="clan" value="EC-1" />
      <Stat label="years" value="2005-2018" />
      <Stat label="source" value="DSWP" />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-white/40">{label}</dt>
      <dd className="text-right text-white/85 tabular-nums truncate" title={value}>
        {value}
      </dd>
    </>
  );
}

function SelectionInfo({
  selected,
  siblings,
}: {
  selected: { rhythmClass: number; tempoClass: number } | null;
  siblings: Coda[];
}) {
  if (!selected) {
    return (
      <div className="w-full h-full grid place-items-center text-white/35 text-xs uppercase tracking-[0.24em]">
        no selection
      </div>
    );
  }
  const types = new Map<string, number>();
  for (const c of siblings) {
    types.set(c.codaType, (types.get(c.codaType) ?? 0) + 1);
  }
  const top = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const whales = new Set(siblings.map((c) => c.whaleId).filter((w) => w > 0));
  const meanDur = siblings.reduce((s, c) => s + c.duration, 0) / Math.max(1, siblings.length);
  return (
    <div className="text-[11.5px] space-y-2.5 h-full overflow-auto pr-1">
      <dl className="grid grid-cols-2 gap-y-1.5 gap-x-3 font-mono">
        <dt className="text-white/40">codas</dt>
        <dd className="text-right text-white/85 tabular-nums">{siblings.length}</dd>
        <dt className="text-white/40">distinct whales</dt>
        <dd className="text-right text-white/85 tabular-nums">{whales.size}</dd>
        <dt className="text-white/40">mean duration</dt>
        <dd className="text-right text-white/85 tabular-nums">
          {meanDur.toFixed(3)} s
        </dd>
      </dl>
      <div className="pt-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/35 mb-1.5">
          top labels in cell
        </div>
        <div className="flex flex-wrap gap-1.5">
          {top.map(([k, v]) => (
            <span
              key={k}
              className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] text-white/75"
              title={`${v} codas`}
            >
              {k} · {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
