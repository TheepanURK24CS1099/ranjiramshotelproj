import { Router } from "express";

import { getReady } from "../modules/health/health.controller.js";
import healthRoutes from "../modules/health/health.routes.js";

const router = Router();

router.use("/health", healthRoutes);
router.get("/ready", getReady);

export default router;
