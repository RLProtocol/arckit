import type { CSSProperties } from "react";

type Props = {
  /** 0..1 fraction of the lock period elapsed */
  progress: number;
  unlocked?: boolean;
  value: string;
  label: string;
  small?: boolean;
  animate?: boolean;
};

/**
 * The ArcLock signature: a 270° arc that fills as the lock period elapses,
 * brass while locked, mint once open. Rotated so the gap sits at the bottom.
 */
export function Dial({ progress, unlocked, value, label, small, animate = true }: Props) {
  const size = 200;
  const stroke = small ? 9 : 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const p = Math.min(1, Math.max(0, progress));
  const offset = arc * (1 - p);
  const style = { "--circ": String(arc) } as CSSProperties;

  return (
    <div className={`dial ${small ? "dial-sm" : ""} ${unlocked ? "unlocked" : ""}`} role="img" aria-label={`${value} ${label}`}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="track"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
        />
        <circle
          className={`prog ${animate ? "animate" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c}`}
          strokeDashoffset={offset}
          style={style}
        />
      </svg>
      <div className="dial-center">
        <div className="dial-num">{value}</div>
        {label && <div className="dial-lbl">{label}</div>}
      </div>
    </div>
  );
}
