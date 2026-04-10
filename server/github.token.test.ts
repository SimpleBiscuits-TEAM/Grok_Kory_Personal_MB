import { describe, it, expect } from "vitest";

describe("GITHUB_API_TOKEN validation", () => {
  it("should authenticate successfully with the GitHub API", async () => {
    // GH_TOKEN is the primary token (platform-injected), GITHUB_API_TOKEN is fallback
    const token = process.env.GH_TOKEN || process.env.GITHUB_API_TOKEN;
    expect(token).toBeTruthy();
    expect(token!.length).toBeGreaterThan(10);

    const res = await fetch(
      "https://api.github.com/repos/simplebiscuits/Good-Gravy-2",
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
    expect(data.full_name).toBe("simplebiscuits/Good-Gravy-2");
  });

  it("should fetch commits from the grok branch", async () => {
    const token = process.env.GH_TOKEN || process.env.GITHUB_API_TOKEN;
    const res = await fetch(
      "https://api.github.com/repos/simplebiscuits/Good-Gravy-2/commits?sha=grok&per_page=3",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "VOP-Platform",
          Authorization: `token ${token}`,
        },
      }
    );

    expect(res.status).toBe(200);
    const commits = await res.json();
    expect(Array.isArray(commits)).toBe(true);
    expect(commits.length).toBeGreaterThan(0);
  });
});
