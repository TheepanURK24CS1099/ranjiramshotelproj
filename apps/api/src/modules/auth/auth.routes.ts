import { Router } from "express";
import { rateLimit } from "express-rate-limit";

import { env } from "../../config/environment.js";
import { authController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});

router.post("/login", loginLimiter, authController.login);
router.get("/me", requireAuth, authController.me);
router.post("/logout", authController.logout);

export default router;
