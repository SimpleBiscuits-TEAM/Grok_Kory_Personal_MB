#!/usr/bin/env node
/**
 * Generates docs/git-repository-map.html — interactive commit/branch graph (vis-network).
 * Run with --watch to regenerate when .git refs change.
 */
import { execSync } from "node:child_process";
import { mkdirSync, watch, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const OUT_FILE = join(REPO_ROOT, "docs", "git-repository-map.html");

const MAX_COMMITS = Number(process.env.GIT_MAP_MAX_COMMITS || 500);
const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#c026d3",
  "#ea580c",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#be123c",
  "#0d9488",
  "#7c3aed",
];

function git(args, cwd = REPO_ROOT) {
  return execSync(`git ${args}`, {
    encoding: "utf8",
    cwd,
    maxBuffer: 32 * 1024 * 1024,
  }).trimEnd();
}

function shortHash(full) {
  return full.slice(0, 7);
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildGraph() {
  const logLines = git(
    `log --all --topo-order --max-count=${MAX_COMMITS} --format=%H%x09%P%x09%s`,
  ).split("\n");

  /** @type {Map<string, { parents: string[], subject: string }>} */
  const commits = new Map();
  for (const line of logLines) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    const tab2 = line.indexOf("\t", tab + 1);
    const hash = line.slice(0, tab);
    const parentsStr = line.slice(tab + 1, tab2);
    const subject = line.slice(tab2 + 1);
    const parents = parentsStr ? parentsStr.split(" ") : [];
    commits.set(hash, { parents, subject });
  }

  let refText = "";
  try {
    refText = git(
      "for-each-ref refs/heads refs/remotes --format=%(refname:short)%x09%(objectname)",
    );
  } catch {
    refText = git("for-each-ref refs/heads --format=%(refname:short)%x09%(objectname)");
  }

  /** @type {Map<string, string[]>} */
  const tips = new Map();
  for (const line of refText.split("\n")) {
    if (!line) continue;
    const [name, oid] = line.split("\t");
    if (!name || !oid) continue;
    if (!commits.has(oid)) continue;
    const arr = tips.get(oid) || [];
    arr.push(name);
    tips.set(oid, arr);
  }

  let head = "";
  try {
    head = git("rev-parse HEAD");
  } catch {
    head = "";
  }

  const branchList = [...new Set([...tips.values()].flat())].sort();
  const branchColor = new Map();
  branchList.forEach((b, i) => {
    branchColor.set(b, PALETTE[i % PALETTE.length]);
  });

  const nodes = [];
  const edges = [];
  const seen = new Set();

  for (const [hash, { parents, subject }] of commits) {
    const tipBranches = tips.get(hash) || [];
    const label =
      subject.length > 42 ? `${subject.slice(0, 40)}…` : subject || "(no subject)";
    let border = "#94a3b8";
    let bg = "#1e293b";
    if (tipBranches.length) {
      const c = branchColor.get(tipBranches[0]) || PALETTE[0];
      border = c;
      bg = "#0f172a";
    }
    if (head && hash === head) {
      border = "#fbbf24";
    }
    const titleParts = [hash, "", subject];
    if (tipBranches.length) titleParts.push("", "Branches: " + tipBranches.join(", "));
    nodes.push({
      id: hash,
      label: `${shortHash(hash)}\n${label}`,
      title: escapeHtml(titleParts.join("\n")),
      color: { background: bg, border, highlight: { background: bg, border: "#fff" } },
      font: { color: "#e2e8f0", size: 11, multi: true },
      margin: 10,
      shape: "box",
    });
    seen.add(hash);
    for (const p of parents) {
      if (commits.has(p)) {
        edges.push({
          from: p,
          to: hash,
          arrows: "to",
          color: { color: "#64748b" },
          smooth: { type: "cubicBezier", forceDirection: "vertical" },
        });
      }
    }
  }

  const totalCount = Number(String(git("rev-list --all --count")).trim()) || 0;
  return {
    nodes,
    edges,
    meta: {
      generatedAt: new Date().toISOString(),
      commitCount: commits.size,
      maxCommits: MAX_COMMITS,
      truncated: totalCount > MAX_COMMITS,
      head: head || null,
      branchList,
    },
  };
}

function renderHtml(data) {
  const payload = JSON.stringify(data);
  const { meta } = data;
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Git — Commits &amp; Branches</title>
  <script type="text/javascript" src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; background: #020617; color: #e2e8f0; }
    #toolbar {
      padding: 10px 14px;
      background: #0f172a;
      border-bottom: 1px solid #334155;
      display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
      font-size: 13px;
    }
    #toolbar strong { color: #fbbf24; }
    #net { width: 100vw; height: calc(100vh - 52px); background: #020617; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span><strong>Git-Map</strong> — ${meta.commitCount} Commits${meta.truncated ? ` (max. ${meta.maxCommits}, gekürzt)` : ""}</span>
    <span>Stand: <code>${escapeHtml(meta.generatedAt)}</code></span>
    ${meta.head ? `<span>HEAD: <code>${escapeHtml(shortHash(meta.head))}</code></span>` : ""}
    <span style="opacity:.85">Ziehen zum Verschieben · Mausrad zoomt · Klick zeigt Details</span>
  </div>
  <div id="net"></div>
  <script type="application/json" id="git-map-payload">${payload.replace(/</g, "\\u003c")}</script>
  <script>
    const DATA = JSON.parse(document.getElementById("git-map-payload").textContent);
    const container = document.getElementById("net");
    const network = new vis.Network(container, { nodes: DATA.nodes, edges: DATA.edges }, {
      interaction: { hover: true, tooltipDelay: 120, navigationButtons: true },
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -38,
          centralGravity: 0.008,
          springLength: 120,
          springConstant: 0.18,
          damping: 0.5,
          avoidOverlap: 0.9,
        },
        stabilization: { iterations: 220, updateInterval: 25 },
      },
      nodes: { borderWidth: 2, shadow: true },
      edges: { width: 1.2 },
    });
    network.once("stabilizationIterationsDone", function () {
      network.setOptions({ physics: false });
    });
  </script>
</body>
</html>
`;
}

function generate() {
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  const data = buildGraph();
  writeFileSync(OUT_FILE, renderHtml(data), "utf8");
  console.log(`git-map: wrote ${OUT_FILE} (${data.nodes.length} nodes, ${data.edges.length} edges)`);
}

function watchGit() {
  const gitDir = join(REPO_ROOT, ".git");
  if (!existsSync(gitDir)) {
    console.error("git-map: not a git repository");
    process.exit(1);
  }
  let t = null;
  const schedule = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      try {
        generate();
      } catch (e) {
        console.error("git-map:", e.message || e);
      }
    }, 400);
  };

  generate();
  console.log("git-map: watching .git for changes (Ctrl+C to stop)");

  const watchOpts = { persistent: true };
  try {
    watch(join(gitDir, "HEAD"), watchOpts, schedule);
  } catch (_) {}
  try {
    watch(join(gitDir, "packed-refs"), watchOpts, schedule);
  } catch (_) {}
  try {
    watch(join(gitDir, "refs"), { ...watchOpts, recursive: true }, schedule);
  } catch (e) {
    watch(join(gitDir, "refs", "heads"), watchOpts, schedule);
    watch(join(gitDir, "refs", "remotes"), watchOpts, schedule);
  }
}

const args = process.argv.slice(2);
if (args.includes("--watch") || args.includes("-w")) {
  watchGit();
} else {
  try {
    generate();
  } catch (e) {
    console.error("git-map:", e.message || e);
    process.exit(1);
  }
}
