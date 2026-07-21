import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import * as controller from "./advances.controller.js";

const router = Router({ mergeParams: true });
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), controller.listAdvances);
router.get("/balance", requireAuth, requireRole("ADMIN", "MANAGER"), controller.getBalance);
router.post("/", requireAuth, requireRole("ADMIN", "MANAGER"), controller.createAdvance);
router.patch("/:transactionId", requireAuth, requireRole("ADMIN", "MANAGER"), controller.updateAdvance);
export default router;
