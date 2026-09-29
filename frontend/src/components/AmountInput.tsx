import { formatUnits } from "viem";
import { fmtAmount } from "@/lib/format";

type Props = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  symbol?: string;
  decimals?: number;
  /** Upper bound the quick-pick buttons divide. Wallet balance for lock/top-up, lock balance for withdraw/split. */
  max?: bigint;
  maxLabel?: string;
  /** Percentages offered as quick picks. 100 is always shown as "Max". */
  percents?: number[];
  hint?: string;
  error?: string;
  disabled?: boolean;
  id?: string;
};

export function AmountInput({
  label,
  value,
  onChange,
  symbol,
  decimals = 18,
  max,
  maxLabel = "Available",
  percents = [25, 50, 75, 100],
  hint,
  error,
  disabled,
  id,
}: Props) {
  const inputId = id ?? `amt-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const pick = (pct: number) => {
    if (max === undefined) return;
    const v = (max * BigInt(pct)) / 100n;
    onChange(formatUnits(v, decimals));
  };
  const current = (() => {
    if (max === undefined || max === 0n) return null;
    try {
      const [i, f = ""] = value.replace(/,/g, "").split(".");
      if (!/^\d*$/.test(i) || !/^\d*$/.test(f)) return null;
      const wei = BigInt((i || "0") + f.slice(0, decimals).padEnd(decimals, "0"));
      for (const p of percents) if (wei === (max * BigInt(p)) / 100n) return p;
      return null;
    } catch {
      return null;
    }
  })();

  return (
    <div className="field">
      <div className="row between" style={{ alignItems: "baseline" }}>
        <label htmlFor={inputId}>{label}</label>
        {max !== undefined && (
          <span className="tiny muted mono">
            {maxLabel}: <span style={{ color: "var(--text)" }}>{fmtAmount(max, decimals)}</span> {symbol ?? ""}
          </span>
        )}
      </div>
      <div className="input-row">
        <input
          id={inputId}
          className="input mono"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error}
        />
        {symbol && <div className="input-addon">{symbol}</div>}
      </div>
      {max !== undefined && (
        <div className="presets" role="group" aria-label={`Quick amounts as a share of ${maxLabel.toLowerCase()}`}>
          {percents.map((p) => (
            <button
              type="button"
              key={p}
              className={`preset ${current === p ? "on" : ""}`}
              onClick={() => pick(p)}
              disabled={disabled || max === 0n}
            >
              {p === 100 ? "Max" : `${p}%`}
            </button>
          ))}
        </div>
      )}
      {error ? <div className="error">{error}</div> : hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}
