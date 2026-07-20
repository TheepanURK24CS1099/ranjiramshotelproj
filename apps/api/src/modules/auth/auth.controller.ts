import type { Request, Response, NextFunction } from "express";

import { env } from "../../config/environment.js";
import { authService } from "./auth.service.js";
import { loginSchema } from "./auth.schema.js";

export const authController = {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = loginSchema.safeParse({ body: req.body });

      if (!parsedBody.success) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
      }

      const { email, password } = parsedBody.data.body;
      const userAgent = req.headers["user-agent"] ?? undefined;
      const ipAddress = req.ip;

      const result = await authService.login(
        { email, password },
        userAgent,
        ipAddress
      );

      if (!result) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
      }

      res.cookie(env.SESSION_COOKIE_NAME, result.token, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: env.SESSION_DURATION_MS,
      });

      res.status(200).json(result.user);
    } catch (error) {
      next(error);
    }
  },

  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }
      res.status(200).json(req.user);
    } catch (error) {
      next(error);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = req.cookies[env.SESSION_COOKIE_NAME];
      if (token) {
        await authService.logout(token);
      }

      res.clearCookie(env.SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
      });

      res.status(200).json({ message: "Logged out" });
    } catch (error) {
      next(error);
    }
  }
};
