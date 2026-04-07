/**
 * GitHub Router Tests — Recent Commit History
 *
 * Tests the git log parsing and commit data structure returned by the
 * getRecentCommits procedure.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "child_process";

// Mock execSync to control git log output
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

const mockedExecSync = vi.mocked(execSync);

// We need to import after mocking
const FIELD_SEP = "|||";
const DELIM = "---COMMIT_DELIM---";

function buildGitLogOutput(commits: Array<{
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  email: string;
  date: string;
}>): string {
  return commits
    .map(
      (c) =>
        `${c.sha}${FIELD_SEP}${c.shortSha}${FIELD_SEP}${c.message}${FIELD_SEP}${c.author}${FIELD_SEP}${c.email}${FIELD_SEP}${c.date}${DELIM}`
    )
    .join("\n");
}

describe("GitHub Router — Commit History", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache to clear the in-memory commit cache
    vi.resetModules();
  });

  it("should parse git log output into structured commit entries", async () => {
    const fakeCommits = [
      {
        sha: "cdb2f04e1234567890abcdef1234567890abcdef",
        shortSha: "cdb2f04",
        message: "updated version number",
        author: "Kory Willis",
        email: "kory@latuning.com",
        date: "2026-04-07T16:35:18-05:00",
      },
      {
        sha: "a50d4f1e9876543210fedcba9876543210fedcba",
        shortSha: "a50d4f1",
        message: "updates",
        author: "Kory Willis",
        email: "kory@latuning.com",
        date: "2026-04-07T16:25:19-05:00",
      },
    ];

    mockedExecSync.mockReturnValue(buildGitLogOutput(fakeCommits));

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    expect(result.repo).toBe("simplebiscuits/Good-Gravy-2");
    expect(result.repoUrl).toBe("https://github.com/simplebiscuits/Good-Gravy-2");
    expect(result.commits).toHaveLength(2);

    const first = result.commits[0];
    expect(first.sha).toBe("cdb2f04e1234567890abcdef1234567890abcdef");
    expect(first.shortSha).toBe("cdb2f04");
    expect(first.message).toBe("updated version number");
    expect(first.author).toBe("Kory Willis");
    expect(first.date).toBe("2026-04-07T16:35:18-05:00");
    expect(first.url).toContain("github.com/simplebiscuits/Good-Gravy-2/commit/");
  });

  it("should respect the count parameter", async () => {
    const fakeCommits = Array.from({ length: 10 }, (_, i) => ({
      sha: `${String(i).padStart(40, "a")}`,
      shortSha: `${String(i).padStart(7, "a")}`,
      message: `Commit ${i}`,
      author: "Dev",
      email: "dev@test.com",
      date: "2026-04-07T12:00:00Z",
    }));

    mockedExecSync.mockReturnValue(buildGitLogOutput(fakeCommits));

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 3 });

    expect(result.commits.length).toBeLessThanOrEqual(3);
  });

  it("should default to 15 commits when no count is provided", async () => {
    const fakeCommits = Array.from({ length: 20 }, (_, i) => ({
      sha: `${String(i).padStart(40, "b")}`,
      shortSha: `${String(i).padStart(7, "b")}`,
      message: `Commit ${i}`,
      author: "Dev",
      email: "dev@test.com",
      date: "2026-04-07T12:00:00Z",
    }));

    mockedExecSync.mockReturnValue(buildGitLogOutput(fakeCommits));

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits(undefined);

    expect(result.commits.length).toBeLessThanOrEqual(15);
  });

  it("should return empty array when git log fails", async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git not found");
    });

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    expect(result.commits).toEqual([]);
    expect(result.repo).toBe("simplebiscuits/Good-Gravy-2");
  });

  it("should generate correct GitHub URLs for each commit", async () => {
    const fakeCommits = [
      {
        sha: "abc123def456789012345678901234567890abcd",
        shortSha: "abc123d",
        message: "test commit",
        author: "Tester",
        email: "test@test.com",
        date: "2026-04-07T12:00:00Z",
      },
    ];

    mockedExecSync.mockReturnValue(buildGitLogOutput(fakeCommits));

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    expect(result.commits[0].url).toBe(
      "https://github.com/simplebiscuits/Good-Gravy-2/commit/abc123def456789012345678901234567890abcd"
    );
  });

  it("should include author email in commit entries", async () => {
    const fakeCommits = [
      {
        sha: "1234567890abcdef1234567890abcdef12345678",
        shortSha: "1234567",
        message: "email test",
        author: "Erik Fontenot",
        email: "erik@ppei.com",
        date: "2026-04-07T12:00:00Z",
      },
    ];

    mockedExecSync.mockReturnValue(buildGitLogOutput(fakeCommits));

    const { githubRouter } = await import("./github");
    const caller = githubRouter.createCaller({} as any);
    const result = await caller.getRecentCommits({ count: 5 });

    expect(result.commits[0].authorEmail).toBe("erik@ppei.com");
    expect(result.commits[0].author).toBe("Erik Fontenot");
  });
});
