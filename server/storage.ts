// Preconfigured S3 storage helpers
// Uses the Biz-provided storage proxy (Authorization: Bearer <token>)
// When BUILT_IN_FORGE_* is unset: non-production uses ./.data/object-storage + /api/dev-object-storage

import fs from "fs/promises";
import path from "path";
import type { Application } from "express";
import { ENV } from "./_core/env";

type StorageConfig = { baseUrl: string; apiKey: string };

function forgeConfigured(): boolean {
  return !!(ENV.forgeApiUrl?.trim() && ENV.forgeApiKey?.trim());
}

/**
 * Directory for local disk storage when Forge proxy is not used.
 * - Explicit LOCAL_OBJECT_STORAGE_DIR → always (including production) if Forge unset.
 * - Else if NODE_ENV === "production" → null (require Forge or explicit dir).
 * - Else → project .data/object-storage
 */
export function getLocalObjectStorageRoot(): string | null {
  if (forgeConfigured()) return null;
  const override = process.env.LOCAL_OBJECT_STORAGE_DIR?.trim();
  if (override) return path.resolve(override);
  if (process.env.NODE_ENV === "production") return null;
  return path.join(process.cwd(), ".data", "object-storage");
}

let loggedLocalStorage = false;

function logLocalStorageOnce(root: string): void {
  if (loggedLocalStorage) return;
  loggedLocalStorage = true;
  console.warn(
    `[storage] Using on-disk object storage at ${root} (BUILT_IN_FORGE_API_URL/KEY not set). ` +
      "Tune uploads and other features work locally; set Forge vars or LOCAL_OBJECT_STORAGE_DIR for production.",
  );
}

function getForgeConfig(): StorageConfig {
  const baseUrl = ENV.forgeApiUrl?.trim() ?? "";
  const apiKey = ENV.forgeApiKey?.trim() ?? "";
  if (!baseUrl || !apiKey) {
    throw new Error(
      'Storage unavailable: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY, ' +
        'or set LOCAL_OBJECT_STORAGE_DIR for disk-backed storage, ' +
        'or run with NODE_ENV=development to use .data/object-storage automatically.',
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

function buildUploadUrl(baseUrl: string, relKey: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", normalizeKey(relKey));
  return url;
}

async function buildDownloadUrl(
  baseUrl: string,
  relKey: string,
  apiKey: string,
): Promise<string> {
  const downloadApiUrl = new URL(
    "v1/storage/downloadUrl",
    ensureTrailingSlash(baseUrl),
  );
  downloadApiUrl.searchParams.set("path", normalizeKey(relKey));
  const response = await fetch(downloadApiUrl, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  return (await response.json()).url;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string,
): FormData {
  const payload =
    typeof data === "string"
      ? data
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
  const blob = new Blob([payload], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function localPublicUrl(key: string): string {
  return `/api/dev-object-storage?path=${encodeURIComponent(key)}`;
}

function resolveSafeLocalFile(root: string, relKey: string): string | null {
  const key = normalizeKey(relKey);
  if (key.includes("..") || path.isAbsolute(key)) return null;
  const full = path.join(root, key);
  const resolved = path.resolve(full);
  const rootResolved = path.resolve(root);
  if (!resolved.startsWith(rootResolved + path.sep) && resolved !== rootResolved) {
    return null;
  }
  return resolved;
}

async function storagePutLocal(
  relKey: string,
  data: Buffer | Uint8Array | string,
  root: string,
): Promise<{ key: string; url: string }> {
  logLocalStorageOnce(root);
  const key = normalizeKey(relKey);
  const abs = resolveSafeLocalFile(root, key);
  if (!abs) {
    throw new Error("Invalid storage key path");
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  const buf =
    typeof data === "string"
      ? Buffer.from(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);
  await fs.writeFile(abs, buf);
  return { key, url: localPublicUrl(key) };
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const localRoot = getLocalObjectStorageRoot();
  if (localRoot) {
    return storagePutLocal(relKey, data, localRoot);
  }

  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  const uploadUrl = buildUploadUrl(baseUrl, key);
  const formData = toFormData(data, contentType, key.split("/").pop() ?? key);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(
      `Storage upload failed (${response.status} ${response.statusText}): ${message}`,
    );
  }
  const url = (await response.json()).url;
  return { key, url };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const localRoot = getLocalObjectStorageRoot();
  if (localRoot) {
    logLocalStorageOnce(localRoot);
    const key = normalizeKey(relKey);
    return { key, url: localPublicUrl(key) };
  }

  const { baseUrl, apiKey } = getForgeConfig();
  const key = normalizeKey(relKey);
  return {
    key,
    url: await buildDownloadUrl(baseUrl, key, apiKey),
  };
}

/** Serves files written by storagePut when using local disk mode. */
export function registerDevObjectStorageRoute(app: Application): void {
  const root = getLocalObjectStorageRoot();
  if (!root) return;

  app.get("/api/dev-object-storage", async (req, res) => {
    const q = req.query.path;
    const p = typeof q === "string" ? q : Array.isArray(q) ? q[0] : "";
    if (typeof p !== "string" || !p) {
      res.status(400).type("text").send("missing path query");
      return;
    }
    const abs = resolveSafeLocalFile(root, p);
    if (!abs) {
      res.status(400).type("text").send("invalid path");
      return;
    }
    try {
      const st = await fs.stat(abs);
      if (!st.isFile()) {
        res.status(404).type("text").send("not found");
        return;
      }
      res.sendFile(abs);
    } catch {
      res.status(404).type("text").send("not found");
    }
  });
}
