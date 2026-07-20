import type { Request, Response, NextFunction } from "express";

import { env } from "../../config/environment.js";
import { authService } from "./auth.service.js";
import type { AppUser } from "./auth.repository.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: Omit<AppUser, "password_hash">;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const token = req.cookies[env.SESSION_COOKIE_NAME];

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const user = await authService.validateSession(token);

    if (!user) {
      res.clearCookie(env.SESSION_COOKIE_NAME, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
      });
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (...roles: Array<AppUser["role"]>) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
};
