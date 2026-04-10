/**
 * GitHub Router — Recent Commit History
 *
 * Fetches the latest commits from the simplebiscuits/Good-Gravy-2 repository
 * using the GitHub REST API with an authenticated token. Supports pagination
 * for up to 200 commits. Results are cached in memory for 5 minutes.
 *
 * Token resolution order:
 * 1. process.env.GITHUB_API_TOKEN (platform-injected)
 * 2. `gh auth token` CLI fallback (dev sandbox)
 */
import { z } from "zod";
import { execSync } from "child_process";
import { publicProcedure, router } from "../_core/trpc";

const GITHUB_OWNER = "simplebiscuits";
const GITHUB_REPO = "Good-Gravy-2";
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
 * Resolve a working GitHub token. Tries the env var first, then falls back
 * to the `gh` CLI which may have a fresher token in dev sandboxes.
 */
async function getGitHubToken(): Promise<string> {
  if (resolvedToken) return resolvedToken;

  const envToken = process.env.GITHUB_API_TOKEN ?? "";
  if (envToken) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "VOP-Platform",
            Authorization: `token ${envToken}`,
          },
        }
      );
      if (res.ok) {
        resolvedToken = envToken;
        console.log("[GitHub] Using GITHUB_API_TOKEN from environment");
        return envToken;
      }
      console.warn(`[GitHub] GITHUB_API_TOKEN returned ${res.status} — trying gh CLI fallback`);
    } catch {
      console.warn("[GitHub] GITHUB_API_TOKEN validation failed — trying gh CLI fallback");
    }
  }

  try {
    const ghToken = execSync("gh auth token", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    }).trim();
    if (ghToken) {
      resolvedToken = ghToken;
      console.log("[GitHub] Using token from gh CLI");
      return ghToken;
    }
  } catch {
    // gh CLI not available or not authenticated
  }

  console.warn("[GitHub] No working GitHub token found");
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
  if (!token) {
    console.warn("[GitHub] No GITHUB_API_TOKEN configured — cannot fetch commits");
    return cachedCommits?.slice(0, count) ?? [];
  }

  const capped = Math.min(count, MAX_COMMITS);
  const pages = Math.ceil(capped / MAX_PER_PAGE);
  const allCommits: CommitEntry[] = [];

  try {
    for (let page = 1; page <= pages; page++) {
      const perPage = Math.min(MAX_PER_PAGE, capped - allCommits.length);
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=${perPage}&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "VOP-Platform",
          Authorization: `token ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          resolvedToken = null;
        }
        console.warn(`[GitHub] API returned ${res.status}: ${res.statusText} (page ${page})`);
        break;
      }

      const data = (await res.json()) as any[];
      if (data.length === 0) break; // No more commits

      allCommits.push(...data.map(parseCommit));
      if (data.length < perPage) break; // Last page
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
