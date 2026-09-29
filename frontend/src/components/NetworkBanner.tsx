import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

/** Consecutive failed health polls before the banner shows. The public RPC drops ~25% of requests at random. */
const FAILS_TO_SHOW = 4;

/**
 * Shown under the nav only when Arc's RPC has failed several polls in a row,
 * and hidden again on the first success. The health poll goes through the same
 * transport as everything else (including any fallback endpoints), so it only
 * trips when all configured endpoints are failing.
 */
export function NetworkBanner() {
  const client = usePublicClient();
  const health = useQuery({
    queryKey: ["rpc-health"],
    queryFn: async () => {
      if (!client) throw new Error("no client");
      return client.getBlockNumber();
    },
    retry: 1,
    retryDelay: 1500,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  const fails = useRef(0);
  const [down, setDown] = useState(false);
  useEffect(() => {
    if (health.isFetching) return;
    if (health.isError) {
      fails.current += 1;
      if (fails.current >= FAILS_TO_SHOW) setDown(true);
    } else if (health.isSuccess) {
      fails.current = 0;
      setDown(false);
    }
  }, [health.isFetching, health.isError, health.isSuccess, health.dataUpdatedAt, health.errorUpdatedAt]);

  if (!down) return null;
  return (
    <div role="status" style={{ background: "var(--coral-soft)", borderBottom: "1px solid rgba(255,122,110,0.3)" }}>
      <div className="wrap small" style={{ paddingBlock: 9, color: "var(--coral)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: "currentColor", flex: "none" }} />
        <span>
          Arc's public RPC is not responding. Data refreshes automatically when it recovers; transactions may fail until
          then.
        </span>
      </div>
    </div>
  );
}
