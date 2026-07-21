import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { listAttendance, listAttendanceExceptions } from "./attendance.controller.js";

const router = Router();

router.get("/exceptions", requireAuth, requireRole("ADMIN", "MANAGER"), listAttendanceExceptions);
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), listAttendance);

export default router;
