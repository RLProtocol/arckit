# Arc Kit MCP launch posts

Package: https://www.npmjs.com/package/arckit-pay-mcp
Every post below is inside X's 280-character limit, with links counted as 23 characters.
A screen recording of "buy me a Starbucks card" in Claude Desktop would carry the first post well.

## Single post

```
Arc Kit MCP is live.

Give Claude, Cursor or any AI agent its own USDC wallet on Arc and let it buy gift cards for you.

"Buy me a $10 Starbucks card" → it quotes the price, you say yes, the code appears.

Install:
npx -y arckit-pay-mcp

npmjs.com/package/arckit-pay-mcp
```

## Thread

**1**

```
Arc Kit MCP is live.

Your AI can now have its own wallet on Arc and spend USDC on real things.

Tell Claude "buy me a $10 Starbucks card". It quotes the price in USDC, you say yes, and the code lands in the chat.

Open source, one line to install 👇

npmjs.com/package/arckit-pay-mcp
```

**2**

```
What it is

An MCP server: a small program that plugs into Claude Desktop, Claude Code, Cursor, Windsurf and any MCP-compatible AI.

The AI gets nine tools: check its wallet, browse and search gift cards in 100+ countries, quote a price, buy, and show purchase history.
```

**3**

```
Install

Claude Code, one line:
claude mcp add arckit-pay -- npx -y arckit-pay-mcp

Claude Desktop / Cursor / Windsurf, add to your MCP config:
"arckit-pay": { "command": "npx", "args": ["-y", "arckit-pay-mcp"] }

That's it. No account, no API key.
```

**4**

```
Use it

1. "Show me your ArcPay wallet" → it gives you an Arc address
2. Send it a few USDC. Gas on Arc is USDC too
3. "I'm in the US. Buy me a $10 Starbucks card"
4. It quotes the exact USDC price and asks you to confirm
5. "Yes" → code + redeem steps, usually under a minute
```

**5**

```
Built to be safe

• 50 USDC per purchase, 100 per day by default. The AI can't change the limits
• The private key stays on your machine. No tool can reveal it
• It never buys without a quote and your yes
• Failed orders refund the wallet automatically
```

**6**

```
Steam, PlayStation, Xbox, Netflix, Uber, Airbnb, Starbucks, Nike, Google Play, Apple and thousands more, priced in your currency, paid in USDC.

Try it: npx -y arckit-pay-mcp
Web version: arc-tools.vercel.app/pay

Next: a hosted version for claude.ai and ChatGPT.
```

## Notes on the claims

- "Under a minute": the two real purchases made through the tools delivered in 12 and 13 seconds. The copy says
  "usually".
- "Open source": true only once the `mcp/` folder is on a public repo. It is not yet. Either publish it to GitHub
  before posting, or cut "Open source," from post 1.
- The supplier is not named anywhere, as requested.
