"use client";

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Coda } from "@/lib/dataset";
import type { FeatureSet } from "@/lib/features";
import { buildWhaleProfiles, type WhaleProfile } from "@/lib/whales";
import { embed, type EmbedMethod, type EmbedResult } from "@/lib/embed";

type Props = {
  codas: Coda[];
  features: FeatureSet[];
};

// 11 social-unit colours, hue-rotated so adjacent units stay
// distinguishable in the dark theme.
function buildUnitPalette(units: string[]): Map<string, THREE.Color> {
  const out = new Map<string, THREE.Color>();
  units.forEach((u, i) => {
    const h = (i / Math.max(1, units.length)) * 0.9;
    const color = new THREE.Color().setHSL(h, 0.7, 0.6);
    out.set(u, color);
  });
  return out;
}

function unitColorCss(c: THREE.Color): string {
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

export default function WhaleScatter({ codas, features }: Props) {
  const [method, setMethod] = useState<EmbedMethod>("umap");

  const profiles = useMemo(() => buildWhaleProfiles(codas, features), [codas, features]);

  const result: EmbedResult = useMemo(() => {
    if (profiles.length === 0) return { method, points: [] };
    return embed(profiles.map((p) => p.vector), method);
  }, [profiles, method]);

  const units = useMemo(() => {
    const s = new Set<string>();
    for (const p of profiles) s.add(p.unit);
    return [...s].sort();
  }, [profiles]);

  const palette = useMemo(() => buildUnitPalette(units), [units]);

  const normalisedPoints = useMemo(() => result.points, [result]);

  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="relative w-full h-full overflow-hidden rounded-lg">
      <Canvas
        gl={{ antialias: true, alpha: false }}
        dpr={[1, 2]}
        camera={{ position: [3.4, 2.2, 3.8], fov: 38 }}
        style={{ background: "linear-gradient(180deg,#04060f 0%,#070b22 100%)" }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[6, 6, 6]} intensity={0.4} color="#9ad4ff" />
        <pointLight position={[-6, -2, -4]} intensity={0.3} color="#ff7adb" />
        <AxisGuides />
        <Stars />

        {profiles.length > 0 &&
          normalisedPoints.map((pos, i) => {
            const p = profiles[i];
            const color = palette.get(p.unit) ?? new THREE.Color("#9ab4dd");
            const r = 0.06 + 0.10 * (Math.log1p(p.count) / Math.log1p(maxCount(profiles)));
            return (
              <WhalePoint
                key={p.id}
                position={pos as unknown as [number, number, number]}
                color={color}
                radius={r}
                hovered={hover === i}
                onOver={() => setHover(i)}
                onOut={() => setHover((h) => (h === i ? null : h))}
              />
            );
          })}

        <OrbitControls
          enablePan={false}
          minDistance={3.2}
          maxDistance={9}
          autoRotate
          autoRotateSpeed={0.5}
          enableDamping
          dampingFactor={0.08}
        />

        <EffectComposer multisampling={0}>
          <Bloom intensity={0.6} luminanceThreshold={0.4} luminanceSmoothing={0.55} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {/* Legend overlay. */}
      <div className="pointer-events-none absolute right-2.5 top-2 text-[10.5px] font-mono leading-tight">
        <div className="text-white/55 uppercase tracking-[0.18em] mb-1">unit</div>
        {units.map((u) => (
          <div key={u} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: unitColorCss(palette.get(u) ?? new THREE.Color("#aaa")) }}
            />
            <span className="text-white/75">{u}</span>
          </div>
        ))}
      </div>

      {/* Method footer. */}
      <div className="pointer-events-none absolute left-3 bottom-2 text-[10px] font-mono text-white/45">
        {result.method === "pca" && result.explained ? (
          <>pc1 {(result.explained[0] * 100).toFixed(0)}%  ·  pc2 {(result.explained[1] * 100).toFixed(0)}%  ·  pc3 {(result.explained[2] * 100).toFixed(0)}%</>
        ) : (
          <>umap · n_neighbors=8 · seed 0xc0da</>
        )}
      </div>

      {/* Method toggle. */}
      <div className="absolute right-2.5 bottom-2 flex gap-1 text-[10.5px] font-mono">
        {(["umap", "pca"] as EmbedMethod[]).map((m) => {
          const active = method === m;
          return (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={[
                "rounded-md px-2 py-0.5 border transition-colors",
                active
                  ? "border-cyan-400/55 bg-cyan-400/15 text-cyan-100"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white hover:border-white/30",
              ].join(" ")}
            >
              {m}
            </button>
          );
        })}
      </div>

      {/* Hover tooltip. */}
      {hover != null && profiles[hover] && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-white/15 bg-[#080c1e]/95 px-2.5 py-2 text-[10.5px] font-mono leading-tight text-white/85">
          <div className="text-white/95">whale {profiles[hover].id} · unit {profiles[hover].unit}</div>
          <div className="text-white/55 mt-0.5">{profiles[hover].count} codas</div>
          <div className="text-white/55">tempo {profiles[hover].meanTempo.toFixed(3)} s ± {profiles[hover].tempoStd.toFixed(3)}</div>
          <div className="text-white/55">ornaments {(profiles[hover].ornamentRate * 100).toFixed(1)}%</div>
          <div className="text-white/55">rubato drift {(profiles[hover].rubatoDrift * 1000).toFixed(0)} ms</div>
          <div className="text-white/55">top rhythms R{profiles[hover].dominantRhythms.map((r) => r + 1).join(", R")}</div>
        </div>
      )}
    </div>
  );
}

function maxCount(profiles: WhaleProfile[]): number {
  let m = 1;
  for (const p of profiles) if (p.count > m) m = p.count;
  return m;
}

function WhalePoint({
  position,
  color,
  radius,
  hovered,
  onOver,
  onOut,
}: {
  position: [number, number, number];
  color: THREE.Color;
  radius: number;
  hovered: boolean;
  onOver: () => void;
  onOut: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  // Subtle bob so the points feel alive without breaking the PCA layout.
  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.getElapsedTime();
    meshRef.current.position.y =
      position[1] + Math.sin(t * 0.6 + position[0] * 1.3) * 0.015;
  });

  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onOver();
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onOut();
  };

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
      >
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={hovered ? 1.4 : 0.85}
          metalness={0.1}
          roughness={0.35}
          toneMapped={false}
        />
      </mesh>
      {hovered && (
        <mesh>
          <sphereGeometry args={[radius * 1.45, 16, 16]} />
          <meshBasicMaterial color={color} transparent opacity={0.22} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

function AxisGuides() {
  // Faint cross at the origin so the viewer has a depth reference.
  const length = 1.6;
  return (
    <group>
      {([
        [length, 0, 0],
        [0, length, 0],
        [0, 0, length],
      ] as Array<[number, number, number]>).map((end, i) => (
        <line key={i}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, 0, 0, ...end]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial
            color="#3a4660"
            transparent
            opacity={0.45}
            toneMapped={false}
          />
        </line>
      ))}
    </group>
  );
}

function Stars() {
  const positions = useMemo(() => {
    const arr = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 20;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 12;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 20 - 4;
    }
    return arr;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.018}
        color="#8a9ed0"
        transparent
        opacity={0.5}
        sizeAttenuation
        toneMapped={false}
      />
    </points>
  );
}
