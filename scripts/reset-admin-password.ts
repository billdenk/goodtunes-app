/**
 * One-off admin password reset.
 *
 * Generates a strong temporary password, hashes it with the same scrypt
 * format the auth code uses (`<hex>.<salt>`), and writes it back to the
 * `users.password` column for the given email. Prints the temporary
 * password to stdout so the operator can hand it to the admin out-of-band.
 *
 * Refuses to run without an explicit --email argument and only touches a
 * single account per invocation. Does not send email and does not touch
 * 2FA — the admin still completes their second factor on sign-in as usual.
 *
 * Run:
 *   npx tsx scripts/reset-admin-password.ts --email bill@gogoods.com
 */
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";
import { sql } from "drizzle-orm";
import { db, pool } from "../server/db";
import { users } from "../shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

// 20-char URL-safe-ish temp password. Mixed-case + digits + a couple of
// punctuation chars so it satisfies any reasonable "strong password"
// policy the admin's password manager might enforce on re-entry.
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += alphabet[bytes[i] % alphabet.length];
  // Guarantee at least one digit and one symbol so length-only validators pass.
  return `${out}7!`;
}

function parseEmailArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email" && argv[i + 1]) return argv[i + 1];
    if (a.startsWith("--email=")) return a.slice("--email=".length);
  }
  return null;
}

async function main() {
  const email = parseEmailArg(process.argv.slice(2))?.trim();
  if (!email) {
    console.error("Usage: npx tsx scripts/reset-admin-password.ts --email <address>");
    process.exit(2);
  }

  const rows = await db
    .select({ id: users.id, username: users.username, email: users.email })
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`);

  if (rows.length === 0) {
    console.error(`No admin user found with email ${email}`);
    process.exit(1);
  }
  if (rows.length > 1) {
    console.error(`Refusing to run: ${rows.length} users match ${email}`);
    process.exit(1);
  }

  const user = rows[0];
  const tempPassword = generateTempPassword();
  const hashed = await hashPassword(tempPassword);

  await db.update(users).set({ password: hashed }).where(sql`${users.id} = ${user.id}`);

  console.log("");
  console.log("Admin password reset.");
  console.log(`  user:     ${user.username} (${user.email})`);
  console.log(`  temp pwd: ${tempPassword}`);
  console.log("");
  console.log("Sign in with the temp password, then go to /admin/security and");
  console.log("set a real password (the Current password field accepts this one).");
  console.log("");
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e);
    pool.end().finally(() => process.exit(1));
  });
