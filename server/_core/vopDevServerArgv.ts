/**
 * Detects argv patterns for the V-OP dev server entry (tsx + server/_core/index).
 * Kept side-effect-free so tests can import without running dotenv / mutating NODE_ENV.
 */

/** True when argv indicates `tsx` running `server/_core/index` (with or without `watch`). */
export function isTsxVopServerEntryFromArgv(argvJoined: string): boolean {
  return /tsx/i.test(argvJoined) && /server[/\\]_core[/\\]index/i.test(argvJoined);
}
