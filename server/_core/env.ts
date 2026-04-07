export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  /** Optional override for chat model (OpenAI: gpt-4o-mini, Forge/Manus: often gemini-2.5-flash). */
  llmModel: process.env.LLM_MODEL ?? "",
  /** GitHub API token for accessing the private repo to display commit history. */
  githubApiToken: process.env.GITHUB_API_TOKEN ?? "",
};
