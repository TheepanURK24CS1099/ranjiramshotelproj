import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { listAttendance } from "./attendance.controller.js";

const router = Router();

router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), listAttendance);

export default router;
