/**
 * Secure File Access Broker
 * ==========================
 * Wraps all storage operations with:
 *  1. Short-lived presigned URLs (never persist raw S3 URLs in DB)
 *  2. Access logging / audit trail
 *  3. User-scoped access checks
 *  4. Rate limiting on downloads
 *
 * All routers should use this instead of calling storagePut/storageGet directly.
 */

import { storageGet, storagePut } from '../storage';
import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface FileAccessRecord {
  timestamp: number;
  userId: number | string;
  action: 'upload' | 'download' | 'delete';
  fileKey: string;
  fileType: string;
  ipAddress?: string;
  userAgent?: string;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  /** Maximum downloads per user per hour */
  DOWNLOAD_RATE_LIMIT: 100,
  /** Rate limit window in milliseconds (1 hour) */
  RATE_LIMIT_WINDOW_MS: 60 * 60 * 1000,
  /** Maximum file size for uploads (100MB) */
  MAX_UPLOAD_SIZE: 100 * 1024 * 1024,
  /** Sensitive file types that require extra logging */
  SENSITIVE_FILE_TYPES: ['binary', 'a2l', 'tune', 'calibration', 'hex'],
  /** File types that should never be served to unauthenticated users */
  AUTH_REQUIRED_TYPES: ['binary', 'a2l', 'tune', 'calibration', 'hex', 'csv'],
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════

const accessLog: FileAccessRecord[] = [];
const rateLimitMap = new Map<string, RateLimitEntry>();

// ═══════════════════════════════════════════════════════════════════════════
// SECURE UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Secure file upload with validation, hashing, and audit logging.
 * Returns an opaque file reference (s3Key) instead of a raw URL.
 */
export async function secureUpload(params: {
  data: Buffer | Uint8Array | string;
  fileName: string;
  fileType: string;
  contentType: string;
  userId: number | string;
  projectId?: string;
}): Promise<{ s3Key: string; fileHash: string; fileSize: number }> {
  const { data, fileName, fileType, contentType, userId, projectId } = params;

  // 1. Validate file size
  const size = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
  if (size > CONFIG.MAX_UPLOAD_SIZE) {
    throw new Error(`File too large: ${size} bytes exceeds ${CONFIG.MAX_UPLOAD_SIZE} byte limit`);
  }

  // 2. Sanitize filename (prevent path traversal)
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);

  // 3. Compute file hash for integrity verification
  const hash = crypto.createHash('sha256');
  hash.update(typeof data === 'string' ? Buffer.from(data) : data);
  const fileHash = hash.digest('hex');

  // 4. Build storage key with user scoping
  const timestamp = Date.now();
  const suffix = crypto.randomBytes(4).toString('hex');
  const scopedKey = projectId
    ? `projects/${userId}/${projectId}/${fileType}/${timestamp}-${suffix}-${safeName}`
    : `uploads/${userId}/${fileType}/${timestamp}-${suffix}-${safeName}`;

  // 5. Upload to storage
  const { key } = await storagePut(scopedKey, data as Buffer, contentType);

  // 6. Audit log
  logAccess({
    timestamp,
    userId,
    action: 'upload',
    fileKey: key,
    fileType,
  });

  // 7. Return opaque reference — NOT the raw URL
  return { s3Key: key, fileHash, fileSize: size };
}

// ═══════════════════════════════════════════════════════════════════════════
// SECURE DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate a short-lived download URL for a file.
 * Enforces rate limiting and access logging.
 * The URL returned should be used immediately and not cached.
 */
export async function secureDownload(params: {
  s3Key: string;
  userId: number | string;
  fileType?: string;
  ipAddress?: string;
}): Promise<{ url: string; expiresIn: string }> {
  const { s3Key, userId, fileType, ipAddress } = params;

  // 1. Rate limit check
  const rateLimitKey = `dl:${userId}`;
  const now = Date.now();
  const entry = rateLimitMap.get(rateLimitKey);

  if (entry) {
    if (now - entry.windowStart > CONFIG.RATE_LIMIT_WINDOW_MS) {
      // Reset window
      rateLimitMap.set(rateLimitKey, { count: 1, windowStart: now });
    } else if (entry.count >= CONFIG.DOWNLOAD_RATE_LIMIT) {
      throw new Error('Download rate limit exceeded. Please try again later.');
    } else {
      entry.count++;
    }
  } else {
    rateLimitMap.set(rateLimitKey, { count: 1, windowStart: now });
  }

  // 2. Get presigned URL from storage
  const { url } = await storageGet(s3Key);

  // 3. Audit log (extra detail for sensitive files)
  const isSensitive = fileType && CONFIG.SENSITIVE_FILE_TYPES.includes(fileType.toLowerCase());
  logAccess({
    timestamp: now,
    userId,
    action: 'download',
    fileKey: s3Key,
    fileType: fileType || 'unknown',
    ipAddress: isSensitive ? ipAddress : undefined,
  });

  return {
    url,
    expiresIn: 'Presigned URL — use immediately',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCESS LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function logAccess(record: FileAccessRecord): void {
  accessLog.push(record);
  // Keep last 10,000 entries in memory
  if (accessLog.length > 10000) {
    accessLog.splice(0, accessLog.length - 10000);
  }

  // Log sensitive file access to console for monitoring
  if (record.fileType && CONFIG.SENSITIVE_FILE_TYPES.includes(record.fileType.toLowerCase())) {
    console.log(
      `[SECURITY] ${record.action.toUpperCase()} sensitive file: ${record.fileKey} by user ${record.userId}` +
      (record.ipAddress ? ` from ${record.ipAddress}` : '')
    );
  }
}

/**
 * Get recent access log entries (admin only)
 */
export function getAccessLog(options?: {
  userId?: number | string;
  action?: 'upload' | 'download' | 'delete';
  fileType?: string;
  limit?: number;
}): FileAccessRecord[] {
  let filtered = accessLog;

  if (options?.userId) {
    filtered = filtered.filter(r => r.userId === options.userId);
  }
  if (options?.action) {
    filtered = filtered.filter(r => r.action === options.action);
  }
  if (options?.fileType) {
    filtered = filtered.filter(r => r.fileType === options.fileType);
  }

  return filtered.slice(-(options?.limit || 100));
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that a user owns or has access to a file.
 * Used before serving download URLs.
 */
export function validateFileOwnership(
  fileKey: string,
  userId: number | string
): boolean {
  // Files are scoped under user ID in the key path
  // e.g., projects/123/... or uploads/123/...
  const userPrefix1 = `projects/${userId}/`;
  const userPrefix2 = `uploads/${userId}/`;
  const voicePrefix = `voice-commands/${userId}/`;
  const chatAudioPrefix = `chat-audio/${userId}/`;

  // Shared/library files (a2l-library, etc.) are accessible to all authenticated users
  if (fileKey.startsWith('a2l-library/')) return true;

  return (
    fileKey.startsWith(userPrefix1) ||
    fileKey.startsWith(userPrefix2) ||
    fileKey.startsWith(voicePrefix) ||
    fileKey.startsWith(chatAudioPrefix)
  );
}

/**
 * Scrub S3 URLs from response objects before sending to client.
 * Replaces raw URLs with a placeholder indicating server-brokered access.
 */
export function scrubStorageUrls<T extends Record<string, unknown>>(obj: T): T {
  const scrubbed = { ...obj };
  for (const key of Object.keys(scrubbed)) {
    const val = scrubbed[key];
    if (typeof val === 'string' && (val.includes('s3.amazonaws.com') || val.includes('storage.googleapis.com') || val.includes('forge'))) {
      if (key.toLowerCase().includes('url') || key.toLowerCase().includes('s3url')) {
        (scrubbed as any)[key] = '[BROKERED_ACCESS]';
      }
    }
  }
  return scrubbed;
}
