import { Router } from "express";
import * as employeesController from "./employees.controller.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

const router = Router();

// ADMIN and MANAGER can view
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), employeesController.getEmployees);
router.get("/:id", requireAuth, requireRole("ADMIN", "MANAGER"), employeesController.getEmployeeById);
router.get("/:id/shift-assignments", requireAuth, requireRole("ADMIN", "MANAGER"), employeesController.getEmployeeShiftAssignments);

// Only ADMIN can create/update
router.post("/", requireAuth, requireRole("ADMIN"), employeesController.createEmployee);
router.patch("/:id", requireAuth, requireRole("ADMIN"), employeesController.updateEmployee);
router.patch("/:id/status", requireAuth, requireRole("ADMIN"), employeesController.updateEmployeeStatus);
router.delete("/:id", requireAuth, requireRole("ADMIN"), employeesController.deleteEmployee);
router.post("/:id/shift-assignments", requireAuth, requireRole("ADMIN"), employeesController.assignShift);

export default router;
