/**
 * Knox Shield — Server-Side Validation Middleware
 * =================================================
 * Validates the X-Knox-Shield header sent by the client-side knoxShield.ts module.
 *
 * This middleware:
 *  1. Checks for the presence of X-Knox-Shield and X-Knox-Timestamp headers
 *  2. Validates that the timestamp is recent (within 5 minutes) to prevent replay attacks
 *  3. Logs suspicious requests that are missing the shield headers
 *
 * In production, requests without valid shield headers are flagged but NOT blocked
 * to avoid breaking legitimate users on older cached bundles. The flag is available
 * to downstream handlers for additional scrutiny (e.g., stricter rate limits).
 *
 * SECURITY: This is a defense-in-depth layer. It is NOT a substitute for authentication.
 */

import type { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  /** Maximum age of X-Knox-Timestamp before it's considered stale (5 minutes) */
  MAX_TIMESTAMP_AGE_MS: 5 * 60 * 1000,
  /** Minimum expected shield version */
  MIN_SHIELD_VERSION: '1.0',
  /** Paths that are exempt from shield validation (OAuth callbacks, health checks) */
  EXEMPT_PATHS: [
    '/api/oauth/',
    '/api/health',
    '/api/trpc/waitlist.submit',
    '/api/trpc/feedback.submit',
    '/api/trpc/feedback.uploadAttachment',
    '/api/trpc/auth.me',
    '/api/trpc/auth.logout',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// SUSPICIOUS REQUEST LOG
// ═══════════════════════════════════════════════════════════════════════════

interface SuspiciousRequest {
  timestamp: number;
  ip: string;
  path: string;
  reason: string;
  userAgent?: string;
}

const suspiciousLog: SuspiciousRequest[] = [];

function logSuspicious(req: Request, reason: string): void {
  const entry: SuspiciousRequest = {
    timestamp: Date.now(),
    ip: req.ip || req.socket.remoteAddress || 'unknown',
    path: req.path,
    reason,
    userAgent: req.headers['user-agent']?.slice(0, 200),
  };
  suspiciousLog.push(entry);

  // Keep last 5,000 entries
  if (suspiciousLog.length > 5000) {
    suspiciousLog.splice(0, suspiciousLog.length - 5000);
  }

  // Console log for real-time monitoring
  console.warn(
    `[KNOX-SHIELD] Suspicious request: ${reason} | IP: ${entry.ip} | Path: ${entry.path} | UA: ${entry.userAgent || 'none'}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Express middleware that validates Knox Shield headers on API requests.
 * Attaches `req.knoxShieldValid` (boolean) for downstream use.
 */
export function knoxShieldMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip non-API routes (static files, etc.)
  if (!req.path.startsWith('/api/')) {
    return next();
  }

  // Skip exempt paths
  if (CONFIG.EXEMPT_PATHS.some(p => req.path.startsWith(p))) {
    return next();
  }

  const shieldHeader = req.headers['x-knox-shield'] as string | undefined;
  const timestampHeader = req.headers['x-knox-timestamp'] as string | undefined;

  // Attach validation result to request for downstream handlers
  (req as any).knoxShieldValid = false;

  // Check 1: Shield header present
  if (!shieldHeader) {
    logSuspicious(req, 'Missing X-Knox-Shield header');
    return next(); // Continue but flagged
  }

  // Check 2: Timestamp header present
  if (!timestampHeader) {
    logSuspicious(req, 'Missing X-Knox-Timestamp header');
    return next();
  }

  // Check 3: Timestamp is a valid number
  const timestamp = parseInt(timestampHeader, 10);
  if (isNaN(timestamp)) {
    logSuspicious(req, `Invalid X-Knox-Timestamp: ${timestampHeader}`);
    return next();
  }

  // Check 4: Timestamp is recent (prevent replay attacks)
  const age = Date.now() - timestamp;
  if (age > CONFIG.MAX_TIMESTAMP_AGE_MS || age < -CONFIG.MAX_TIMESTAMP_AGE_MS) {
    logSuspicious(req, `Stale X-Knox-Timestamp: ${age}ms old`);
    return next();
  }

  // All checks passed
  (req as any).knoxShieldValid = true;
  return next();
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get recent suspicious request log entries (for admin/support dashboard).
 */
export function getSuspiciousRequests(limit: number = 100): SuspiciousRequest[] {
  return suspiciousLog.slice(-limit);
}

/**
 * Get summary statistics of suspicious requests.
 */
export function getShieldStats(): {
  totalSuspicious: number;
  last24h: number;
  topIPs: Array<{ ip: string; count: number }>;
} {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const recent = suspiciousLog.filter(r => r.timestamp > dayAgo);

  // Count by IP
  const ipCounts = new Map<string, number>();
  for (const entry of recent) {
    ipCounts.set(entry.ip, (ipCounts.get(entry.ip) || 0) + 1);
  }

  const topIPs = Array.from(ipCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ip, count]) => ({ ip, count }));

  return {
    totalSuspicious: suspiciousLog.length,
    last24h: recent.length,
    topIPs,
  };
}
