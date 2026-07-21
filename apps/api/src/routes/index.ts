import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import { getReady } from "../modules/health/health.controller.js";
import healthRoutes from "../modules/health/health.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import shiftsRoutes from "../modules/shifts/shifts.routes.js";
import employeesRoutes from "../modules/employees/employees.routes.js";
import devicesRoutes from "../modules/devices/devices.routes.js";
import attendanceRoutes from "../modules/attendance/attendance.routes.js";
import holidaysRoutes from "../modules/holidays/holidays.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/health", healthRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/shifts", shiftsRoutes);
router.use("/employees", employeesRoutes);
router.use("/devices", devicesRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/holidays", holidaysRoutes);
router.get("/ready", getReady);

export default router;
