import { useReadContract } from "wagmi";
import { parseAbi, type Address } from "viem";
import deployments from "@deployments/arc-5042.json";
import { arc } from "@/wagmi";

const dc = deployments.contracts as Record<string, { address: string } | undefined>;
export const NAMES_ADDRESS = dc.ArcNames?.address as Address | undefined;

export const arcNamesAbi = parseAbi([
  "struct Info { string label; address owner; uint64 expires; address addr; string contenthash; bool available; bool isReserved; uint256 yearlyPrice; }",
  "function info(string label) view returns (Info)",
  "function isValid(string label) view returns (bool)",
  "function priceOf(string label, uint256 numYears) view returns (uint256)",
  "function resolve(string label) view returns (address)",
  "function primaryName(address account) view returns (string)",
  "function namesOf(address owner) view returns (string[] labels, uint64[] expires)",
  "function text(string label, string key) view returns (string)",
  "function contenthash(string label) view returns (string)",
  "function register(string label, uint256 numYears, address to) payable returns (uint256)",
  "function renew(string label, uint256 numYears) payable",
  "function setAddr(string label, address a)",
  "function setContenthash(string label, string hash)",
  "function setTexts(string label, string[] keys, string[] values)",
  "function setPrimaryName(string label)",
  "function clearPrimaryName()",
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
  Expired: "This name has expired. Renew it first.",
  NotAuthorized: "Only the name's owner can change it.",
  NotResolved: "Point the name at your wallet before making it your primary name.",
  InsufficientPayment: "The price changed. Try again.",
};

/** Lowercases and strips a trailing ".arc" so people can type either form. */
export const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\.arc$/, "");
export const NAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
export const isValidName = (s: string) => NAME_RE.test(s);

/** The website address for a name. */
export const siteUrl = (label: string) => `https://${label}.usearckit.online`;
export const ipfsHttp = (uri: string) => (uri.startsWith("ipfs://") ? `https://ipfs.filebase.io/ipfs/${uri.slice(7)}` : uri);

export type NameInfo = { label: string; owner: Address; expires: bigint; addr: Address; contenthash: string; available: boolean; isReserved: boolean; yearlyPrice: bigint };

export function useNameInfo(label: string) {
  return useReadContract({
    address: NAMES_ADDRESS, abi: arcNamesAbi, functionName: "info", args: [label], chainId: arc.id,
    query: { enabled: !!NAMES_ADDRESS && isValidName(label), refetchInterval: 15_000 },
  });
}

export function useMyNames(owner?: Address) {
  return useReadContract({
    address: NAMES_ADDRESS, abi: arcNamesAbi, functionName: "namesOf", args: [owner ?? "0x0000000000000000000000000000000000000000"], chainId: arc.id,
    query: { enabled: !!NAMES_ADDRESS && !!owner, refetchInterval: 20_000 },
  });
}

/** The primary .arc name of an address ("" when none). */
export function usePrimaryName(account?: Address) {
  return useReadContract({
    address: NAMES_ADDRESS, abi: arcNamesAbi, functionName: "primaryName", args: [account ?? "0x0000000000000000000000000000000000000000"], chainId: arc.id,
    query: { enabled: !!NAMES_ADDRESS && !!account, staleTime: 60_000 },
  });
}

export const TEXT_KEYS: [string, string, string][] = [
  ["avatar", "Avatar image", "https://… or ipfs://…"],
  ["description", "Bio", "A line about you or your project"],
  ["url", "Website", "https://…"],
  ["com.twitter", "X (Twitter)", "@handle"],
  ["org.telegram", "Telegram", "@handle"],
  ["com.github", "GitHub", "username"],
];
