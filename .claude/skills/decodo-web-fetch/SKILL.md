---
name: decodo-web-fetch
description: Use the Decodo Web Scraping API as a fallback extractor when a task needs current web-page context from docs, changelogs, npm/package pages, JavaScript-heavy pages, blocked pages, pages returning "Just a moment"/verification/captcha text, or when a direct fetch gives low-quality output. Reads DECODO_AUTH_TOKEN from the environment and returns cached Markdown plus metadata to reason from.
---

# Decodo Web Fetch

Use this skill when normal web access is likely to be weak, or when you need reliable current web context as reusable evidence.

## Use when

- The URL is an npm/package page, changelog, docs page, API reference, review/listing page, or JavaScript-heavy page.
- A direct fetch returns HTTP 403/429/5xx, very short output, "Just a moment", captcha, browser verification, access denied, or mostly navigation noise.
- You need a repeatable context pack: source URL, fetched timestamp, hash, and a local cache file.

## Workflow

1. For a simple page, a direct fetch is fine.
2. If it's blocked or low-quality, run the bundled script:

```bash
node .claude/skills/decodo-web-fetch/scripts/decodo_fetch.mjs "https://www.npmjs.com/package/ai" --compare --out .decodo-cache
```

3. Use the generated `decodo.md` and `metadata.json` as the evidence source. Cite `source_url` and `fetched_at` when summarizing.
4. Treat cached Markdown as a snapshot; refresh before relying on freshness-sensitive facts.

## Environment

Reads `DECODO_AUTH_TOKEN` from the process environment, `DECODO_ENV_FILE`, or a `.env` file in the current or parent directories. Never print, paste, or commit the token.

Where the token lives (Transfer Experience): Google Drive, cartella `_Credenziali`,
file `decodo-api-key.txt` (fileId `1ZVLLGFt9qcL6QPa_YM_42OLatArmp21P`). Scaricalo da li'
e mettilo in un file fuori dal repo, poi lancia lo script con
`DECODO_ENV_FILE=/percorso/decodo.env`. In alternativa impostalo come variabile
d'ambiente dell'environment cloud. Il token non va mai scritto dentro il repo.

## Output

Each run writes a timestamped folder containing:

- `metadata.json` — URL, direct-fetch result, Decodo result, hash, and cache paths
- `direct.txt` — direct-fetch text or failure hint
- `decodo.md` — Decodo Markdown output

With `--compare` it always runs both direct and Decodo. Without it, Decodo is called only when the direct fetch looks blocked/low-quality, or when `--force-decodo` is passed.
