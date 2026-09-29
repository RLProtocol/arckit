# ArcPay backend (not included in this repository)

The ArcPay serverless backend (`api/pay.js` and `api/_lib/pay/`) is kept private. It integrates a commercial
gift-card and mobile top-up supplier under contract terms that do not allow publishing the integration, and it
holds the operational logic for a hot wallet. Everything a user or auditor can verify on-chain **is** public:

- **Router contract:** [`src/ArcPayRouter.sol`](../src/ArcPayRouter.sol) — `pay(bytes32 orderId)` forwards the
  exact `msg.value` to the treasury in the same call and records one payment per order id. It holds no funds.
- **Frontend:** [`frontend/src/pages/Pay.tsx`](../frontend/src/pages/Pay.tsx) and
  [`frontend/src/hooks/useArcPay.ts`](../frontend/src/hooks/useArcPay.ts) — the complete client, including the
  API contract the backend must satisfy.

## Backend API contract (what the frontend expects)

All calls go to `/api/pay?op=<op>`.

| Method | op | Purpose |
|---|---|---|
| GET | `geo` | `{ country }` from the visitor's connection |
| GET | `config` | `{ ready, demo, router }` |
| GET | `products` | `{ country, items[] }` popular products for a country |
| GET | `search` | `{ items[] }` for `q` + `country` |
| GET | `product` | one product with denominations |
| GET | `img` | proxied product image (opaque id + HMAC, never a supplier URL) |
| POST | `session` | wallet sign-in: `verifyMessage` → session token |
| POST | `order` | quote in USDC (supplier price + conversion via a bridge quote), returns `orderId` and amount |
| POST | `status` | order state machine: `awaiting_payment → paid → bridging → bridged → delivered`, or `refunding → refunded`, or `needs_support`; returns the code (AES-GCM sealed to the buyer's wallet) when delivered |
| POST | `history` | the wallet's orders |

Design invariants the private code follows:

- The supplier is never named in any response, image URL, error message or client bundle.
- Every state transition is written to Redis **before** the side effect it describes, with NX locks, so a crash
  can never double-charge or lose a paid order.
- If fulfilment fails after payment, the exact amount paid is refunded to the paying wallet automatically.
- Codes are encrypted with a key derived from the buyer's wallet signature; the server stores only ciphertext.

Environment variables used: `ARCPAY_PROVIDER_KEY`, `ARCPAY_HOT_KEY`, `ARCPAY_TREASURY`, `KV_*` / `UPSTASH_*`,
`ARC_RPC_URL`. In development without a provider key the frontend runs against a demo catalogue (`ARCPAY_MOCK`).
