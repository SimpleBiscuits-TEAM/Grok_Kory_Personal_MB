/**
 * GitHub Router — Recent Commit History
 *
 * Fetches the latest commits from the simplebiscuits/Good-Gravy-2 repository
 * using the GitHub REST API with an authenticated token. This works in both
 * local development and production deployment. Results are cached in memory
 * for 5 minutes to avoid hitting rate limits.
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
let cacheTimestamp = 0;
let resolvedToken: string | null = null;

/**
 * Resolve a working GitHub token. Tries the env var first, then falls back
 * to the `gh` CLI which may have a fresher token in dev sandboxes.
 */
async function getGitHubToken(): Promise<string> {
  // If we already resolved a working token, reuse it
  if (resolvedToken) return resolvedToken;

  // 1. Try env var
  const envToken = process.env.GITHUB_API_TOKEN ?? "";
  if (envToken) {
    // Quick validation — hit the API to see if the token works
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

  // 2. Fallback: gh auth token (available in dev sandbox)
  try {
    const ghToken = execSync("gh auth token 2>/dev/null", { encoding: "utf-8" }).trim();
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

async function fetchCommitsFromGitHub(count: number): Promise<CommitEntry[]> {
  const now = Date.now();
  if (cachedCommits && now - cacheTimestamp < CACHE_TTL_MS && cachedCommits.length >= count) {
    return cachedCommits.slice(0, count);
  }

  const token = await getGitHubToken();
  if (!token) {
    console.warn("[GitHub] No GITHUB_API_TOKEN configured — cannot fetch commits");
    return cachedCommits?.slice(0, count) ?? [];
  }

  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=${Math.min(count, 30)}`;
    const res = await fetch(url, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "VOP-Platform",
        Authorization: `token ${token}`,
      },
    });

    if (!res.ok) {
      // If the resolved token stopped working, clear it so next call re-resolves
      if (res.status === 401) {
        resolvedToken = null;
      }
      console.warn(`[GitHub] API returned ${res.status}: ${res.statusText}`);
      return cachedCommits?.slice(0, count) ?? [];
    }

    const data = (await res.json()) as any[];
    const commits: CommitEntry[] = data.map((item: any) => ({
      sha: item.sha,
      shortSha: item.sha.substring(0, 7),
      message: item.commit?.message ?? "",
      author: item.commit?.author?.name ?? item.author?.login ?? "Unknown",
      authorAvatar: item.author?.avatar_url ?? null,
      date: item.commit?.author?.date ?? new Date().toISOString(),
      url:
        item.html_url ??
        `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${item.sha}`,
    }));

    cachedCommits = commits;
    cacheTimestamp = now;
    return commits.slice(0, count);
  } catch (err) {
    console.warn("[GitHub] Failed to fetch commits:", (err as Error).message);
    return cachedCommits?.slice(0, count) ?? [];
  }
}

export const githubRouter = router({
  /**
   * Get recent commits from the VOP GitHub repository.
   * Default: last 15 commits. Max: 30.
   */
  getRecentCommits: publicProcedure
    .input(
      z
        .object({
          count: z.number().min(1).max(30).optional(),
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
      };
    }),
});
