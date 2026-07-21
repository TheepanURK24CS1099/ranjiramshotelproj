import { getDatabasePool } from "../../infrastructure/database/database.js";

export interface AppUser {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  role: "ADMIN" | "MANAGER";
  active: boolean;
  failed_login_attempts: number;
  locked_until: Date | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  last_used_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
}

export const authRepository = {
  async getUserByUsername(username: string): Promise<AppUser | null> {
    const pool = getDatabasePool();
    const result = await pool.query<AppUser>(
      "SELECT * FROM app_users WHERE lower(username) = lower($1)",
      [username]
    );
    return result.rows[0] ?? null;
  },

  async getUserById(id: string): Promise<AppUser | null> {
    const pool = getDatabasePool();
    const result = await pool.query<AppUser>(
      "SELECT * FROM app_users WHERE id = $1",
      [id]
    );
    return result.rows[0] ?? null;
  },

  async incrementFailedAttempts(userId: string, lockedUntil: Date | null): Promise<void> {
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE app_users 
       SET failed_login_attempts = failed_login_attempts + 1, 
           locked_until = $2, 
           updated_at = now() 
       WHERE id = $1`,
      [userId, lockedUntil]
    );
  },

  async resetFailedAttemptsAndSetLoginTime(userId: string): Promise<void> {
    const pool = getDatabasePool();
    await pool.query(
      `UPDATE app_users 
       SET failed_login_attempts = 0, 
           locked_until = NULL, 
           last_login_at = now(),
           updated_at = now() 
       WHERE id = $1`,
      [userId]
    );
  },

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    userAgent?: string,
    ipAddress?: string
  ): Promise<AuthSession> {
    const pool = getDatabasePool();
    const result = await pool.query<AuthSession>(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, tokenHash, expiresAt, userAgent ?? null, ipAddress ?? null]
    );
    return result.rows[0] as AuthSession;
  },

  async getSessionByHash(tokenHash: string): Promise<AuthSession | null> {
    const pool = getDatabasePool();
    const result = await pool.query<AuthSession>(
      "SELECT * FROM auth_sessions WHERE token_hash = $1",
      [tokenHash]
    );
    return result.rows[0] ?? null;
  },

  async updateSessionLastUsed(sessionId: string): Promise<void> {
    const pool = getDatabasePool();
    await pool.query(
      "UPDATE auth_sessions SET last_used_at = now() WHERE id = $1",
      [sessionId]
    );
  },

  async revokeSession(sessionId: string): Promise<void> {
    const pool = getDatabasePool();
    await pool.query(
      "UPDATE auth_sessions SET revoked_at = now() WHERE id = $1",
      [sessionId]
    );
  },
  
  async createOrResetAdmin(username: string, passwordHash: string): Promise<AppUser> {
    const pool = getDatabasePool();
    const result = await pool.query<AppUser>(
      `INSERT INTO app_users (email, username, password_hash, role)
       VALUES ($1 || '-' || replace(gen_random_uuid()::text, '-', '') || '@local.invalid', $1, $2, 'ADMIN')
       ON CONFLICT (lower(username)) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'ADMIN',
           active = true,
           failed_login_attempts = 0,
           locked_until = NULL,
           updated_at = now()
       RETURNING *`,
      [username, passwordHash]
    );
    return result.rows[0] as AppUser;
  }
};
