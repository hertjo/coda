import Studio from "@/components/Studio";

export default function Page() {
  return (
    <div className="relative min-h-screen text-white">
      <Backdrop />
      <Header />
      <Studio />
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="relative px-8 pt-7 pb-4 flex items-center">
      <div className="flex items-center gap-3.5">
        <Sigil />
        <div className="leading-tight">
          <h1 className="text-[17px] font-semibold tracking-[-0.01em] text-white">
            Coda
          </h1>
          <p className="text-[10.5px] tracking-[0.32em] uppercase text-white/35 mt-0.5">
            the sperm whale phonetic alphabet
          </p>
        </div>
      </div>
      <a
        href="https://www.nature.com/articles/s41467-024-47221-8"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-2 rounded-full border border-white/[0.09] bg-white/[0.03] pl-2.5 pr-3.5 py-1.5 text-[12px] text-white/75 hover:text-white hover:border-cyan-400/40 hover:bg-cyan-400/[0.05] transition-colors"
      >
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.06] text-[11px] font-serif italic text-white/85">
          ƒ
        </span>
        <span className="tracking-tight">sharma et al. 2024</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/35"
          aria-hidden
        >
          <path d="M4 1.5 H8.5 V6" />
          <path d="M8.5 1.5 L3 7" />
        </svg>
      </a>
    </header>
  );
}

function Sigil() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true">
      <defs>
        <radialGradient id="sig-glow-cy" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7adcff" />
          <stop offset="100%" stopColor="#7adcff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect
        x="0.5"
        y="0.5"
        width="33"
        height="33"
        rx="8"
        stroke="rgba(255,255,255,0.15)"
        fill="rgba(255,255,255,0.02)"
      />
      <circle cx="17" cy="17" r="11" fill="url(#sig-glow-cy)" />
      {[6, 9, 12, 13, 16, 20, 23, 28].map((x, i) => (
        <line
          key={i}
          x1={x}
          y1={17 - 6 + (i % 2) * 0.6}
          x2={x}
          y2={17 + 6 - (i % 2) * 0.6}
          stroke="#7adcff"
          strokeWidth="1.5"
        />
      ))}
    </svg>
  );
}

function Backdrop() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10"
      style={{
        background:
          "radial-gradient(1200px 600px at 15% -10%, rgba(86,224,255,0.10), transparent 60%)," +
          "radial-gradient(900px 500px at 110% 10%, rgba(255,122,219,0.08), transparent 60%)," +
          "radial-gradient(1400px 800px at 50% 110%, rgba(60,80,170,0.10), transparent 70%)," +
          "linear-gradient(180deg,#020310 0%, #04061a 50%, #020310 100%)",
      }}
    />
  );
}

function Footer() {
  return (
    <footer className="relative px-8 pb-6 pt-1 text-[10px] tracking-[0.32em] uppercase text-white/25 text-center">
      dominica sperm whale project  ·  EC-1 clan  ·  2005 to 2018
    </footer>
  );
}
