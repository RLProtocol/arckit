import { useQuery } from "@tanstack/react-query";
import { isAddress, parseAbi, type Address } from "viem";
import { publicClient, withTimeout } from "../chain";

// .arc names (ArcNames on Arc). Everything comes from contract views; no indexer.
export const NAMES = "0x4C643E7133c20816dF778Cb4FcEF004201852F08" as Address;
const ZERO = "0x0000000000000000000000000000000000000000";

export const arcNamesAbi = parseAbi([
  "struct Info { string label; address owner; uint64 expires; address addr; string contenthash; bool available; bool isReserved; uint256 yearlyPrice; }",
  "function info(string label) view returns (Info)",
  "function resolve(string label) view returns (address)",
  "function primaryName(address account) view returns (string)",
  "function namesOf(address owner) view returns (string[] labels, uint64[] expires)",
  "function text(string label, string key) view returns (string)",
  "function register(string label, uint256 numYears, address to) payable returns (uint256)",
  "function renew(string label, uint256 numYears) payable",
  "function setAddr(string label, address a)",
  "function setContenthash(string label, string hash)",
  "function setTexts(string label, string[] keys, string[] values)",
  "function setPrimaryName(string label)",
  "error InvalidName()",
  "error InvalidYears()",
  "error NotAvailable()",
  "error IsReserved()",
  "error NotRegistered()",
  "error Expired()",
  "error NotAuthorized()",
  "error NotResolved()",
  "error InsufficientPayment(uint256 sent, uint256 required)",
]);

export const NAME_ERRORS: Record<string, string> = {
  InvalidName: "Names use a-z, 0-9 and hyphens, 3 to 32 characters.",
  InvalidYears: "Choose between 1 and 10 years.",
  NotAvailable: "That name was just taken. Try another.",
  IsReserved: "That name is reserved.",
  NotRegistered: "That name is not registered.",
  NotAuthorized: "Only the name's owner can change it.",
  NotResolved: "Point the name at your wallet before making it your primary name.",
  InsufficientPayment: "The price changed. Try again.",
};

export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\.arc$/, "");
export const isValidName = (s: string) => /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/.test(s);
export const siteUrl = (label: string) => `https://${label}.usearckit.online`;

export type NameInfo = { label: string; owner: Address; expires: bigint; addr: Address; contenthash: string; available: boolean; isReserved: boolean; yearlyPrice: bigint };

export const TEXT_KEYS: [string, string, string][] = [
  ["avatar", "Avatar image", "https://… or ipfs://…"],
  ["description", "Bio", "A line about you or your project"],
  ["url", "Website", "https://…"],
  ["com.twitter", "X (Twitter)", "@handle"],
  ["org.telegram", "Telegram", "@handle"],
];

export function useNameInfo(label: string) {
  return useQuery({
    queryKey: ["name-info", label],
    enabled: isValidName(label),
    refetchInterval: 15_000,
    queryFn: async () => (await withTimeout(publicClient.readContract({ address: NAMES, abi: arcNamesAbi, functionName: "info", args: [label] }))) as NameInfo,
  });
}

export function useMyNames(owner?: Address) {
  return useQuery({
    queryKey: ["my-names", owner],
    enabled: !!owner,
    refetchInterval: 20_000,
    queryFn: async () => {
      const [labels, expires] = (await withTimeout(publicClient.readContract({ address: NAMES, abi: arcNamesAbi, functionName: "namesOf", args: [owner!] }))) as readonly [readonly string[], readonly bigint[]];
      return labels.map((label, i) => ({ label, expires: expires[i] }));
    },
  });
}

/** The primary .arc name of an address ("" when none). */
export function usePrimaryName(account?: Address) {
  return useQuery({
    queryKey: ["primary-name", account],
    enabled: !!account,
    staleTime: 60_000,
    queryFn: () => publicClient.readContract({ address: NAMES, abi: arcNamesAbi, functionName: "primaryName", args: [account!] }),
  });
}

export function useTexts(label: string) {
  return useQuery({
    queryKey: ["name-texts", label],
    enabled: isValidName(label),
    queryFn: async () => {
      const r = await publicClient.multicall({ allowFailure: true, contracts: TEXT_KEYS.map(([k]) => ({ address: NAMES, abi: arcNamesAbi, functionName: "text", args: [label, k] }) as const) });
      return TEXT_KEYS.map((_, i) => (r[i].result as string | undefined) ?? "");
    },
  });
}

/**
 * Turns what someone typed into a recipient: a 0x address as-is, or a .arc name resolved on chain.
 * Returns { address, name } or { error }.
 */
export function useRecipient(input: string) {
  const v = input.trim();
  const asName = !isAddress(v) && /\.arc$/i.test(v) ? normalizeName(v) : "";
  const q = useQuery({
    queryKey: ["resolve-name", asName],
    enabled: !!asName && isValidName(asName),
    staleTime: 30_000,
    queryFn: () => publicClient.readContract({ address: NAMES, abi: arcNamesAbi, functionName: "resolve", args: [asName] }),
  });
  if (!v) return { address: undefined, name: "", error: "", loading: false };
  if (isAddress(v)) return { address: v as Address, name: "", error: "", loading: false };
  if (!asName) return { address: undefined, name: "", error: "Enter an Arc address or a .arc name.", loading: false };
  if (!isValidName(asName)) return { address: undefined, name: asName, error: "That is not a valid .arc name.", loading: false };
  if (q.isLoading) return { address: undefined, name: asName, error: "", loading: true };
  if (!q.data || q.data === ZERO) return { address: undefined, name: asName, error: `${asName}.arc is not registered or points nowhere.`, loading: false };
  return { address: q.data as Address, name: asName, error: "", loading: false };
}
