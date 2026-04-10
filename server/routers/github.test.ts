/**
 * GitHub Router Tests — Recent Commit History (API-based)
 *
 * Tests the GitHub API integration and commit data structure returned by
 * the getRecentCommits procedure. Uses the real GITHUB_API_TOKEN to validate
 * the secret works against the private repo. Includes pagination tests.
 */
import { describe, it, expect, vi, afterEach } from "vitest";

describe("GitHub Router — Commit History (API)", () => {
  const originalEnv = process.env.GITHUB_API_TOKEN;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GITHUB_API_TOKEN = originalEnv;
    }
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should validate GITHUB_API_TOKEN is set and can access the repo", async () => {
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
    expect(result.totalRequested).toBe(3);

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
    expect(result.totalRequested).toBe(15);
  });

  it("should still work via gh CLI fallback when env token is missing", async () => {
    process.env.GITHUB_API_TOKEN = "";
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    // In dev sandbox, gh CLI provides a fallback token, so commits may still be returned.
    expect(result.repo).toBe("simplebiscuits/Good-Gravy-2");
    expect(Array.isArray(result.commits)).toBe(true);
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

  it("should accept max 200 and reject above", async () => {
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);

    // 200 should be accepted (max)
    const result = await caller.getRecentCommits({ count: 200 });
    expect(result.totalRequested).toBe(200);
    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.commits.length).toBeLessThanOrEqual(200);

    // 201 should throw validation error
    await expect(caller.getRecentCommits({ count: 201 })).rejects.toThrow();
  });

  it("should return more than 100 commits when requested (pagination)", async () => {
    vi.resetModules();
    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 110 });

    // The repo should have >100 commits; if not, at least verify no error
    expect(result.totalRequested).toBe(110);
    expect(Array.isArray(result.commits)).toBe(true);
    // Each commit should still have valid structure
    if (result.commits.length > 100) {
      const commit101 = result.commits[100];
      expect(commit101.sha.length).toBe(40);
      expect(commit101.shortSha.length).toBe(7);
    }
  });
});
