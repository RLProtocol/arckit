/** Coins orbit into a pool and come out the other side indistinguishable. Decorative. */
export function MixerArt() {
  return (
    <div className="cash-art" aria-hidden="true">
      <svg viewBox="0 0 320 320">
        <defs>
          <radialGradient id="cashGlow" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="rgba(95,227,201,0.55)" /><stop offset="100%" stopColor="rgba(95,227,201,0)" /></radialGradient>
        </defs>
        <circle cx="160" cy="160" r="120" fill="url(#cashGlow)" />
        <circle cx="160" cy="160" r="96" className="ring r1" />
        <circle cx="160" cy="160" r="66" className="ring r2" />
        <circle cx="160" cy="160" r="36" className="ring r3" />
        <g className="orbit o1"><circle cx="256" cy="160" r="7" className="coin" /></g>
        <g className="orbit o2"><circle cx="226" cy="160" r="6" className="coin" /></g>
        <g className="orbit o3"><circle cx="196" cy="160" r="5" className="coin" /></g>
        <g className="orbit o4"><circle cx="64" cy="160" r="7" className="coin" /></g>
        <text x="160" y="165" textAnchor="middle" className="core">$</text>
      </svg>
    </div>
  );
}
