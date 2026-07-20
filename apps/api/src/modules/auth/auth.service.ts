import argon2 from "argon2";

import { env } from "../../config/environment.js";
import { authRepository, type AppUser } from "./auth.repository.js";
import { generateSessionToken, hashSessionToken } from "./auth.utils.js";
import type { LoginInput } from "./auth.schema.js";

export const authService = {
  async login(
    input: LoginInput,
    userAgent?: string,
    ipAddress?: string
  ): Promise<{ token: string; user: Omit<AppUser, "password_hash"> } | null> {
    const user = await authRepository.getUserByEmail(input.email);

    if (!user || !user.active) {
      return null;
    }

    if (user.locked_until && user.locked_until > new Date()) {
      return null;
    }

    const isValidPassword = await argon2.verify(user.password_hash, input.password);

    if (!isValidPassword) {
      const attempts = user.failed_login_attempts + 1;
      let lockUntil: Date | null = null;
      if (attempts >= env.MAX_FAILED_ATTEMPTS) {
        lockUntil = new Date(Date.now() + env.LOCK_DURATION_MS);
      }
      await authRepository.incrementFailedAttempts(user.id, lockUntil);
      return null;
    }

    await authRepository.resetFailedAttemptsAndSetLoginTime(user.id);

    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + env.SESSION_DURATION_MS);

    await authRepository.createSession(
      user.id,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = user;

    return {
      token: rawToken,
      user: safeUser,
    };
  },

  async validateSession(rawToken: string): Promise<Omit<AppUser, "password_hash"> | null> {
    const tokenHash = hashSessionToken(rawToken);
    const session = await authRepository.getSessionByHash(tokenHash);

    if (!session || session.revoked_at || session.expires_at < new Date()) {
      return null;
    }

    const user = await authRepository.getUserById(session.user_id);
    if (!user || !user.active) {
      return null;
    }

    await authRepository.updateSessionLastUsed(session.id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...safeUser } = user;
    return safeUser;
  },

  async logout(rawToken: string): Promise<void> {
    const tokenHash = hashSessionToken(rawToken);
    const session = await authRepository.getSessionByHash(tokenHash);

    if (session && !session.revoked_at) {
      await authRepository.revokeSession(session.id);
    }
  }
};
