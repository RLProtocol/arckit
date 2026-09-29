import { AIRDROP_ADDRESS, LOCKER_ADDRESS, STAKING_ADDRESS, USING_TEST_CONTRACTS, USING_TEST_STAKING, VESTING_ADDRESS } from "@/contracts";
import { shortAddr } from "@/lib/format";

/** Visible only when the build points at non-production contracts via VITE_* overrides. */
export function TestBanner() {
  if (!USING_TEST_CONTRACTS && !USING_TEST_STAKING) return null;
  return (
    <div role="status" style={{ background: "var(--accent-soft)", borderBottom: "1px solid var(--accent-line)" }}>
      <div className="wrap small mono" style={{ paddingBlock: 8, color: "var(--accent-strong)" }}>
        TEST MODE · {USING_TEST_CONTRACTS ? `locker ${shortAddr(LOCKER_ADDRESS, 5)} · vesting ${shortAddr(VESTING_ADDRESS, 5)} · airdrop ${shortAddr(AIRDROP_ADDRESS, 5)} · ` : ""}{USING_TEST_STAKING ? `staking ${shortAddr(STAKING_ADDRESS, 5)} · ` : ""}fee 0.1 USDC · not the production contracts
      </div>
    </div>
  );
}
