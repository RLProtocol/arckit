/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCKER_ADDRESS?: string;
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_VESTING_ADDRESS?: string;
  readonly VITE_AIRDROP_ADDRESS?: string;
}

/** snarkjs ships no types; only the two Groth16 calls the ArcCash page uses are declared. */
declare module "snarkjs" {
  type Groth16Proof = { pi_a: string[]; pi_b: string[][]; pi_c: string[]; protocol: string; curve: string };
  export const groth16: {
    fullProve(input: Record<string, string | string[]>, wasm: Uint8Array | string, zkey: Uint8Array | string): Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: string[], proof: Groth16Proof): Promise<boolean>;
  };
}

declare module "*.md?raw" {
  const src: string;
  export default src;
}
