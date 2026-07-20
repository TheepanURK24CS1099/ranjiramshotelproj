import { Router } from "express";
import { getDashboardSummary } from "./dashboard.controller.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

const router = Router();

// Dashboard is accessible to both ADMIN and MANAGER
router.get("/summary", requireAuth, requireRole("ADMIN", "MANAGER"), getDashboardSummary);

export default router;
