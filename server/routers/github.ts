/**
 * GitHub Router — Recent Commit History
 *
 * Fetches the latest commits from the simplebiscuits/Good-Gravy-2 repository
 * using the GitHub REST API with an authenticated token. This works in both
 * local development and production deployment. Results are cached in memory
 * for 5 minutes to avoid hitting rate limits.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";

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

async function fetchCommitsFromGitHub(count: number): Promise<CommitEntry[]> {
  const now = Date.now();
  if (cachedCommits && now - cacheTimestamp < CACHE_TTL_MS && cachedCommits.length >= count) {
    return cachedCommits.slice(0, count);
  }

  const token = ENV.githubApiToken;
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
