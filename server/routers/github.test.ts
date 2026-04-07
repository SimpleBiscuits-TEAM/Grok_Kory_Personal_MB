/**
 * GitHub Router Tests — Recent Commit History (API-based)
 *
 * Tests the GitHub API integration and commit data structure returned by
 * the getRecentCommits procedure. Uses the real GITHUB_API_TOKEN to validate
 * the secret works against the private repo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GitHub Router — Commit History (API)", () => {
  const originalEnv = process.env.GITHUB_API_TOKEN;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.GITHUB_API_TOKEN = originalEnv;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should validate GITHUB_API_TOKEN is set and can access the repo", async () => {
    // This test validates the secret is working
    const token = process.env.GITHUB_API_TOKEN;
    expect(token).toBeTruthy();

    const res = await fetch(
      "https://api.github.com/repos/simplebiscuits/Good-Gravy-2/commits?per_page=1",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "VOP-Platform",
          Authorization: `token ${token}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
  });

  it("should return structured commit data from the router", async () => {
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 3 });

    expect(result.repo).toBe("simplebiscuits/Good-Gravy-2");
    expect(result.repoUrl).toBe("https://github.com/simplebiscuits/Good-Gravy-2");
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits.length).toBeLessThanOrEqual(3);

    const first = result.commits[0];
    expect(first.sha).toBeTruthy();
    expect(first.sha.length).toBe(40);
    expect(first.shortSha).toBe(first.sha.substring(0, 7));
    expect(first.message).toBeTruthy();
    expect(first.author).toBeTruthy();
    expect(first.date).toBeTruthy();
    expect(first.url).toContain("github.com/simplebiscuits/Good-Gravy-2/commit/");
  });

  it("should default to 15 commits when no count is provided", async () => {
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits(undefined);

    expect(result.commits.length).toBeLessThanOrEqual(15);
    expect(result.commits.length).toBeGreaterThan(0);
  });

  it("should return empty array when token is missing", async () => {
    process.env.GITHUB_API_TOKEN = "";
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    expect(result.commits).toEqual([]);
    expect(result.repo).toBe("simplebiscuits/Good-Gravy-2");
  });

  it("should include valid GitHub commit URLs", async () => {
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 1 });

    expect(result.commits.length).toBe(1);
    const commit = result.commits[0];
    expect(commit.url).toMatch(
      /^https:\/\/github\.com\/simplebiscuits\/Good-Gravy-2\/commit\/[a-f0-9]{40}$/
    );
  });
});
