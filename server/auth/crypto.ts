import { createCipheriv, createDecipheriv, randomBytes, createHash, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

function getKey(): Buffer {
  const k = process.env.TOTP_ENC_KEY;
  if (!k) throw new Error("TOTP_ENC_KEY missing — set it in Secrets before enrolling admin 2FA");
  return createHash("sha256").update(k).digest();
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decryptSecret(packed: string): string {
  const key = getKey();
  const [ivB, tagB, encB] = packed.split(".");
  const iv = Buffer.from(ivB, "base64");
  const tag = Buffer.from(tagB, "base64");
  const enc = Buffer.from(encB, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// Recovery codes — 10 single-use, scrypt-hashed.
export function generateRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export async function hashRecoveryCode(code: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(code.toUpperCase().replace(/-/g, ""), salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function verifyRecoveryCode(code: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  if (!hashed || !salt) return false;
  const expected = Buffer.from(hashed, "hex");
  const actual = (await scryptAsync(code.toUpperCase().replace(/-/g, ""), salt, 64)) as Buffer;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
