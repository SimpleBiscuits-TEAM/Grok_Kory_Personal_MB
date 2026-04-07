/**
 * GitHub Router — Recent Commit History
 *
 * Reads commit history from the local git repository (which is synced with
 * the simplebiscuits/Good-Gravy-2 GitHub repo). Uses `git log` to extract
 * commit data. Results are cached in memory for 5 minutes.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const GITHUB_OWNER = "simplebiscuits";
const GITHUB_REPO = "Good-Gravy-2";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

interface CommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  url: string;
}

let cachedCommits: CommitEntry[] | null = null;
let cacheTimestamp = 0;

function getCommitsFromGit(count: number): CommitEntry[] {
  const now = Date.now();
  if (cachedCommits && now - cacheTimestamp < CACHE_TTL_MS && cachedCommits.length >= count) {
    return cachedCommits.slice(0, count);
  }

  try {
    // Use a delimiter that won't appear in commit messages
    const DELIM = "---COMMIT_DELIM---";
    const FIELD_SEP = "|||";
    const format = `%H${FIELD_SEP}%h${FIELD_SEP}%s${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${DELIM}`;
    const raw = execSync(
      `git log --format="${format}" -${Math.min(count, 50)}`,
      { cwd: PROJECT_ROOT, encoding: "utf-8", timeout: 5000 }
    );

    const entries = raw
      .split(DELIM)
      .map((s) => s.trim())
      .filter(Boolean);

    const commits: CommitEntry[] = entries.map((entry) => {
      const [sha, shortSha, message, author, authorEmail, date] = entry.split(FIELD_SEP);
      return {
        sha: sha || "",
        shortSha: shortSha || sha?.substring(0, 7) || "",
        message: message || "",
        author: author || "Unknown",
        authorEmail: authorEmail || "",
        date: date || new Date().toISOString(),
        url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${sha}`,
      };
    });

    cachedCommits = commits;
    cacheTimestamp = now;
    return commits.slice(0, count);
  } catch (err) {
    console.warn("[GitHub] Failed to read git log:", (err as Error).message);
    if (cachedCommits) return cachedCommits.slice(0, count);
    return [];
  }
}

export const githubRouter = router({
  /**
   * Get recent commits from the VOP repository.
   * Default: last 15 commits. Max: 50.
   */
  getRecentCommits: publicProcedure
    .input(
      z
        .object({
          count: z.number().min(1).max(50).optional(),
        })
        .optional()
    )
    .query(({ input }) => {
      const count = input?.count ?? 15;
      const commits = getCommitsFromGit(count);
      return {
        repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
        repoUrl: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
        commits,
      };
    }),
});
