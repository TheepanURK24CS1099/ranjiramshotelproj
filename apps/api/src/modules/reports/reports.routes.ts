import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import * as controller from "./reports.controller.js";
const operational = new Set(["attendance-summary", "device-logs", "raw-punches", "attendance-exceptions"]);
function allowReport(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "ADMIN") return next();
  if (req.user?.role === "MANAGER" && operational.has(String(req.params.report))) return next();
  return res.status(403).json({ message: "Forbidden" });
}
function allowAttendance(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === "ADMIN" || req.user?.role === "MANAGER") return next();
  return res.status(403).json({ message: "Forbidden" });
}
const router=Router(); router.use(requireAuth);
router.get('/employees/:employeeId/attendance/export.:format', allowAttendance, controller.exportEmployeeAttendance);
router.get('/employees/:employeeId/attendance', allowAttendance, controller.getEmployeeAttendance);
router.get('/:report/export.:format',allowReport,controller.exportReport); router.get('/:report',allowReport,controller.get); export default router;
