// Hermes lacks a few web APIs that viem and our fetch helpers touch. Each shim is installed only when missing.
import "react-native-get-random-values";

const g = globalThis as Record<string, unknown>;

if (typeof g.TextEncoder === "undefined") {
  g.TextEncoder = class {
    encode(str = ""): Uint8Array {
      const out: number[] = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return Uint8Array.from(out);
    }
  };
}

if (typeof g.TextDecoder === "undefined") {
  g.TextDecoder = class {
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return "";
      const b = input instanceof Uint8Array ? input : new Uint8Array(input instanceof ArrayBuffer ? input : (input as ArrayBufferView).buffer);
      let s = "";
      for (let i = 0; i < b.length;) {
        const c = b[i++];
        if (c < 0x80) s += String.fromCharCode(c);
        else if (c < 0xe0) s += String.fromCharCode(((c & 31) << 6) | (b[i++] & 63));
        else if (c < 0xf0) s += String.fromCharCode(((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63));
        else { const cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63); s += String.fromCodePoint(cp); }
      }
      return s;
    }
  };
}

if (typeof AbortSignal !== "undefined" && typeof (AbortSignal as unknown as { timeout?: unknown }).timeout !== "function") {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
}

if (typeof g.structuredClone === "undefined") {
  g.structuredClone = (v: unknown) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
}
