import { explorerAddress } from "@/contracts";
import { shortAddr } from "@/lib/format";

export function AddressLink({ addr, chars = 4, className = "" }: { addr: string; chars?: number; className?: string }) {
  return (
    <a
      className={`mono ${className}`}
      href={explorerAddress(addr)}
      target="_blank"
      rel="noreferrer"
      title={addr}
      style={{ borderBottom: "1px dotted var(--text-faint)" }}
    >
      {shortAddr(addr, chars)}
    </a>
  );
}
