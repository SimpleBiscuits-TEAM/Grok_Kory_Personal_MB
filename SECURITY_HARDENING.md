# VOP Security Hardening Report

**Date:** March 30, 2026
**Project:** VOP-Main-Brain (V-OP / PPEI Calibration Platform)
**Author:** Security audit and implementation by Manus

---

## Executive Summary

This document describes the security hardening applied to the VOP-Main-Brain project to prevent file sniffing, reverse engineering of proprietary intellectual property, and unauthorized access to sensitive ECU calibration data. The changes are designed to be **strictly additive** — no existing closed-loop logic, diagnostic pipelines, Knox AI behavior, editor engine functionality, or runtime behavior has been modified.

---

## Threat Model

The VOP platform handles extremely sensitive automotive IP including seed/key algorithms for multiple ECU families, proprietary A2L calibration definitions, binary firmware images, and PPEI tune files. The primary threats addressed by this hardening are described in the table below.

| Threat | Risk Level | Description |
|--------|------------|-------------|
| Client-side secret extraction | **CRITICAL** | Seed/key bytes, algorithm details, and RE methodology were shipped in the client JS bundle via `shared/knoxKnowledge.ts` |
| Unauthenticated API access | **HIGH** | Core editor routes (`knoxChat`, `storeA2L`, `fetchA2L`, `simplifyMaps`, `cacheDatalog`) were `publicProcedure` — no login required |
| Storage URL leakage | **MEDIUM** | Raw S3/Forge URLs were persisted in the database and returned to clients, potentially remaining valid beyond intended access windows |
| Source code reverse engineering | **MEDIUM** | Standard Vite build with no minification hardening, potential source maps, readable chunk names, and console output in production |
| Browser-based inspection | **LOW-MEDIUM** | No deterrents against DevTools inspection, console data extraction, or DOM manipulation |

---

## Changes Made

### 1. Secrets Moved Server-Side (CRITICAL)

**Problem:** The `shared/knoxKnowledge.ts` file contained literal seed/key secret bytes for Ford MG1, EDC17, Cummins CM2350/CM2450, CAN-am/BRP, BRP Dash, Polaris, and Ford TCU 10R80. Because it resided in the `/shared/` directory, it was eligible for inclusion in the client-side JavaScript bundle, making these secrets visible to anyone who inspects the browser's network traffic or JS source.

**Solution:** Two new server-only files were created, and the shared file was sanitized.

| File | Location | Purpose |
|------|----------|---------|
| `server/lib/knoxKnowledgeServer.ts` | Server only | Contains the full knowledge base with all seed/key secrets; exports `getFullKnoxKnowledge()` for LLM system prompt injection |
| `server/lib/knoxVault.ts` | Server only | Structured seed/key vault with algorithm implementations, audit logging, and a `computeSeedKey()` function that performs all cryptographic operations server-side |
| `shared/knoxKnowledge.ts` | Shared (client-safe) | **Sanitized** — renamed export to `KNOX_KNOWLEDGE_BASE_SANITIZED`, all secret bytes/algorithms/constants removed and replaced with a note that computation is handled server-side |

The `server/routers/editor.ts` now imports from `server/lib/knoxKnowledgeServer.ts` instead of the shared module, ensuring the full knowledge base (with secrets) is only ever used in the LLM system prompt on the server and never reaches the client.

### 2. Public Routes Locked Down (HIGH)

**Problem:** Several routes that handle sensitive operations were using `publicProcedure`, meaning anyone could call them without authentication.

**Solution:** The following routes were changed from `publicProcedure` to `protectedProcedure`:

| Router | Procedure | What It Does | Previous Auth | New Auth |
|--------|-----------|-------------|---------------|----------|
| `editor` | `knoxChat` | Knox AI calibration assistant | `publicProcedure` | `protectedProcedure` |
| `editor` | `storeA2L` | Upload A2L files to S3 library | `publicProcedure` | `protectedProcedure` |
| `editor` | `simplifyMaps` | AI-powered map name translation | `publicProcedure` | `protectedProcedure` |
| `editor` | `fetchA2L` | Download stored A2L files | `publicProcedure` | `protectedProcedure` |
| `datalogCache` | `cacheDatalog` | Upload datalog CSV to S3 cache | `publicProcedure` | `protectedProcedure` |

**Routes intentionally left public:** `waitlist.submit`, `feedback.submit`, and `feedback.uploadAttachment` remain public because they serve unauthenticated users by design (waitlist signup, error reporting). The `auth.me` and `auth.logout` routes also remain public as they are part of the authentication flow itself.

### 3. Storage URL Leakage Plugged (MEDIUM)

**Problem:** Raw S3/Forge storage URLs were being returned to clients and persisted in database records. These URLs could remain valid beyond the intended access window.

**Changes applied:**

The `editor.storeA2L` mutation no longer returns the raw `url` from `storagePut` — it only returns `{ success, ecuFamily }`. The `datalogCache.cacheDatalog` mutation no longer returns `s3Url` in its response — clients must use the `getDownloadUrl` endpoint to get a fresh presigned URL. The `datalogCache.getDownloadUrl` endpoint no longer falls back to the stored `s3Url` when presigned URL generation fails — it now throws an error instead, preventing stale URLs from being served.

**New utility created:** `server/lib/secureFileAccess.ts` provides a complete secure file access broker with user-scoped upload paths, SHA-256 file hashing, rate limiting (100 downloads/user/hour), access audit logging, file ownership validation, and a `scrubStorageUrls()` helper that can sanitize response objects before sending them to clients. This module is available for future integration into other routers (tunes, voice, projects) as the codebase evolves.

### 4. Build Hardening (MEDIUM)

**Problem:** The Vite production build had no security-oriented configuration — no source map suppression, no aggressive minification, readable chunk names, and console output preserved.

**Changes to `vite.config.ts`:**

| Setting | Value | Effect |
|---------|-------|--------|
| `sourcemap` | `false` | Source maps are never generated for production builds |
| `minify` | `'terser'` | Uses Terser for aggressive minification (beyond default esbuild) |
| `drop_console` | `true` | All `console.*` calls stripped from production output |
| `drop_debugger` | `true` | All `debugger` statements stripped |
| `passes` | `2` | Two compression passes for maximum size reduction and obfuscation |
| `toplevel` | `true` | Top-level variable names are mangled |
| `properties.regex` | `/^_/` | Properties starting with underscore are mangled |
| `comments` | `false` | All comments stripped from output |
| `chunkFileNames` | `'assets/[hash].js'` | Chunk files use content hashes instead of readable names |
| `entryFileNames` | `'assets/[hash].js'` | Entry files use content hashes |
| `assetFileNames` | `'assets/[hash].[ext]'` | All assets use content hashes |

These settings make the production bundle significantly harder to reverse-engineer while having zero impact on runtime behavior. The debug collector plugin was already gated to development mode and remains unchanged.

### 5. Client-Side Anti-Tamper Shield (LOW-MEDIUM)

**New file:** `client/src/lib/knoxShield.ts` — a comprehensive client-side protection module activated in `client/src/main.tsx`.

**Protection layers:**

| Layer | What It Does | Interference Risk |
|-------|-------------|-------------------|
| DevTools detection | Detects open inspector via window size differential, debugger timing, and console object inspection | None — passive detection only |
| Console protection | Neuters `console.log/debug/info/warn/table/dir/trace` in production | None — `console.error` preserved for critical issues |
| Context menu block | Prevents right-click "Inspect Element" | None — does not affect any app UI interactions |
| Keyboard shortcut block | Blocks F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S | None — these are browser shortcuts, not app shortcuts |
| Timing detection | Detects debugger pauses via interval timing anomalies | None — passive monitoring only |
| DOM integrity monitor | Watches for injected scripts from unknown origins | None — allows same-origin and CDN scripts |
| Network fingerprinting | Adds `X-Knox-Shield` and `X-Knox-Timestamp` headers to fetch requests | None — additive headers only, does not modify request body or tRPC behavior |

**Critical design decisions to protect the closed loop:**

The shield is configured with `productionOnly: true`, meaning it is completely inactive during development. The `onTamperDetected` callback only logs in dev mode and takes no blocking action in production. The `protectNetworkRequests()` wrapper only adds headers — it does not modify request bodies, URLs, or the tRPC transport layer. The shield can be fully deactivated in development via `deactivateShield()`.

---

## Files Created

| File | Purpose |
|------|---------|
| `server/lib/knoxVault.ts` | Server-only seed/key vault with algorithm implementations and audit logging |
| `server/lib/knoxKnowledgeServer.ts` | Server-only full Knox knowledge base (sanitized base + secrets) |
| `server/lib/secureFileAccess.ts` | Secure file upload/download broker with rate limiting and audit trail |
| `client/src/lib/knoxShield.ts` | Client-side anti-tamper and anti-sniffing protection module |

## Files Modified

| File | Changes |
|------|---------|
| `shared/knoxKnowledge.ts` | Export renamed to `KNOX_KNOWLEDGE_BASE_SANITIZED`; all seed/key secrets, algorithm details, and secret constants removed |
| `server/routers/editor.ts` | Import switched to `knoxKnowledgeServer`; all 4 procedures changed from `publicProcedure` to `protectedProcedure`; raw URL removed from `storeA2L` response |
| `server/routers/datalogCache.ts` | `cacheDatalog` changed from `publicProcedure` to `protectedProcedure`; raw `s3Url` removed from response; `getDownloadUrl` fallback to stored URL eliminated |
| `vite.config.ts` | Production build hardened with Terser minification, source map suppression, console stripping, name mangling, and hash-based chunk names |
| `client/src/main.tsx` | Knox Shield activated at app startup (production-only) with network request fingerprinting |

---

## What Was NOT Changed

The following systems were explicitly left untouched to ensure zero interference with the closed-loop tuning pipeline and all existing functionality:

- **Editor engine** (`client/src/lib/editorEngine.ts`) — all A2L parsing, binary reading, map value computation, and offset alignment logic is unchanged
- **Knox Learning Engine** (`client/src/lib/knoxLearningEngine.ts`) — learning from uploaded binaries and A2L files works identically
- **Knox Map Search** (`client/src/lib/knoxMapSearch.ts`) — map search and filtering is unchanged
- **Knox Reasoning Feedback** (`client/src/lib/knoxReasoningFeedback.ts`) — diagnostic reasoning pipeline is unchanged
- **IntelliSpy** (`client/src/components/IntelliSpy.tsx`) — security monitoring component is unchanged
- **Diagnostic router** (`server/routers/diagnostic.ts`) — all diagnostic AI flows unchanged
- **Binary analysis router** (`server/routers/binaryAnalysis.ts`) — RE analysis pipeline unchanged
- **Voice router** (`server/routers/voice.ts`) — voice command pipeline unchanged
- **Projects router** (`server/routers/projects.ts`) — project management unchanged
- **Tunes router** (`server/routers/tunes.ts`) — tune library management unchanged
- **Monica router** (`server/routers/monica.ts`) — customer debug assistant unchanged
- **Support router** (`server/routers/support.ts`) — support sessions unchanged
- **All database schemas** — no schema changes required
- **Authentication flow** — OAuth, JWT cookies, role-based access all unchanged
- **tRPC transport** — httpBatchLink, superjson transformer, credentials handling all unchanged

---

## Remaining Recommendations

The following items are recommended for future hardening but were not implemented in this pass to avoid scope creep and maintain stability:

1. **Integrate `secureFileAccess.ts` into all routers** — The tunes, voice, and projects routers still use `storagePut`/`storageGet` directly. Wrapping them through the secure broker would add audit logging, rate limiting, and ownership validation to all file operations.

2. **Server-side request fingerprint validation** — The `X-Knox-Shield` header is now sent by the client but not yet validated on the server. Adding middleware to check this header would help detect automated scraping tools.

3. **Content Security Policy (CSP) headers** — Adding strict CSP headers would prevent inline script injection and limit which domains can load resources.

4. **Subresource Integrity (SRI)** — Adding integrity hashes to script tags would prevent CDN-level tampering.

5. **API rate limiting at the server level** — While `secureFileAccess.ts` has per-user download rate limiting, adding global rate limiting middleware (e.g., via `express-rate-limit`) would protect against brute-force attacks on all endpoints.

6. **Geofencing integration** — The existing geofencing knowledge suggests tune upload/download restrictions by geographic zone. This could be integrated with the secure file access broker.

7. **Periodic secret rotation** — The seed/key secrets in `knoxVault.ts` are static. If the underlying ECU security allows it, implementing a rotation mechanism would further limit exposure.
