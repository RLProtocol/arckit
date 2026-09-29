# ArcFlow v2 launch posts

Attach `arcflow-v2.mp4` (in this folder) to the first post. X counts every link as 23 characters.

- **Option A** is one long post. It needs X Premium, which lifts the 280-character limit.
- **Option B** is a thread. Every post is inside 280 characters, so it works on any account.
- **Option C** is the short single post, for a quote or a reminder later.

## Option A: one long post (X Premium)

```
ArcFlow v2 is live on Arc.

Three ways to put USDC to work on Arc's Uniswap v4, without doing LP maths or trusting a manager.

1/ STAKES: deposit USDC, earn swap fees every second

Your USDC goes into a band around the current price, which is where the trades actually happen. Full-range liquidity mostly sits idle. A band does not.

- Pick a width: Tight (about ±10%), Medium (±25%) or Wide (±49%). Tighter earns more per dollar and leaves the band sooner. In our tests the tight band earned 3.3x the fees of the wide one on the same dollars and the same trades.
- Deposit USDC only. The vault swaps the right share into the other token inside the same pool and adds both sides. Whatever does not fit comes back in the same transaction.
- Fees are collected every time anyone stakes, unstakes or compounds. They are converted to USDC and streamed to stakers over 7 days. Claim or compound whenever you like.
- The APR shown is the real running stream, not a projection.
- If the price leaves the band, anyone can flag it, and ten minutes later anyone can recentre it, provided the price is still out of range. No manager. A one-block price spike cannot trigger it, and a rebalance never moves the pool's price by more than 1%.
- Unstaking and claiming can never be paused.

2/ POOLS: shape your own liquidity

Open a position you hold yourself, from USDC only, in one transaction.

- Spot: one even range around the price. Simple and efficient.
- Curve: liquidity stacked densest at the price, thinning toward the edges. Best when the price stays put.
- Bid-ask: heaviest at the edges, thin in the middle. Earns on swings between two levels.
- Choose the range: ±5%, ±10%, ±25% or ±50%. The app draws exactly where your liquidity will sit before you sign.
- Collect fees any time. Close back to USDC in one click.
- Your position is tracked separately by Uniswap itself, so your fees never mix with anyone else's.

3/ LOCK: lock Uniswap v4 liquidity, with proof

Liquidity on Arc lives in Uniswap v4 positions, not LP tokens, so classic LP lockers cannot lock it. ArcFlow can.

- Lock any ArcFlow position until a date you choose. Until then nobody can remove that liquidity, including you.
- Fees stay collectable while it is locked.
- Extend the lock any time. It can never be shortened.
- The lock follows the position if you transfer it.
- Every position has a public page that reads live from the chain. That page is your proof. One link for your holders.

Bonus for new pools: a swap fee that follows volatility. 0.30% when the market is calm, rising as the price moves, capped at 3%. LPs are paid more exactly when they carry more risk. The hook has no owner, holds no funds and cannot block trades.

Works on any USDC pool on Arc, including pools that already carry a launchpad hook.

Beta and unaudited. 95 tests passing and run live on mainnet, but start small.

arc-tools.vercel.app/flow
```

## Option B: detailed thread (any account)

**1**

```
ArcFlow v2 is live on Arc.

Put USDC to work on Arc's Uniswap v4 without LP maths or a manager to trust:

1/ Stakes: earn swap fees, streamed every second
2/ Pools: shape your own liquidity
3/ Lock: lock v4 liquidity, with proof

How each one works 👇

arc-tools.vercel.app/flow
```

**2**

```
1/ STAKES

Most full-range liquidity never trades. It just sits there.

ArcFlow puts your USDC in a band around the current price, where the swaps actually happen.

Same dollars, same trades: in our tests a tight band earned 3.3x the fees of a wide one.
```

**3**

```
You choose the band:

Tight, about ±10%: most fees per dollar
Medium, about ±25%: a balance
Wide, about ±49%: rarely needs a rebalance

Deposit USDC only. The vault swaps the right share inside the same pool and adds both sides. Anything that doesn't fit is refunded instantly.
```

**4**

```
No waiting around for payouts.

Fees are collected every time anyone stakes, unstakes or compounds. They're converted to USDC and streamed to stakers over 7 days.

Claim or compound any time. The APR you see is the real running stream, not a projection.
```

**5**

```
What if the price leaves your band?

Anyone can flag it. Ten minutes later anyone can recentre it, if the price is still out of range.

No manager. A one-block price spike can't trigger it. A rebalance never moves the pool's price more than 1%.

Unstaking is never paused.
```

**6**

```
2/ POOLS

Prefer to run your own position? Open one with USDC only, in one transaction:

Spot: one even range
Curve: densest at the price, for calm markets
Bid-ask: heaviest at the edges, for swings between two levels

Range: ±5%, ±10%, ±25% or ±50%.
```

**7**

```
You see exactly where your liquidity will sit before you sign.

Collect fees any time. Close back to USDC in one click.

Your position is yours alone. Uniswap tracks its fees separately, so they never mix with anyone else's.
```

**8**

```
3/ LOCK

Liquidity on Arc lives in Uniswap v4 positions, not LP tokens. Classic LP lockers can't lock it.

ArcFlow can. Lock a position until a date you choose. Until then nobody can remove that liquidity. Not even you.
```

**9**

```
While it's locked:

Fees stay collectable
You can extend the lock, never shorten it
The lock follows the position if you transfer it

Every position has a public page that reads live from the chain. That page is your proof: one link for your holders.
```

**10**

```
Bonus for new pools: a swap fee that follows volatility.

0.30% when the market is calm, rising as price moves, capped at 3%. LPs get paid more exactly when they carry more risk.

No owner. Holds no funds. Cannot block trades.
```

**11**

```
ArcFlow v2 works on any USDC pool on Arc, including pools that already carry a launchpad hook.

Beta and unaudited. 95 tests passing and run live on mainnet, but start small.

Try it: arc-tools.vercel.app/flow
Questions: t.me/usearckit
```

## Option C: short single post

```
ArcFlow v2 is live on Arc.

Three ways to put USDC to work on Uniswap v4:

1/ Stakes: USDC into a band around the price, fees streamed every second
2/ Pools: open your own Spot, Curve or Bid-ask position
3/ Lock: lock v4 liquidity with public proof

arc-tools.vercel.app/flow
```
