import { useEffect, useState } from "react";
import { nowSec } from "@/lib/format";

/** Current unix time in seconds, ticking on an interval so countdowns stay live. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(nowSec);
  useEffect(() => {
    const t = setInterval(() => setNow(nowSec()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
