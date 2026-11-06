import bcrypt from "bcryptjs";

/**
 * Password helpers for the Next.js server only.
 * Never expose hashes or password values to logs/client responses.
 * BCRYPT_COST must be benchmarked on the production runtime; 12 is a conservative baseline.
 */
const configuredCost = Number.parseInt(process.env.BCRYPT_COST ?? "12", 10);
const COST = Number.isInteger(configuredCost) && configuredCost >= 12 && configuredCost <= 15
  ? configuredCost
  : 12;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) {
    throw new Error("Password must be between 12 and 128 characters.");
  }
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (password.length > 128 || !hash) return false;
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}

/**
 * Apply these options to your server-set session cookie. Use a maintained session
 * library/provider and rotate session IDs on login/privilege changes.
 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  // Deliberately no Domain attribute: keep the cookie host-only.
  maxAge: 60 * 60 * 8,
};
