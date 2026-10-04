# Arc Kit Wallet (mobile)

A self-custodial wallet for Arc (chain 5042) with every Arc Kit tool built in. Expo / React Native, TypeScript, viem.

## What it does

- **Wallet.** 12-word seed phrase generated on the phone (BIP-39, first Ethereum account), stored in the iOS Keychain / Android Keystore via `expo-secure-store`. 6-digit PIN, optional Face ID / fingerprint unlock, auto-lock after 5 minutes in the background. Import any Ethereum-style phrase.
- **USDC first.** Native USDC balance, Arc tokens (AKIT, ARCMAN, ARCOON, AF, ASTOCK plus any you add), prices from the ArcLend oracle, send / receive with QR, activity from Etherscan via `api/activity.js`.
- **ArcP2P and ArcLend natively.** Browse, buy, list and cancel P2P listings; supply, withdraw, deposit collateral, borrow and repay on ArcLend. Same contracts and rules as the website.
- **Every other tool through the in-app browser.** `app/dapp.tsx` loads usearckit.locker pages in a WebView and injects the wallet as `window.ethereum` (EIP-1193 + EIP-6963 announce as "Arc Kit Wallet"). Reads go straight to the RPC; `eth_sendTransaction`, `personal_sign` and `eth_signTypedData_v4` pause on a confirmation sheet before the key signs anything. `eth_sign` is disabled.

## Structure

```
app/                 expo-router routes
  _layout.tsx        fonts, QueryClient, WalletProvider, auth gate
  onboarding/        welcome, create (show → confirm 3 words → PIN), import
  unlock.tsx         PIN / biometrics
  (tabs)/            index (wallet), p2p, lend, tools, settings
  send, receive, activity, token-add, backup, dapp
src/
  chain.ts           Arc chain, public client, known tokens, contract addresses (from ../deployments)
  contracts.ts       ABIs for ERC-20, ArcP2P, ArcLend; plain-language error texts
  wallet/            store.ts (secure storage), provider.tsx (session, lock), useTx.ts (sign → wait → refresh)
  hooks/             balances, listings, pools, markets, positions, activity
  dapp/injected.ts   the provider script injected into the WebView
  components/        ui.tsx (Arc visual system), PinPad, TxStatus
```

## Run

```bash
cd mobile
npm install
npx expo start            # scan with Expo Go (iOS/Android) or press w for the web preview
```

The web preview is for design checks only: it stores the seed in `localStorage` and has no in-app browser. Expo Go cannot use Face ID; everything else works.

## Build

```bash
npm i -g eas-cli
eas login
eas build:configure
eas build -p android --profile preview    # .apk for testers
eas build -p ios                          # needs an Apple developer account
```

Bundle ids: `locker.usearckit.wallet` (iOS and Android). Icons and splash use the Arc Kit mark in `assets/`.

## Security notes

- The seed never leaves the secure slot except to derive the account in memory after an unlock; it is cleared on lock.
- The PIN is stored as a keccak hash; six wrong attempts do not wipe (the user can erase and re-import from the lock screen).
- The WebView only loads `https://` pages and starts on usearckit.locker. Any site that gets loaded sees the wallet address; it cannot sign without the confirmation sheet.
- Gas is USDC. The app warns before a transfer that would leave less than 0.01 USDC for fees.
