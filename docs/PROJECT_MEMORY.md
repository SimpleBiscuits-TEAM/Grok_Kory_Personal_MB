# PROJECT MEMORY

Last updated: 2026-04-06
Branch: `GROK`

## Product Vision (Current)

- Build a unified PPEI platform that combines diagnostics, reasoning, calibration tooling, flash workflows, fleet intelligence, weather/dyno normalization, and support operations in one system.
- Keep AI answers practical, grounded, and fast.
- Use real data (vehicle logs, weather reports, protocol context, known outcomes) to reduce hallucination and increase confidence.
- Prioritize speed, safety, and operator trust over flashy but unreliable behavior.

## Primary Direction

- The system should behave like a vehicle intelligence operating system for PPEI workflows.
- Advanced capabilities should be gated by access policy and role.
- The app should support both broad user access and higher-trust pro/admin capability tiers.

## Access and Auth Decisions (Current)

- App-level access gate exists in `client/src/components/AuthGate.tsx`.
- OAuth should grant access to the app (not only access-code cookie).
- Dev bypass currently exists in `server/routers.ts` for `auth.verifyAccessCode`:
  - In development only (`NODE_ENV=development`), access code `1234` is accepted.
- Advanced page gate currently uses local code:
  - `client/src/pages/Advanced.tsx` has `ADVANCED_CODE = '1234'`.
- Advanced tab access policy currently enforced:
  - Only signed-in `kory@ppei.com` can access Advanced.
  - Other signed-in accounts are denied Advanced.

## Admin Identity Rules (Current)

- `kory@ppei.com` is auto-promoted to admin in `server/db.ts` upsert flow.
- Existing owner/super-admin logic via known openId and env owner id remains.

## LLM/Reasoning Upgrades Already Added

- Added context relevance utilities:
  - `server/lib/llmContext.ts`
  - includes section scoring, context packing, history trimming, and cache key normalization.
- Added intent routing utility:
  - `server/lib/llmIntent.ts`
  - keyword-based domain classifier for Knox routing.
- Diagnostic router improvements:
  - `server/routers/diagnostic.ts`
  - trimmed history, relevance-packed context, intent routing, short-lived quick lookup cache, evidence footer tags.
- Fleet router context tuning:
  - `server/routers/fleet.ts`
  - trimmed chat history and compact context.
- LLM defaults tuned for latency:
  - `server/_core/llm.ts`
  - lower default max tokens and thinking budget.
- Eval harness added:
  - `scripts/eval-llm-routing.ts`
  - script: `pnpm eval:llm`

## Weather System Understanding

- Weather data is vehicle-reported and used for correction workflows:
  - `server/routers/weather.ts`, `client/src/pages/Weather.tsx`
- Derived values include SAE J1349 correction factor, density altitude, air density, dew point.
- Data model links weather to dyno/competition entities in `drizzle/schema.ts`.

## Local Windows Runbook (PowerShell)

Because default scripts use Unix-style env syntax, use these commands on Windows:

1. Start dev server:

```powershell
cd "C:\Users\kbwillis\Downloads\Good-Gravy-2-main\Good-Gravy-2-main\Good-Gravy-2"
$env:Path += ";C:\Program Files\nodejs"
$env:NODE_ENV="development"
& "$env:APPDATA\npm\pnpm.cmd" exec tsx watch server/_core/index.ts
```

2. Install dependencies:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" install
```

3. Run LLM routing eval:

```powershell
& "$env:APPDATA\npm\pnpm.cmd" eval:llm
```

## Working Principles for Future Sessions

- Keep changes measurable and reversible.
- Prefer phased upgrades:
  1) reliability and access,
  2) retrieval and reasoning quality,
  3) tooling and observability,
  4) broader refactors.
- For large requests ("audit whole system"), execute in passes and ship verified slices.

## Open Items / Pending Clarification

- Final long-term access policy for Advanced (email-only vs role-based vs approval workflow).
- Whether dev bypasses (`1234`) should remain, move behind env flag, or be removed before release.
- Preferred citation/evidence format in user-facing LLM responses.
- Priority modules for next full-system audit pass.
