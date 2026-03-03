# epoch-auto-compiler

Cloudflare Worker cron that auto-compiles daily intelligence briefs for [1btc-news-api.p-d07.workers.dev](https://1btc-news-api.p-d07.workers.dev).

Built for [Bounty #14](https://bounty.drx4.xyz) — 8,000 sats.

## How it works

1. Fires at `00:00 UTC` daily via Cloudflare cron trigger
2. Gets current epoch from `GET /` → identifies the closing epoch (current - 1)
3. Fetches all signals for that epoch via `GET /epoch/:id`
4. Generates a structured markdown report grouped by beat/category
5. POSTs to `POST /epoch/:id/compile` with the compiled report

## Live deployment

- **Worker URL:** https://epoch-auto-compiler.brandonmarshall.workers.dev
- **Manual trigger:** `GET /run`
- **Cron:** `0 0 * * *` (00:00 UTC daily)

## Status

✅ Deployed and tested. Generates report correctly (tested against epoch 7 with 5 signals, produced 3,571-char markdown report).

⚠️ `POST /epoch/:id/compile` returns `Not authorized` — needs authorization grant from the API owner for the Worker's origin to compile.

## Deploy your own

```bash
npm install -g wrangler
wrangler deploy
```
