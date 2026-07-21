import request from "supertest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import argon2 from "argon2";

import app from "../src/app.js";
import { authRepository } from "../src/modules/auth/auth.repository.js";
import { env } from "../src/config/environment.js";

vi.mock("../src/modules/auth/auth.repository.js", () => {
  return {
    authRepository: {
      getUserByUsername: vi.fn(),
      getUserById: vi.fn(),
      incrementFailedAttempts: vi.fn(),
      resetFailedAttemptsAndSetLoginTime: vi.fn(),
      createSession: vi.fn(),
      getSessionByHash: vi.fn(),
      updateSessionLastUsed: vi.fn(),
      revokeSession: vi.fn(),
      createOrResetAdmin: vi.fn(),
    },
  };
});

describe("Auth Module Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser = {
    id: "user-uuid",
    email: "test@example.com",
    username: "admin",
    password_hash: "dummy_hash",
    role: "MANAGER",
    active: true,
    failed_login_attempts: 0,
    locked_until: null,
  };

  const mockSession = {
    id: "session-uuid",
    user_id: "user-uuid",
    token_hash: "hash_of_token",
    expires_at: new Date(Date.now() + 10000),
    revoked_at: null,
    last_used_at: null,
    user_agent: null,
    ip_address: null,
    created_at: new Date(),
  };

  describe("POST /auth/login", () => {
    it("should return generic 401 for an unknown username", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(null);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "unknown", password: "password123" })
        .expect(401);

      expect(response.body.message).toBe("Invalid username or password");
    });

    it("should return generic 401 for invalid password and increment attempts", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(mockUser as never);
      vi.spyOn(argon2, "verify").mockResolvedValue(false);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "admin", password: "wrong_password" })
        .expect(401);

      expect(response.body.message).toBe("Invalid username or password");
      expect(authRepository.incrementFailedAttempts).toHaveBeenCalled();
    });

    it("should lock account if max attempts reached", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue({
        ...mockUser,
        failed_login_attempts: env.MAX_FAILED_ATTEMPTS - 1,
      } as never);
      vi.spyOn(argon2, "verify").mockResolvedValue(false);

      await request(app)
        .post("/auth/login")
        .send({ username: "admin", password: "wrong_password" })
        .expect(401);

      expect(authRepository.incrementFailedAttempts).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Date)
      );
    });

    it("should reject locked account", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue({
        ...mockUser,
        locked_until: new Date(Date.now() + 10000),
      } as never);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "admin", password: "password123" })
        .expect(401);
      
      expect(response.body.message).toBe("Invalid username or password");
    });

    it("should reject inactive account", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue({
        ...mockUser,
        active: false,
      } as never);

      await request(app)
        .post("/auth/login")
        .send({ username: "admin", password: "password123" })
        .expect(401);
    });

    it("should login successfully using the admin username and set a session cookie", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(mockUser as never);
      vi.spyOn(argon2, "verify").mockResolvedValue(true);
      vi.mocked(authRepository.createSession).mockResolvedValue(mockSession as never);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "admin", password: "password123" })
        .expect(200);

      expect(response.body).not.toHaveProperty("password_hash");
      expect(response.body.username).toBe(mockUser.username);
      expect(response.body.email).toBe(mockUser.email);

      const cookies = response.headers["set-cookie"]!;
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain(env.SESSION_COOKIE_NAME);
      expect(cookies[0]).toContain("HttpOnly");
      expect(cookies[0]).toContain("SameSite=Lax");
      
      expect(authRepository.resetFailedAttemptsAndSetLoginTime).toHaveBeenCalledWith(mockUser.id);
    });

    it("should treat usernames as case-insensitive", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(mockUser as never);
      vi.spyOn(argon2, "verify").mockResolvedValue(true);
      vi.mocked(authRepository.createSession).mockResolvedValue(mockSession as never);

      await request(app)
        .post("/auth/login")
        .send({ username: "ADMIN", password: "password123" })
        .expect(200);

      expect(authRepository.getUserByUsername).toHaveBeenCalledWith("admin");
    });

    it("should ignore surrounding spaces in usernames", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(mockUser as never);
      vi.spyOn(argon2, "verify").mockResolvedValue(true);
      vi.mocked(authRepository.createSession).mockResolvedValue(mockSession as never);

      await request(app)
        .post("/auth/login")
        .send({ username: "  admin  ", password: "password123" })
        .expect(200);

      expect(authRepository.getUserByUsername).toHaveBeenCalledWith("admin");
    });

    it("should not accept email as the login identifier", async () => {
      const response = await request(app)
        .post("/auth/login")
        .send({ email: "test@example.com", password: "password123" })
        .expect(401);

      expect(response.body.message).toBe("Invalid username or password");
      expect(authRepository.getUserByUsername).not.toHaveBeenCalled();
    });

    it("should return 429 when rate limit is exceeded", async () => {
      vi.mocked(authRepository.getUserByUsername).mockResolvedValue(null);

      // Hit the endpoint until we get a 429
      let status = 200;
      let body: any; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let i = 0; i < env.LOGIN_RATE_LIMIT_MAX + 10; i++) {
        const res = await request(app)
          .post("/auth/login")
          .send({ username: "rate-limit", password: "password123" });
        status = res.status;
        body = res.body;
        if (status === 429) break;
      }

      expect(status).toBe(429);
      expect(body.message).toBe("Too many login attempts, please try again later");
    });
  });

  describe("GET /auth/me", () => {
    it("should reject request without cookie", async () => {
      await request(app).get("/auth/me").expect(401);
    });

    it("should reject revoked session and clear cookie", async () => {
      vi.mocked(authRepository.getSessionByHash).mockResolvedValue({
        ...mockSession,
        revoked_at: new Date(),
      } as never);

      const response = await request(app)
        .get("/auth/me")
        .set("Cookie", [`${env.SESSION_COOKIE_NAME}=dummy_token`])
        .expect(401);

      const cookies = response.headers["set-cookie"]!;
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain(`${env.SESSION_COOKIE_NAME}=;`);
    });

    it("should return safe user profile for valid session", async () => {
      vi.mocked(authRepository.getSessionByHash).mockResolvedValue(mockSession as never);
      vi.mocked(authRepository.getUserById).mockResolvedValue(mockUser as never);

      const response = await request(app)
        .get("/auth/me")
        .set("Cookie", [`${env.SESSION_COOKIE_NAME}=valid_token`])
        .expect(200);

      expect(response.body).not.toHaveProperty("password_hash");
      expect(response.body.email).toBe(mockUser.email);
      expect(authRepository.updateSessionLastUsed).toHaveBeenCalledWith(mockSession.id);
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear cookie even if no session provided", async () => {
      const response = await request(app).post("/auth/logout").expect(200);

      const cookies = response.headers["set-cookie"]!;
      expect(cookies[0]).toContain(`${env.SESSION_COOKIE_NAME}=;`);
    });

    it("should revoke session and clear cookie", async () => {
      vi.mocked(authRepository.getSessionByHash).mockResolvedValue(mockSession as never);

      const response = await request(app)
        .post("/auth/logout")
        .set("Cookie", [`${env.SESSION_COOKIE_NAME}=valid_token`])
        .expect(200);

      expect(authRepository.revokeSession).toHaveBeenCalledWith(mockSession.id);
      
      const cookies = response.headers["set-cookie"]!;
      expect(cookies[0]).toContain(`${env.SESSION_COOKIE_NAME}=;`);
    });
  });
});
