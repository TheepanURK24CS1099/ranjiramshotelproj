import type { NextFunction, Request, Response } from "express";

import * as service from "./attendance.service.js";
import { attendanceQuerySchema, attendanceRebuildSchema } from "./attendance.schema.js";

const IST_OFFSET_MS = 330 * 60_000;

function currentIstDate(): string {
  return new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export async function rebuildAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = attendanceRebuildSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ message: "Validation failed", errors: parsed.error.issues }); return; }
    res.json(await service.rebuildAttendanceForAllActiveEmployees(parsed.data.date));
  } catch (error) { next(error); }
}

export async function listAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = attendanceQuerySchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
      return;
    }

    const date = parsed.data.date ?? currentIstDate();
    const attendance = await service.getAttendance({
      date,
      employeeId: parsed.data.employeeId,
      shiftId: parsed.data.shiftId,
      status: parsed.data.status,
    });

    res.json(attendance);
  } catch (error) {
    next(error);
  }
}

export async function listAttendanceExceptions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = attendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ message: "Validation failed", errors: parsed.error.issues });
      return;
    }

    res.json(await service.getAttendanceExceptions(parsed.data.date ?? currentIstDate()));
  } catch (error) {
    next(error);
  }
}
