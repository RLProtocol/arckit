import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useNow } from "@/hooks/useNow";
import { useAllLocks, useLocksByIds, useTokenMetas, useUserLockIds } from "@/hooks/useLocks";
import { useBeneficiaryVestingIds, useCreatorVestingIds, useVestingsByIds } from "@/hooks/useVestings";
import { RequireWallet } from "@/components/RequireWallet";
import { LockCard } from "@/components/LockCard";
import { VestingCard } from "@/components/VestingCertificate";
import { lockStatus, sameAddr, vestedAt } from "@/lib/format";

type Tab = "manage" | "withdraw" | "vest-receive" | "vest-created";

export function MyLocks() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Your wallet</div>
          <h2>My locks &amp; vesting</h2>
        </div>
        <div className="row">
          <Link to="/lock/new" className="btn btn-primary">New lock</Link>
          <Link to="/vest/new" className="btn btn-ghost">New vesting</Link>
        </div>
      </div>
      <RequireWallet what="see the locks and vesting schedules tied to your wallet">
        <MyList />
      </RequireWallet>
    </div>
  );
}

function MyList() {
  const { address } = useAccount();
  const now = useNow();
  const owned = useUserLockIds(address);
  const ownedLocks = useLocksByIds(owned.data);
  const all = useAllLocks(500);
  const benIds = useBeneficiaryVestingIds(address);
  const benVests = useVestingsByIds(benIds.data);
  const creIds = useCreatorVestingIds(address);
  const creVests = useVestingsByIds(creIds.data);
  const [tab, setTab] = useState<Tab>("manage");

  const withdrawable = useMemo(() => (all.locks ?? []).filter((l) => sameAddr(l.withdrawer, address) && !sameAddr(l.owner, address)), [all.locks, address]);
  const manage = useMemo(() => [...(ownedLocks.locks ?? [])].sort((a, b) => Number(b.id - a.id)), [ownedLocks.locks]);
  const receive = useMemo(() => [...(benVests.vestings ?? [])].sort((a, b) => Number(b.id - a.id)), [benVests.vestings]);
  const created = useMemo(() => [...(creVests.vestings ?? [])].filter((v) => !sameAddr(v.beneficiary, address)).sort((a, b) => Number(b.id - a.id)), [creVests.vestings, address]);

  const tokens = useMemo(() => [...manage, ...withdrawable, ...receive, ...created].map((x) => x.token), [manage, withdrawable, receive, created]);
  const metas = useTokenMetas(tokens);

  const readyToWithdraw = useMemo(() => [...manage, ...withdrawable].filter((l) => sameAddr(l.withdrawer, address) && lockStatus(l, now) === "unlocked").length, [manage, withdrawable, address, now]);
  const claimableCount = useMemo(() => receive.filter((v) => vestedAt(v, now) > v.released).length, [receive, now]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "manage", label: "Locks I manage", count: manage.length },
    { key: "withdraw", label: "Locks I can withdraw", count: withdrawable.length },
    { key: "vest-receive", label: "Vesting to me", count: receive.length },
    { key: "vest-created", label: "Vesting I created", count: created.length },
  ];

  const loading =
    tab === "manage" ? owned.isLoading || ownedLocks.isLoading : tab === "withdraw" ? all.isLoading : tab === "vest-receive" ? benIds.isLoading || benVests.isLoading : creIds.isLoading || creVests.isLoading;

  return (
    <>
      {readyToWithdraw > 0 && <div className="notice notice-ok" style={{ marginBottom: 12 }}>{readyToWithdraw === 1 ? "One lock is open and ready to withdraw." : `${readyToWithdraw} locks are open and ready to withdraw.`}</div>}
      {claimableCount > 0 && <div className="notice notice-ok" style={{ marginBottom: 12 }}>{claimableCount === 1 ? "One vesting schedule has tokens ready to claim." : `${claimableCount} vesting schedules have tokens ready to claim.`}</div>}

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} {t.count > 0 && <span className="faint">· {t.count}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid-cards">{[0, 1, 2].map((i) => <div key={i} className="card card-tight" style={{ height: 128 }} />)}</div>
      ) : tab === "manage" ? (
        manage.length ? <div className="grid-cards">{manage.map((l) => <LockCard key={l.id.toString()} lock={l} meta={metas.get(l.token.toLowerCase())} now={now} />)}</div> : <Empty text="You do not own any locks yet." to="/lock/new" cta="Create a lock" />
      ) : tab === "withdraw" ? (
        withdrawable.length ? <div className="grid-cards">{withdrawable.map((l) => <LockCard key={l.id.toString()} lock={l} meta={metas.get(l.token.toLowerCase())} now={now} />)}</div> : <Empty text="No one has named this wallet as the withdrawer of a lock they own." />
      ) : tab === "vest-receive" ? (
        receive.length ? <div className="grid-cards">{receive.map((v) => <VestingCard key={v.id.toString()} v={v} meta={metas.get(v.token.toLowerCase())} now={now} />)}</div> : <Empty text="No vesting schedule names this wallet as beneficiary." />
      ) : created.length ? (
        <div className="grid-cards">{created.map((v) => <VestingCard key={v.id.toString()} v={v} meta={metas.get(v.token.toLowerCase())} now={now} />)}</div>
      ) : (
        <Empty text="You have not created vesting schedules for other wallets." to="/vest/new" cta="Create a schedule" />
      )}
    </>
  );
}

function Empty({ text, to, cta }: { text: string; to?: string; cta?: string }) {
  return (
    <div className="empty">
      <p>{text}</p>
      {to && cta && <p style={{ marginTop: 12 }}><Link to={to} className="btn btn-primary">{cta}</Link></p>}
    </div>
  );
}
