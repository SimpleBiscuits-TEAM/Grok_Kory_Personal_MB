/**
 * useAccessTier — Reads the tiered access state from the server.
 *
 * Tiers:
 *   "none" — no access code entered, must show gate
 *   "lite" — KINGKONG entered, VOP LITE only
 *   "pro"  — KINGKONG1 entered, full access + GOD MODE
 *
 * MAIN branch only — grok branch uses OAuth-based auth.
 */
import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';

export type AccessTier = 'none' | 'lite' | 'pro';

export function useAccessTier() {
  const accessQuery = trpc.auth.checkAccess.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000, // cache for 1 minute
  });

  return useMemo(() => {
    const tier: AccessTier = (accessQuery.data?.tier as AccessTier) || 'none';
    const authenticated = accessQuery.data?.authenticated ?? false;
    const loading = accessQuery.isLoading;
    const isGodMode = tier === 'pro';

    return {
      tier,
      authenticated,
      loading,
      isGodMode,
      /** True if user has at least lite access */
      hasAccess: authenticated,
      /** True if user has pro access (full VOP PRO + GOD MODE) */
      hasPro: tier === 'pro',
    };
  }, [accessQuery.data, accessQuery.isLoading]);
}
