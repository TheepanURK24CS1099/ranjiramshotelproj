import { Router } from "express";
import * as shiftsController from "./shifts.controller.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

const router = Router();

// ADMIN and MANAGER can view
router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), shiftsController.getShifts);
router.get("/:id", requireAuth, requireRole("ADMIN", "MANAGER"), shiftsController.getShiftById);

router.patch("/bulk-status", requireAuth, requireRole("ADMIN"), shiftsController.bulkStatus);
router.delete("/bulk-unused", requireAuth, requireRole("ADMIN"), shiftsController.bulkDeleteUnused);

// Only ADMIN can create/update
router.post("/", requireAuth, requireRole("ADMIN"), shiftsController.createShift);
router.patch("/:id", requireAuth, requireRole("ADMIN"), shiftsController.updateShift);
router.patch("/:id/status", requireAuth, requireRole("ADMIN"), shiftsController.updateShiftStatus);
router.delete("/:id", requireAuth, requireRole("ADMIN"), shiftsController.deleteShift);

export default router;
