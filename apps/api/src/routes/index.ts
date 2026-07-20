import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import { getReady } from "../modules/health/health.controller.js";
import healthRoutes from "../modules/health/health.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/health", healthRoutes);
router.get("/ready", getReady);

export default router;
