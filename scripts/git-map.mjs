#!/usr/bin/env node
/**
 * Generates docs/git-repository-map.html — Git Graph–style view (git log --graph).
 * Default: scope = remote-tracking refs only (e.g. origin/*), and fetch that remote
 * before each CLI run so the map matches the server. Watch mode polls fetch on an interval.
 *
 * Env: GIT_MAP_REMOTE (default origin), GIT_MAP_MAX_COMMITS, GIT_MAP_FETCH=0 to skip fetch,
 *      GIT_MAP_FETCH_INTERVAL_SEC (watch, default 120; 0 disables poll),
 *      GIT_MAP_LOCAL=1 to include local branches (--all) instead of --remotes.
 * Args: --watch | -w, --no-fetch, --local
 */
import { execSync } from "node:child_process";
import { mkdirSync, watch, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_FILE = join(REPO_ROOT, "docs", "git-repository-map.html");

const SEP = "\x01";
const MAX_COMMITS = Number(process.env.GIT_MAP_MAX_COMMITS || 250);
const FETCH_INTERVAL_SEC = Number(process.env.GIT_MAP_FETCH_INTERVAL_SEC ?? 120);
const PALETTE = [
  "#e3b341",
  "#3b8eea",
  "#2ea043",
  "#d2a8ff",
  "#79c0ff",
  "#ff7b72",
  "#56d364",
  "#ffa657",
];

/** @param {string} name */
function sanitizeRemote(name) {
  const t = String(name || "origin").trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(t)) {
    throw new Error(`git-map: invalid GIT_MAP_REMOTE "${name}"`);
  }
  return t;
}

const REMOTE = sanitizeRemote(process.env.GIT_MAP_REMOTE || "origin");

function git(args, cwd = REPO_ROOT) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    cwd,
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

/** @returns {{ ok: boolean, skipped?: boolean, error?: string }} */
function fetchRemote(remote) {
  if (process.env.GIT_MAP_FETCH === "0") {
    return { ok: true, skipped: true };
  }
  try {
    execSync(`git fetch ${remote} --prune`, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    let stderr = "";
    if (e && e.stderr) {
      stderr = Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf8") : String(e.stderr);
    }
    const msg = (stderr || e.message || String(e)).trim().slice(0, 240);
    console.warn(`git-map: fetch ${remote} fehlgeschlagen (Offline / kein Netz?): ${msg}`);
    return { ok: false, error: msg };
  }
}

function shortHash(full) {
  return full.slice(0, 7);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** @param {string} deco */
function decorationPills(deco) {
  if (!deco || !deco.trim()) return "";
  const parts = deco.split(",").map((p) => p.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    let cls = "pill branch";
    let label = escapeHtml(p);
    if (p.startsWith("HEAD ->")) {
      cls = "pill head";
    } else if (p.startsWith("tag: ")) {
      cls = "pill tag";
      label = escapeHtml(p.slice(5).trim());
    }
    out.push(`<span class="${cls}">${label}</span>`);
  }
  return out.join("");
}

/**
 * @param {string} prefix
 * @param {{ merge?: boolean }} opts
 */
function colorizeGraphPrefix(prefix, opts = {}) {
  const merge = Boolean(opts.merge);
  let pipeIdx = 0;
  let html = "";
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i];
    if (c === "|") {
      const col = PALETTE[pipeIdx % PALETTE.length];
      pipeIdx++;
      html += `<span class="lane" style="color:${col}">|</span>`;
    } else if (c === "*") {
      const col = PALETTE[pipeIdx % PALETTE.length];
      const sym = merge ? "○" : "●";
      html += `<span class="dot" style="color:${col}">${sym}</span>`;
    } else if (c === "/" || c === "\\") {
      html += `<span class="fork">${escapeHtml(c)}</span>`;
    } else {
      html += `<span class="gpad">${escapeHtml(c)}</span>`;
    }
  }
  return html;
}

function isMergeSubject(subject) {
  return /^merge\b/i.test(String(subject || "").trim());
}

/**
 * @param {{ remote: string, local: boolean, fetchResult: { ok: boolean, skipped?: boolean, error?: string } }} opts
 */
function buildLogRows(opts) {
  const { remote, local, fetchResult } = opts;
  const scope = local ? "--all" : `--remotes=${remote}`;
  let raw = "";
  try {
    raw = git(
      `log ${scope} --graph --color=never --max-count=${MAX_COMMITS} --date=short --pretty=format:${SEP}%H${SEP}%s${SEP}%an${SEP}%ad${SEP}%D${SEP}`,
    );
  } catch (e) {
    const hint = local
      ? "Keine Commits unter --all, oder kein Git-Repo?"
      : `Kein Remote „${remote}“ / keine refs/remotes/${remote}/*? Einmal „git fetch ${remote}“ ausführen.`;
    throw new Error(`${e.message || e}\n${hint}`);
  }
  const lines = raw.split("\n");
  /** @type {Array<{ kind: 'commit', graph: string, hash: string, subject: string, author: string, date: string, deco: string, merge: boolean } | { kind: 'connector', graph: string }>} */
  const rows = [];

  for (const line of lines) {
    if (!line) continue;
    if (!line.includes(SEP)) {
      rows.push({ kind: "connector", graph: line });
      continue;
    }
    const parts = line.split(SEP);
    const graph = parts[0] ?? "";
    const hash = parts[1] ?? "";
    const subject = parts[2] ?? "";
    const author = parts[3] ?? "";
    const date = parts[4] ?? "";
    const deco = parts[5] ?? "";
    const merge = isMergeSubject(subject);
    rows.push({
      kind: "commit",
      graph,
      hash,
      subject,
      author,
      date,
      deco,
      merge,
    });
  }

  let originHead = "";
  if (!local) {
    try {
      originHead = git(`rev-parse ${remote}/HEAD`);
    } catch {
      try {
        originHead = git(`rev-parse refs/remotes/${remote}/HEAD`);
      } catch {
        originHead = "";
      }
    }
  }

  let localHead = "";
  try {
    localHead = git("rev-parse HEAD");
  } catch {
    localHead = "";
  }

  let totalCount = 0;
  try {
    totalCount = Number(String(git(`rev-list ${scope} --count`)).trim()) || 0;
  } catch {
    totalCount = 0;
  }
  return {
    rows,
    meta: {
      generatedAt: new Date().toISOString(),
      lineCount: rows.length,
      maxCommits: MAX_COMMITS,
      truncated: totalCount > MAX_COMMITS,
      totalCommitsHint: totalCount,
      remote,
      localScope: local,
      fetchOk: fetchResult.ok,
      fetchSkipped: Boolean(fetchResult.skipped),
      fetchError: fetchResult.error || null,
      originHead: !local && originHead ? originHead : null,
      localHead: localHead || null,
    },
  };
}

/**
 * @param {ReturnType<typeof buildLogRows>} data
 */
function renderHtml(data) {
  const { rows, meta } = data;
  const body = rows
    .map((row) => {
      if (row.kind === "connector") {
        const g = colorizeGraphPrefix(row.graph, {});
        return `<div class="row connector" aria-hidden="true"><div class="graph">${g}</div><div class="rest"></div></div>`;
      }
      const g = colorizeGraphPrefix(row.graph, { merge: row.merge });
      const pills = decorationPills(row.deco);
      const subj = escapeHtml(row.subject);
      const auth = escapeHtml(row.author);
      const when = escapeHtml(row.date);
      const hash = escapeHtml(shortHash(row.hash));
      const title = escapeHtml(`${row.hash}\n${row.subject}`);
      return `<div class="row commit" title="${title}">
  <div class="graph mono" aria-hidden="true">${g}</div>
  <div class="msg"><span class="subj">${subj}</span></div>
  <div class="meta"><span class="who">${auth}</span><span class="when">${when}</span></div>
  <div class="refs">${pills}</div>
  <div class="hash mono">${hash}</div>
</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Git — Graph</title>
  <style>
    :root {
      --bg: #1e1e1e;
      --bg-h: #252526;
      --border: #3c3c3c;
      --txt: #d4d4d4;
      --muted: #9d9d9d;
      --diag: #6e7681;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: var(--bg);
      color: var(--txt);
      font-size: 13px;
      line-height: 1.45;
    }
    #toolbar {
      padding: 8px 12px;
      background: #252526;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-wrap: wrap;
      gap: 10px 16px;
      align-items: center;
      font-size: 12px;
    }
    #toolbar strong { color: #cca700; font-weight: 600; }
    code { font-family: ui-monospace, Consolas, monospace; background: #2d2d2d; padding: 1px 6px; border-radius: 3px; font-size: 11px; }
    #scroll {
      overflow: auto;
      height: calc(100vh - 40px);
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, max-content) minmax(200px, 1fr) minmax(120px, 160px) minmax(120px, 1fr) 72px;
      gap: 0 12px;
      align-items: center;
      padding: 2px 12px;
      border-bottom: 1px solid #2a2a2a;
      min-height: 22px;
    }
    .row.commit:hover { background: var(--bg-h); }
    .row.connector {
      grid-template-columns: minmax(0, max-content) 1fr;
      padding: 0 12px;
      min-height: 16px;
      border-bottom: none;
    }
    .row.connector .graph { padding-top: 0; padding-bottom: 0; }
    .graph {
      font-family: Consolas, "Courier New", monospace;
      font-size: 13px;
      line-height: 18px;
      white-space: pre;
      padding: 1px 0;
      user-select: none;
    }
    .graph .fork { color: var(--diag); }
    .graph .gpad { color: #555; }
    .msg {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
    .meta {
      color: var(--muted);
      font-size: 12px;
      display: flex;
      flex-direction: column;
      gap: 0;
      line-height: 1.25;
    }
    .refs {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      justify-content: flex-start;
    }
    .pill {
      display: inline-block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 10px;
      border: 1px solid #444;
      background: #2d2d2d;
      color: #c8c8c8;
    }
    .pill.head { border-color: #cca700; color: #f0e090; background: #3a3420; }
    .pill.tag { border-color: #6e7681; color: #e6edf3; font-style: normal; }
    .pill.branch { border-color: #388bfd44; color: #79c0ff; background: #1f2a3d; }
    .hash {
      text-align: right;
      color: var(--muted);
      font-size: 12px;
    }
    @media (max-width: 900px) {
      .row {
        grid-template-columns: minmax(0, max-content) 1fr;
        grid-template-rows: auto auto;
      }
      .meta, .refs, .hash { display: none; }
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <span><strong>GRAPH</strong> — ${meta.lineCount} lines${meta.truncated ? ` (max ${meta.maxCommits} commits, truncated)` : ""}</span>
    <span>${meta.localScope ? "Source: <strong>local + remote (--all)</strong>" : `Source: <strong>remote ${escapeHtml(meta.remote)}</strong> (refs/remotes/${escapeHtml(meta.remote)}/* only)`}</span>
    <span>Fetch: <code>${meta.fetchSkipped ? "skipped" : meta.fetchOk ? "ok" : "failed"}</code>${meta.fetchError ? ` <span style="color:#ff7b48">${escapeHtml(meta.fetchError)}</span>` : ""}</span>
    <span>Generated: <code>${escapeHtml(meta.generatedAt)}</code></span>
    ${!meta.localScope && meta.originHead ? `<span>${escapeHtml(meta.remote)}/HEAD: <code>${escapeHtml(shortHash(meta.originHead))}</code></span>` : ""}
    ${meta.localScope && meta.localHead ? `<span>HEAD: <code>${escapeHtml(shortHash(meta.localHead))}</code></span>` : ""}
    <span style="opacity:.85">Git Graph–style · hover row for full message</span>
  </div>
  <div id="scroll">${body}</div>
</body>
</html>
`;
}

/**
 * @param {{ doFetch?: boolean, local?: boolean }} [opts]
 */
function generate(opts = {}) {
  const doFetch = opts.doFetch !== false;
  const local =
    Boolean(opts.local) ||
    process.env.GIT_MAP_LOCAL === "1" ||
    process.env.GIT_MAP_LOCAL === "true";

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  let fetchResult = { ok: true, skipped: true };
  if (doFetch) {
    fetchResult = fetchRemote(REMOTE);
  }

  const data = buildLogRows({ remote: REMOTE, local, fetchResult });
  writeFileSync(OUT_FILE, renderHtml(data), "utf8");
  console.log(`git-map: wrote ${OUT_FILE} (${data.rows.length} lines, ${local ? "--all" : `--remotes=${REMOTE}`})`);
}

/**
 * @param {{ noFetch?: boolean, local?: boolean }} [cli]
 */
function watchGit(cli = {}) {
  const gitDir = join(REPO_ROOT, ".git");
  if (!existsSync(gitDir)) {
    console.error("git-map: not a git repository");
    process.exit(1);
  }
  let t = null;
  const schedule = (doFetch) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      try {
        generate({ doFetch, local: cli.local });
      } catch (e) {
        console.error("git-map:", e.message || e);
      }
    }, 400);
  };

  generate({ doFetch: !cli.noFetch, local: cli.local });
  console.log("git-map: watching .git for changes (Ctrl+C to stop)");
  if (!cli.local && !cli.noFetch && FETCH_INTERVAL_SEC > 0) {
    console.log(
      `git-map: zusätzlich fetch ${REMOTE} alle ${FETCH_INTERVAL_SEC}s (GIT_MAP_FETCH_INTERVAL_SEC=0 zum Abschalten)`,
    );
    setInterval(() => {
      try {
        generate({ doFetch: true, local: cli.local });
      } catch (e) {
        console.error("git-map:", e.message || e);
      }
    }, FETCH_INTERVAL_SEC * 1000);
  }

  const watchOpts = { persistent: true };
  try {
    watch(join(gitDir, "HEAD"), watchOpts, () => schedule(false));
  } catch (_) {}
  try {
    watch(join(gitDir, "packed-refs"), watchOpts, () => schedule(false));
  } catch (_) {}
  try {
    watch(join(gitDir, "refs"), { ...watchOpts, recursive: true }, () => schedule(false));
  } catch (e) {
    watch(join(gitDir, "refs", "heads"), watchOpts, () => schedule(false));
    watch(join(gitDir, "refs", "remotes"), watchOpts, () => schedule(false));
  }
}

const args = process.argv.slice(2);
const noFetch = args.includes("--no-fetch");
const local = args.includes("--local");
if (args.includes("--watch") || args.includes("-w")) {
  watchGit({ noFetch, local });
} else {
  try {
    generate({ doFetch: !noFetch, local });
  } catch (e) {
    console.error("git-map:", e.message || e);
    process.exit(1);
  }
}
