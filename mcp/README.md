# arckit-pay-mcp

Give your AI assistant a wallet and let it buy gift cards and mobile top-ups for you with USDC.

An [MCP](https://modelcontextprotocol.io) server for ArcPay, part of [Arc Kit](https://arc-tools.vercel.app).
Works with Claude Desktop, Claude Code, Cursor, Windsurf, Gemini CLI and any other MCP client.

```
You:  buy me a $10 Starbucks card
AI:   Which country is that for?
You:  US
AI:   Starbucks $10 is 10.19 USDC. Go ahead?
You:  yes
AI:   Delivered. Code: XXXX-XXXX-XXXX. To redeem, open the Starbucks app, choose "Add card"…
```

## Install

Claude Code:

```
claude mcp add arckit-pay -- npx -y arckit-pay-mcp
```

Claude Desktop, Cursor, Windsurf (add to the MCP config file):

```json
{
  "mcpServers": {
    "arckit-pay": { "command": "npx", "args": ["-y", "arckit-pay-mcp"] }
  }
}
```

Then ask the assistant to show its wallet. It prints an address on the Arc network. Send USDC there and it can
shop. Gas on Arc is paid in USDC, so nothing else is needed.

## What the assistant can do

| Tool | What it does |
|---|---|
| `wallet` | Address, USDC balance, spending limits, default country |
| `browse_products` | Trending gift cards and top-ups for a country, in local currency |
| `search_products` | Find a brand by name |
| `get_product` | Amounts, requirements and brand terms for one product |
| `quote` | Lock a USDC price for about 10 minutes and get an order id |
| `buy` | Pay from the wallet, wait for delivery, return the code and redeem steps |
| `order_status` | Check an order later |
| `purchases` | Everything this wallet has bought, with codes |
| `set_default_country` | Stop being asked which country |

The assistant is told to ask for the country when it does not know it, to show you the exact USDC price and get a
yes before buying, and never to guess a product id.

## Safety

- **Spending limits.** 50 USDC per purchase and 100 USDC per day by default. Change with
  `ARCKIT_MAX_PER_PURCHASE` and `ARCKIT_DAILY_LIMIT`. The assistant cannot change them.
- **The key never leaves the machine.** It lives in `~/.arckit/wallet.json` (mode 600). There is no tool that
  reveals it. `npx arckit-pay-mcp export-key --yes` prints it for you, not for the assistant.
- **Keep the balance small.** Treat the wallet like cash in a drawer: fund what you plan to spend.
- **Failed orders refund themselves.** If a purchase cannot be completed after payment, ArcPay sends the USDC back
  to the wallet automatically.
- Codes are tied to the wallet that paid. Only a session signed by that wallet can read them.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ARCKIT_COUNTRY` | none | Default two-letter country |
| `ARCKIT_MAX_PER_PURCHASE` | 50 | USDC limit per purchase |
| `ARCKIT_DAILY_LIMIT` | 100 | USDC limit per rolling 24 hours |
| `ARCKIT_WALLET_KEY` | generated | Use your own private key |
| `ARCKIT_HOME` | `~/.arckit` | Where the wallet and settings are stored |
| `ARCKIT_RPC` | thirdweb public RPC | Arc RPC URL |

## Commands

```
npx arckit-pay-mcp              start the server (stdio)
npx arckit-pay-mcp address      print the wallet address
npx arckit-pay-mcp setup        print config snippets
npx arckit-pay-mcp export-key   print the private key (requires --yes)
npx arckit-pay-mcp --http 3333  serve Streamable HTTP at /mcp for remote clients
```

## How a purchase works

1. `quote` asks ArcPay for the supplier's price and what that costs in USDC on Arc, conversion included.
2. `buy` sends one transaction to the ArcPay router contract with the USDC as the payment. No token approval.
3. ArcPay converts and pays the supplier, then the code is returned to the wallet that paid.

ArcPay is in beta. Start with small purchases.
