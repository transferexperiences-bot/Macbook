#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DECODO_ENDPOINT = "https://scraper-api.decodo.com/v2/scrape";
const BLOCKED_RE = /just a moment|captcha|robot check|verification|verify your browser|access denied|forbidden|enable javascript|cloudflare/i;

function usage() {
  console.error([
    "Usage:",
    "  node decodo_fetch.mjs <url> [--compare] [--force-decodo] [--out <dir>]",
    "",
    "Examples:",
    "  node decodo_fetch.mjs https://www.npmjs.com/package/ai --compare --out .decodo-cache",
    "  node decodo_fetch.mjs https://ai-sdk.dev/docs --force-decodo"
  ].join("\n"));
}

function parseArgs(argv) {
  const args = { compare: false, forceDecodo: false, outDir: path.join(process.cwd(), ".decodo-cache") };
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--compare") args.compare = true;
    else if (arg === "--force-decodo" || arg === "--force") args.forceDecodo = true;
    else if (arg === "--out") {
      const value = argv[i + 1];
      if (!value) throw new Error("--out requires a directory");
      args.outDir = path.resolve(value);
      i += 1;
    } else if (arg.startsWith("--out=")) {
      args.outDir = path.resolve(arg.slice("--out=".length));
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      rest.push(arg);
    }
  }

  if (rest.length !== 1) throw new Error("Expected exactly one URL");
  args.url = rest[0];
  new URL(args.url);
  return args;
}

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadEnv() {
  if (process.env.DECODO_ENV_FILE) readEnvFile(path.resolve(process.env.DECODO_ENV_FILE));

  let current = process.cwd();
  while (true) {
    readEnvFile(path.join(current, ".env"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

}

function stripHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "page";
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function extractMarkdown(payload) {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const candidates = [
    payload.markdown,
    payload.content,
    payload.html,
    payload.results?.[0]?.markdown,
    payload.results?.[0]?.content,
    payload.results?.[0]?.html,
    payload.data?.markdown,
    payload.data?.content,
    payload.data?.html
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return JSON.stringify(payload, null, 2);
}

function looksLowQuality({ status, text, url }) {
  const hostname = new URL(url).hostname;
  if (!status || status >= 400) return true;
  if ((text ?? "").length < 1000) return true;
  if (BLOCKED_RE.test(text ?? "")) return true;
  if (/npmjs\.com$/.test(hostname) && /\/package\//.test(new URL(url).pathname)) return true;
  return false;
}

async function directFetch(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "user-agent": "Mozilla/5.0 DecodoSkill/1.0"
      }
    });
    const raw = await response.text();
    const text = stripHtml(raw);
    return {
      ok: response.ok,
      status: response.status,
      elapsed_ms: Date.now() - startedAt,
      content_type: response.headers.get("content-type"),
      raw_chars: raw.length,
      text_chars: text.length,
      blocked_hint: BLOCKED_RE.test(text),
      text
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      elapsed_ms: Date.now() - startedAt,
      error: error.message,
      text: ""
    };
  }
}

async function decodoFetch(url) {
  const token = process.env.DECODO_AUTH_TOKEN;
  if (!token) {
    throw new Error("Missing DECODO_AUTH_TOKEN. Set it in the environment, DECODO_ENV_FILE, or a local .env file.");
  }

  const startedAt = Date.now();
  const response = await fetch(DECODO_ENDPOINT, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url,
      headless: "html",
      markdown: true
    })
  });

  const rawResponse = await response.text();
  let payload;
  try {
    payload = JSON.parse(rawResponse);
  } catch {
    payload = rawResponse;
  }

  if (!response.ok) {
    throw new Error(`Decodo scrape failed: HTTP ${response.status} ${rawResponse.slice(0, 400)}`);
  }

  const markdown = extractMarkdown(payload).trim();
  return {
    ok: true,
    status: response.status,
    elapsed_ms: Date.now() - startedAt,
    response_chars: rawResponse.length,
    markdown_chars: markdown.length,
    heading_count: (markdown.match(/^#{1,6}\s+\S/gm) ?? []).length,
    blocked_hint: BLOCKED_RE.test(markdown),
    markdown
  };
}

function writeRun({ args, direct, decodo, usedDecodo }) {
  const slug = slugify(args.url);
  const runDir = path.join(args.outDir, `${timestampForPath()}-${slug}`);
  ensureDir(runDir);

  const directPath = path.join(runDir, "direct.txt");
  const decodoPath = path.join(runDir, "decodo.md");
  const metadataPath = path.join(runDir, "metadata.json");

  fs.writeFileSync(directPath, `${direct.text || direct.error || ""}\n`);
  if (decodo?.markdown) fs.writeFileSync(decodoPath, `${decodo.markdown}\n`);

  const metadata = {
    source_url: args.url,
    fetched_at: new Date().toISOString(),
    direct_fetch: {
      ok: direct.ok,
      status: direct.status,
      elapsed_ms: direct.elapsed_ms,
      content_type: direct.content_type ?? null,
      text_chars: direct.text_chars ?? 0,
      blocked_hint: Boolean(direct.blocked_hint),
      low_quality: looksLowQuality({ status: direct.status, text: direct.text, url: args.url }),
      output_file: path.basename(directPath)
    },
    decodo: decodo
      ? {
          used: usedDecodo,
          ok: decodo.ok,
          status: decodo.status,
          elapsed_ms: decodo.elapsed_ms,
          markdown_chars: decodo.markdown_chars,
          heading_count: decodo.heading_count,
          blocked_hint: Boolean(decodo.blocked_hint),
          sha256: sha256(decodo.markdown),
          output_file: path.basename(decodoPath)
        }
      : {
          used: false,
          reason: "Direct fetch looked usable and neither --compare nor --force-decodo was set."
        },
    run_dir: runDir
  };

  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { runDir, metadata };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnv();

  const direct = await directFetch(args.url);
  const lowQuality = looksLowQuality({ status: direct.status, text: direct.text, url: args.url });
  const shouldUseDecodo = args.compare || args.forceDecodo || lowQuality;
  let decodo = null;

  if (shouldUseDecodo) {
    decodo = await decodoFetch(args.url);
  }

  const { runDir, metadata } = writeRun({ args, direct, decodo, usedDecodo: shouldUseDecodo });

  console.log(`Source: ${args.url}`);
  console.log(`Direct: HTTP ${direct.status ?? "ERR"}, ${direct.text_chars ?? 0} chars, low_quality=${metadata.direct_fetch.low_quality}`);
  if (decodo) {
    console.log(`Decodo: HTTP ${decodo.status}, ${decodo.markdown_chars} Markdown chars, headings=${decodo.heading_count}`);
  } else {
    console.log("Decodo: skipped because direct fetch looked usable");
  }
  console.log(`Cache: ${runDir}`);
}

main().catch((error) => {
  console.error(error.message);
  usage();
  process.exit(1);
});
