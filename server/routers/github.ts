/**
 * GitHub Router — Recent Commit History
 *
 * Fetches the latest commits from the simplebiscuits/Good-Gravy-2 repository
 * using the GitHub REST API. Supports pagination for up to 200 commits.
 * Results are cached in memory for 5 minutes.
 *
 * Token resolution order:
 * 1. process.env.GITHUB_API_TOKEN (platform-injected)
 * 2. `gh auth token` CLI fallback (dev sandbox)
 *
 * If no token works, falls back to the public API (stricter rate limits).
 */
import { z } from "zod";
import { execSync } from "child_process";
import { publicProcedure, router } from "../_core/trpc";

const GITHUB_OWNER = "simplebiscuits";
const GITHUB_REPO = "Good-Gravy-2";
const DEFAULT_BRANCH = "grok"; // Active development branch
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PER_PAGE = 100; // GitHub API max per page
const MAX_COMMITS = 200; // Our upper limit

interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorAvatar: string | null;
  date: string;
  url: string;
}

let cachedCommits: CommitEntry[] | null = null;
let cachedCount = 0;
let cacheTimestamp = 0;
let resolvedToken: string | null = null;

/**
 * Resolve a working GitHub token.
 * Priority: GH_TOKEN (sandbox/platform) > GITHUB_API_TOKEN (user-set) > gh CLI fallback
 * IMPORTANT: GH_TOKEN is the primary working token. GITHUB_API_TOKEN has historically
 * been unreliable (truncated/expired). Always try GH_TOKEN first.
 */
async function getGitHubToken(): Promise<string> {
  if (resolvedToken) return resolvedToken;

  // 1. Try GH_TOKEN first — this is the platform-injected token that gh CLI uses
  const ghEnvToken = process.env.GH_TOKEN ?? "";
  if (ghEnvToken && ghEnvToken.length > 10) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "VOP-Platform",
            Authorization: `token ${ghEnvToken}`,
          },
        }
      );
      if (res.ok) {
        resolvedToken = ghEnvToken;
        console.log("[GitHub] Using GH_TOKEN from environment");
        return ghEnvToken;
      }
      console.warn(`[GitHub] GH_TOKEN returned ${res.status}`);
    } catch {
      console.warn("[GitHub] GH_TOKEN validation failed");
    }
  }

  // 2. Try GITHUB_API_TOKEN (user-configured secret)
  const apiToken = process.env.GITHUB_API_TOKEN ?? "";
  if (apiToken && apiToken.length > 10) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "VOP-Platform",
            Authorization: `token ${apiToken}`,
          },
        }
      );
      if (res.ok) {
        resolvedToken = apiToken;
        console.log("[GitHub] Using GITHUB_API_TOKEN from environment");
        return apiToken;
      }
      console.warn(`[GitHub] GITHUB_API_TOKEN returned ${res.status}`);
    } catch {
      console.warn("[GitHub] GITHUB_API_TOKEN validation failed");
    }
  }

  // 3. Fallback to gh CLI (sandbox only)
  try {
    const cliToken = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
    if (cliToken && cliToken.length > 10) {
      resolvedToken = cliToken;
      console.log("[GitHub] Using token from gh CLI");
      return cliToken;
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  console.warn("[GitHub] No working GitHub token — will try unauthenticated API");
  return "";
}

function parseCommit(item: any): CommitEntry {
  return {
    sha: item.sha,
    shortSha: item.sha.substring(0, 7),
    message: item.commit?.message ?? "",
    author: item.commit?.author?.name ?? item.author?.login ?? "Unknown",
    authorAvatar: item.author?.avatar_url ?? null,
    date: item.commit?.author?.date ?? new Date().toISOString(),
    url:
      item.html_url ??
      `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${item.sha}`,
  };
}

/**
 * Fetch commits with pagination. GitHub API returns max 100 per page,
 * so for >100 we need multiple requests.
 */
async function fetchCommitsFromGitHub(count: number): Promise<CommitEntry[]> {
  const now = Date.now();
  // Use cache if fresh and has enough commits
  if (cachedCommits && now - cacheTimestamp < CACHE_TTL_MS && cachedCount >= count) {
    return cachedCommits.slice(0, count);
  }

  const token = await getGitHubToken();
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "VOP-Platform",
  };
  if (token) {
    headers.Authorization = `token ${token}`;
  }

  const capped = Math.min(count, MAX_COMMITS);
  const pages = Math.ceil(capped / MAX_PER_PAGE);
  const allCommits: CommitEntry[] = [];

  try {
    for (let page = 1; page <= pages; page++) {
      const perPage = Math.min(MAX_PER_PAGE, capped - allCommits.length);
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${DEFAULT_BRANCH}&per_page=${perPage}&page=${page}`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        if (res.status === 401 && token) {
          resolvedToken = null;
        }
        const errBody = await res.text();
        console.warn(
          `[GitHub] API returned ${res.status}: ${res.statusText} (page ${page})`,
          errBody.slice(0, 200)
        );
        break;
      }

      const raw = (await res.json()) as unknown;
      if (!Array.isArray(raw)) {
        console.warn("[GitHub] Expected JSON array of commits, got:", typeof raw);
        break;
      }
      if (raw.length === 0) break;

      allCommits.push(...raw.map(parseCommit));
      if (raw.length < perPage) break;
    }

    if (allCommits.length > 0) {
      cachedCommits = allCommits;
      cachedCount = allCommits.length;
      cacheTimestamp = now;
    }
    return allCommits.slice(0, capped);
  } catch (err) {
    console.warn("[GitHub] Failed to fetch commits:", (err as Error).message);
    return cachedCommits?.slice(0, count) ?? [];
  }
}

export const githubRouter = router({
  /**
   * Get recent commits from the VOP GitHub repository.
   * Default: last 15 commits. Max: 200.
   */
  getRecentCommits: publicProcedure
    .input(
      z
        .object({
          count: z.number().min(1).max(MAX_COMMITS).optional(),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const count = input?.count ?? 15;
      const commits = await fetchCommitsFromGitHub(count);
      return {
        repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        repoUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
        commits,
        totalRequested: count,
      };
    }),
});
