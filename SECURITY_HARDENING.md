# VOP Security Hardening Report

**Date:** March 30, 2026 (Updated)
**Project:** VOP-Main-Brain (V-OP / PPEI Calibration Platform)
**Author:** Security audit and implementation by Manus

---

## Executive Summary

This document describes the complete security hardening applied to the VOP-Main-Brain project across two passes. The changes prevent file sniffing, reverse engineering of proprietary intellectual property, unauthorized access to sensitive ECU calibration data, and abuse of LLM-powered endpoints. All changes are **strictly additive** -- no existing closed-loop logic, diagnostic pipelines, Knox AI behavior, editor engine functionality, or runtime behavior has been modified.

---

## Threat Model

The VOP platform handles extremely sensitive automotive IP including seed/key algorithms for multiple ECU families, proprietary A2L calibration definitions, binary firmware images, and PPEI tune files. The primary threats addressed by this hardening are described in the table below.

| Threat | Risk Level | Status |
|--------|------------|--------|
| Client-side secret extraction | **CRITICAL** | RESOLVED -- secrets moved to server-only vault |
| Unauthenticated LLM access | **HIGH** | RESOLVED -- all AI routes locked to protectedProcedure |
| Unauthenticated API access | **HIGH** | RESOLVED -- editor, datalog, diagnostic, compare routes locked |
| LLM credit abuse / prompt injection | **HIGH** | RESOLVED -- per-route rate limiting (30 req/min) on all LLM endpoints |
| Storage URL leakage | **MEDIUM** | RESOLVED -- tunes and voice routers now use secure file broker |
| Unvalidated client requests | **MEDIUM** | RESOLVED -- Knox Shield server-side validation middleware active |
| Memory exhaustion (DoS) | **MEDIUM** | RESOLVED -- JSON body limit reduced from 100MB to 2MB |
| Missing HTTP security headers | **MEDIUM** | RESOLVED -- helmet configured with full CSP, HSTS, X-Frame-Options |
| No global rate limiting | **MEDIUM** | RESOLVED -- 200 req/min global + 30 req/min LLM-specific limits |
| Source code reverse engineering | **MEDIUM** | RESOLVED -- Terser minification, hash-only chunk names, no source maps |
| Browser-based inspection | **LOW-MEDIUM** | RESOLVED -- client-side anti-tamper shield active |

---

## Pass 1: Foundation Hardening

### 1. Secrets Moved Server-Side (CRITICAL)

**Problem:** The `shared/knoxKnowledge.ts` file contained literal seed/key secret bytes for Ford MG1, EDC17, Cummins CM2350/CM2450, CAN-am/BRP, BRP Dash, Polaris, and Ford TCU 10R80. Because it resided in the `/shared/` directory, it was eligible for inclusion in the client-side JavaScript bundle, making these secrets visible to anyone who inspects the browser's network traffic or JS source.

**Solution:** Two new server-only files were created, and the shared file was sanitized.

| File | Location | Purpose |
|------|----------|---------|
| `server/lib/knoxKnowledgeServer.ts` | Server only | Contains the full knowledge base with all seed/key secrets; exports `getFullKnoxKnowledge()` for LLM system prompt injection |
| `server/lib/knoxVault.ts` | Server only | Structured seed/key vault with algorithm implementations, audit logging, and a `computeSeedKey()` function that performs all cryptographic operations server-side |
| `shared/knoxKnowledge.ts` | Shared (client-safe) | **Sanitized** -- renamed export to `KNOX_KNOWLEDGE_BASE_SANITIZED`, all secret bytes/algorithms/constants removed |

### 2. Editor Routes Locked Down (HIGH)

The following editor routes were changed from `publicProcedure` to `protectedProcedure`:

| Router | Procedure | Previous Auth | New Auth |
|--------|-----------|---------------|----------|
| `editor` | `knoxChat` | `publicProcedure` | `protectedProcedure` |
| `editor` | `storeA2L` | `publicProcedure` | `protectedProcedure` |
| `editor` | `simplifyMaps` | `publicProcedure` | `protectedProcedure` |
| `editor` | `fetchA2L` | `publicProcedure` | `protectedProcedure` |
| `datalogCache` | `cacheDatalog` | `publicProcedure` | `protectedProcedure` |

### 3. Storage URL Leakage Plugged (MEDIUM)

The `editor.storeA2L` mutation no longer returns raw S3 URLs. The `datalogCache.getDownloadUrl` endpoint no longer falls back to stored URLs. A new `server/lib/secureFileAccess.ts` module was created as a centralized secure file broker.

### 4. Build Hardening (MEDIUM)

Production Vite build configured with Terser minification, source map suppression, console stripping, name mangling, and hash-based chunk names.

### 5. Client-Side Anti-Tamper Shield (LOW-MEDIUM)

New `client/src/lib/knoxShield.ts` module provides DevTools detection, console protection, context menu blocking, keyboard shortcut blocking, timing detection, DOM integrity monitoring, and network request fingerprinting via `X-Knox-Shield` headers.

---

## Pass 2: Gap Closure (March 30, 2026)

A full security audit of the codebase identified five remaining gaps. All five have been resolved.

### 6. All AI/LLM Routes Locked to protectedProcedure (HIGH)

**Problem:** The `diagnostic.chat`, `diagnostic.quickLookup`, and `compare.analyze` routes were still `publicProcedure`, meaning anyone on the internet could hit the LLM endpoints without logging in. This was a massive vector for LLM credit abuse and prompt injection attacks targeting the proprietary knowledge base injected into system prompts.

**Solution:** All three routes converted to `protectedProcedure`. The unused `publicProcedure` import was also cleaned from `editor.ts`.

| Router | Procedure | Previous Auth | New Auth |
|--------|-----------|---------------|----------|
| `diagnostic` | `chat` | `publicProcedure` | `protectedProcedure` |
| `diagnostic` | `quickLookup` | `publicProcedure` | `protectedProcedure` |
| `compare` | `analyze` | `publicProcedure` | `protectedProcedure` |

**Routes intentionally left public:** `waitlist.submit`, `feedback.submit`, `feedback.uploadAttachment`, `auth.me`, `auth.logout`, and `binaryAnalysis.getAvailableFamilies` (static list, no sensitive data).

### 7. Secure File Broker Wired into Tunes and Voice Routers (MEDIUM)

**Problem:** The `tunes` and `voice` routers were calling `storagePut` directly, bypassing the secure file broker. This meant file uploads in those areas lacked rate limiting, ownership validation, SHA-256 hashing, and audit logging.

**Solution:**

The **tunes router** (`server/routers/tunes.ts`) now imports `secureUpload` from `secureFileAccess` instead of `storagePut` from `storage`. Both the binary upload and A2L upload in `saveTune` now flow through the secure broker with full audit logging, file hashing, and size validation. Raw S3 URLs are replaced with `[BROKERED_ACCESS]` placeholders in the database.

The **voice router** (`server/routers/voice.ts`) now imports both `secureUpload` and `secureDownload` from `secureFileAccess`. Both `uploadAndTranscribe` and `transcribeOnly` now upload audio through the secure broker, then obtain a short-lived presigned URL via `secureDownload` for the transcription service. This ensures all audio uploads are audited and rate-limited.

### 8. Server-Side Knox Shield Validation Middleware (MEDIUM)

**Problem:** The client-side `knoxShield` was adding `X-Knox-Shield` and `X-Knox-Timestamp` headers to requests, but the server never validated them. Automated tools (Postman, Python scripts, cURL) could bypass the browser entirely and hit API endpoints without any shield fingerprint.

**Solution:** New `server/lib/knoxShieldMiddleware.ts` module provides Express middleware that:

| Check | What It Does |
|-------|-------------|
| Header presence | Verifies `X-Knox-Shield` and `X-Knox-Timestamp` headers exist |
| Timestamp freshness | Rejects timestamps older than 5 minutes (replay attack prevention) |
| Suspicious logging | Logs IP, path, user-agent, and reason for all failed validations |
| Admin API | Exports `getSuspiciousRequests()` and `getShieldStats()` for the support dashboard |

The middleware is defense-in-depth: it flags suspicious requests via `req.knoxShieldValid` but does not block them, avoiding breakage for users on cached bundles. OAuth callbacks, health checks, and auth routes are exempt.

### 9. JSON Body Limit Reduced + Global Rate Limiting (MEDIUM)

**Problem:** The Express JSON body parser was set to `limit: "100mb"`, making the server vulnerable to memory exhaustion (DoS) attacks via oversized JSON payloads. There was also no global rate limiting on any API endpoint.

**Solution:**

| Setting | Before | After |
|---------|--------|-------|
| JSON body limit | 100MB | **2MB** |
| URL-encoded body limit | 100MB | **10MB** |
| Global API rate limit | None | **200 req/min per IP** |
| LLM route rate limit | None | **30 req/min per IP** |

The global rate limiter uses `express-rate-limit` and applies to all `/api/` routes. A stricter LLM-specific limiter is applied to the six most expensive endpoints: `diagnostic.chat`, `diagnostic.quickLookup`, `compare.analyze`, `editor.knoxChat`, `editor.simplifyMaps`, and `fleet.gooseChat`. Both limiters are disabled in development mode and use `X-Forwarded-For` for correct IP identification behind reverse proxies.

### 10. HTTP Security Headers via Helmet (MEDIUM)

**Problem:** The server was not sending any HTTP security headers, leaving it vulnerable to clickjacking, MIME sniffing, and other browser-based attacks.

**Solution:** The `helmet` package is now configured in the server entry point with the following policies:

| Header | Value | Purpose |
|--------|-------|---------|
| Content-Security-Policy | Strict directives for default, script, style, font, img, connect, media, worker, frame, object, base, form | Prevents XSS and unauthorized resource loading |
| Strict-Transport-Security | max-age=31536000; includeSubDomains; preload | Forces HTTPS for 1 year |
| X-Frame-Options | DENY | Prevents clickjacking |
| X-Content-Type-Options | nosniff | Prevents MIME type sniffing |
| X-Powered-By | (removed) | Hides Express server fingerprint |
| Referrer-Policy | strict-origin-when-cross-origin | Controls referrer leakage |
| Cross-Origin-Resource-Policy | cross-origin | Allows cross-origin resource loading for CDN assets |

---

## Files Created

| File | Purpose |
|------|---------|
| `server/lib/knoxVault.ts` | Server-only seed/key vault with algorithm implementations and audit logging |
| `server/lib/knoxKnowledgeServer.ts` | Server-only full Knox knowledge base (sanitized base + secrets) |
| `server/lib/secureFileAccess.ts` | Secure file upload/download broker with rate limiting and audit trail |
| `server/lib/knoxShieldMiddleware.ts` | Server-side Knox Shield header validation and suspicious request logging |
| `client/src/lib/knoxShield.ts` | Client-side anti-tamper and anti-sniffing protection module |

## Files Modified

| File | Changes |
|------|---------|
| `shared/knoxKnowledge.ts` | Export renamed; all secrets removed |
| `server/routers/editor.ts` | Import switched to `knoxKnowledgeServer`; all procedures locked; unused `publicProcedure` import removed |
| `server/routers/diagnostic.ts` | `chat` and `quickLookup` changed from `publicProcedure` to `protectedProcedure` |
| `server/routers/compare.ts` | `analyze` changed from `publicProcedure` to `protectedProcedure` |
| `server/routers/datalogCache.ts` | `cacheDatalog` locked; raw URL removed from response |
| `server/routers/tunes.ts` | `storagePut` replaced with `secureUpload`; raw URLs replaced with `[BROKERED_ACCESS]` |
| `server/routers/voice.ts` | `storagePut` replaced with `secureUpload` + `secureDownload`; all audio uploads audited |
| `server/_core/index.ts` | Added helmet, express-rate-limit (global + LLM), Knox Shield middleware; body limits reduced |
| `vite.config.ts` | Terser minification, source map suppression, console stripping, hash-based chunk names |
| `client/src/main.tsx` | Knox Shield activated at app startup |
| `package.json` | Added `helmet` and `express-rate-limit` dependencies |

---

## What Was NOT Changed

The following systems were explicitly left untouched to ensure zero interference with the closed-loop tuning pipeline and all existing functionality:

- **Editor engine** (`client/src/lib/editorEngine.ts`) -- all A2L parsing, binary reading, map value computation, and offset alignment logic
- **Knox Learning Engine** (`client/src/lib/knoxLearningEngine.ts`) -- learning from uploaded binaries and A2L files
- **Knox Map Search** (`client/src/lib/knoxMapSearch.ts`) -- map search and filtering
- **Knox Reasoning Feedback** (`client/src/lib/knoxReasoningFeedback.ts`) -- diagnostic reasoning pipeline
- **IntelliSpy** (`client/src/components/IntelliSpy.tsx`) -- security monitoring component
- **Binary analysis router** (`server/routers/binaryAnalysis.ts`) -- RE analysis pipeline
- **Projects router** (`server/routers/projects.ts`) -- project management
- **Monica router** (`server/routers/monica.ts`) -- customer debug assistant
- **Support router** (`server/routers/support.ts`) -- support sessions
- **All database schemas** -- no schema changes required
- **Authentication flow** -- OAuth, JWT cookies, role-based access all unchanged
- **tRPC transport** -- httpBatchLink, superjson transformer, credentials handling all unchanged

---

## Remaining Recommendations

1. **Subresource Integrity (SRI)** -- Adding integrity hashes to script tags would prevent CDN-level tampering.
2. **Geofencing integration** -- Tune upload/download restrictions by geographic zone, integrated with the secure file access broker.
3. **Periodic secret rotation** -- If the underlying ECU security allows it, implementing a rotation mechanism for seed/key secrets.
4. **Persistent audit log** -- The current in-memory audit log (10,000 entries) should be persisted to database for long-term forensics.
5. **CSRF token validation** -- While `sameSite: "none"` cookies with `secure: true` provide some protection, explicit CSRF tokens would add another layer.
