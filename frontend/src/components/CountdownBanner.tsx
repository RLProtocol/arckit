import { useEffect, useState } from "react";
import { ArcMark } from "@/components/Nav";
import { SOCIALS } from "@/components/Footer";

/**
 * TEMPORARY launch gate for a single route. Wrap a route element in
 * <LaunchGate target=... label=... blurb=...> in App.tsx: while the target is in
 * the future, that route shows the countdown page below (nav and footer stay).
 * Once the target passes, the real page appears automatically. To remove for
 * good: unwrap the element in App.tsx.
 *
 * Past gates: /flow until 1789574064 (2026-09-16 15:54:24Z).
 * Current: /stake until STAKING_LAUNCH (2026-09-17 13:00:00Z).
 */
export const STAKING_LAUNCH = 1789650000; // unix seconds, UTC = 2026-09-17 13:00:00Z

type Gate = { target: number; label: string; blurb: string };

function useSecondsLeft(target: number) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return target - now;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Full-page countdown shown instead of the site while the gate is active. */
export function LaunchPage({ target, label, blurb }: Gate) {
  const left = useSecondsLeft(target);
  const h = Math.max(0, Math.floor(left / 3600));
  const m = Math.max(0, Math.floor((left % 3600) / 60));
  const s = Math.max(0, left % 60);
  return (
    <section className="launch">
      <div className="launch-art" aria-hidden="true" />
      <div className="launch-inner">
        <div className="brand" style={{ justifyContent: "center", fontSize: 26 }}>
          <ArcMark size={40} />
          <span>
            Arc<span className="thin"> Kit</span>
          </span>
        </div>
        <div className="eyebrow" style={{ marginTop: 34 }}>{label}</div>
        <div className="launch-time" role="timer" aria-label={`${h} hours ${m} minutes ${s} seconds`}>
          <span>{pad(h)}<small>hours</small></span>
          <span className="sep">:</span>
          <span>{pad(m)}<small>minutes</small></span>
          <span className="sep">:</span>
          <span>{pad(s)}<small>seconds</small></span>
        </div>
        <p className="lede center" style={{ margin: "26px auto 0" }}>
          {blurb}
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 28, gap: 10 }}>
          <a className="btn btn-ghost" href={SOCIALS.x} target="_blank" rel="noreferrer">@usearckit on X</a>
          <a className="btn btn-ghost" href={SOCIALS.telegram} target="_blank" rel="noreferrer">Telegram</a>
        </div>
      </div>
    </section>
  );
}

/** Renders the launch page while the gate is active, otherwise the real site. */
export function LaunchGate({ children, ...gate }: Gate & { children: React.ReactNode }) {
  const left = useSecondsLeft(gate.target);
  if (left > 0) return <LaunchPage {...gate} />;
  return <>{children}</>;
}

/** Slim in-site banner (used once the gate is off but a countdown is still wanted). */
export function CountdownBanner({ target, label }: { target: number; label: string }) {
  const left = useSecondsLeft(target);
  if (left <= 0) return null;
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return (
    <div className="countdown" role="timer" aria-live="off">
      <div className="wrap">
        <span className="lbl">{label}</span>
        <span className="time">
          {pad(h)}<small>h</small>{pad(m)}<small>m</small>{pad(s)}<small>s</small>
        </span>
      </div>
    </div>
  );
}
