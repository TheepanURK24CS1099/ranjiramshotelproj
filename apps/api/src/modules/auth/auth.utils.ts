import crypto from "node:crypto";

/**
 * Generates a cryptographically secure random session token.
 * Returns the raw token as a base64url string.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Hashes a session token using SHA-256 for secure database storage.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
