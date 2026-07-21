import { Router } from "express";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
import * as controller from "./salaries.controller.js";

const router = Router({ mergeParams: true });
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), controller.listSalaries);
router.get("/current", requireAuth, requireRole("ADMIN", "MANAGER"), controller.getCurrentSalary);
router.post("/", requireAuth, requireRole("ADMIN", "MANAGER"), controller.createSalary);
router.patch("/:salaryId", requireAuth, requireRole("ADMIN", "MANAGER"), controller.updateSalary);
router.patch("/:salaryId/status", requireAuth, requireRole("ADMIN", "MANAGER"), controller.updateSalaryStatus);
export default router;
