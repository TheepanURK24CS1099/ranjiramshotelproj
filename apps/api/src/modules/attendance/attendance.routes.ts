import { Router } from "express";

import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import { clearAttendanceDate, deleteAttendance, deleteExceptions, listAttendance, listAttendanceExceptions, rebuildAttendance, resolveExceptions } from "./attendance.controller.js";

const router = Router();

router.get("/exceptions", requireAuth, requireRole("ADMIN", "MANAGER"), listAttendanceExceptions);
router.post("/rebuild", requireAuth, requireRole("ADMIN"), rebuildAttendance);
router.delete("/records", requireAuth, requireRole("ADMIN"), deleteAttendance);
router.post("/records/clear-date", requireAuth, requireRole("ADMIN"), clearAttendanceDate);
router.patch("/exceptions/resolve", requireAuth, requireRole("ADMIN"), resolveExceptions);
router.delete("/exceptions", requireAuth, requireRole("ADMIN"), deleteExceptions);
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), listAttendance);

export default router;
