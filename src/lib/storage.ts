import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";

// Two drivers:
//   local (default) - files on disk under STORAGE_LOCAL_DIR, for development.
//   s3              - any S3-compatible object storage (AWS S3, Cloudflare R2, MinIO).
// Objects are never public. Downloads always go through the authorized route
// /api/attachments/[id], which checks ticket access first and then either
// streams the file (local) or redirects to a signed URL valid for 60 seconds (s3).

const SIGNED_URL_SECONDS = 60;

function driver(): "local" | "s3" {
  return process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

/** Random, unguessable key. Never derived from the file name. */
export function newStorageKey(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `attachments/${now.getUTCFullYear()}/${month}/${randomBytes(24).toString("hex")}`;
}

// ───────────────────────── local ─────────────────────────

function localRoot(): string {
  return path.resolve(process.env.STORAGE_LOCAL_DIR || "storage");
}

function localPath(key: string): string {
  if (!/^[a-zA-Z0-9/_-]+$/.test(key)) throw new Error("Invalid storage key.");
  const root = localRoot();
  const resolved = path.resolve(root, key);
  if (!resolved.startsWith(root + path.sep)) throw new Error("Invalid storage key.");
  return resolved;
}

// ───────────────────────── s3 ─────────────────────────

let s3Client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when STORAGE_DRIVER is "s3".`);
  return value;
}

async function getS3(): Promise<S3Client> {
  if (s3Client) return s3Client;
  const { S3Client: Client } = await import("@aws-sdk/client-s3");
  s3Client = new Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
    },
  });
  return s3Client;
}

// ───────────────────────── API ─────────────────────────

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (driver() === "s3") {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await getS3()).send(
      new PutObjectCommand({
        Bucket: requireEnv("S3_BUCKET"),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return;
  }
  const target = localPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, body, { flag: "wx" });
}

export async function deleteObject(key: string): Promise<void> {
  if (driver() === "s3") {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await getS3()).send(
      new DeleteObjectCommand({ Bucket: requireEnv("S3_BUCKET"), Key: key }),
    );
    return;
  }
  await fs.rm(localPath(key), { force: true });
}

export function contentDisposition(fileName: string, inline: boolean): string {
  const fallback = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export type Download =
  | { kind: "redirect"; url: string }
  | { kind: "buffer"; body: Buffer };

/** Call only after the caller has verified the user may see this file. */
export async function getDownload(
  key: string,
  options: { fileName: string; contentType: string; inline: boolean },
): Promise<Download> {
  if (driver() === "s3") {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await getSignedUrl(
      await getS3(),
      new GetObjectCommand({
        Bucket: requireEnv("S3_BUCKET"),
        Key: key,
        ResponseContentType: options.contentType,
        ResponseContentDisposition: contentDisposition(options.fileName, options.inline),
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
    return { kind: "redirect", url };
  }
  return { kind: "buffer", body: await fs.readFile(localPath(key)) };
}
