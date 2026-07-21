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
function ids(value:unknown): string[] { if(!Array.isArray(value)||!value.length||value.some((id)=>typeof id!=="string"))throw new Error("Validation: Select at least one record"); return value; }
export async function deleteAttendance(req:Request,res:Response,next:NextFunction){try{res.json(await service.deleteAttendance(ids(req.body?.ids)));}catch(e){if(e instanceof Error&&e.message.startsWith("Conflict:")){res.status(409).json({message:e.message.slice(10)});return;}next(e);}}
export async function clearAttendanceDate(req:Request,res:Response,next:NextFunction){try{res.json(await service.clearAttendanceDate(String(req.body?.date??"")));}catch(e){next(e);}}
export async function resolveExceptions(req:Request,res:Response,next:NextFunction){try{const raw=req.body?.ids;if(!Array.isArray(raw)||raw.some((id)=>!Number.isInteger(id)))throw new Error("Validation: Select at least one exception");res.json(await service.resolveExceptions(raw,req.user!.id,req.body?.resolution_notes));}catch(e){next(e);}}
export async function deleteExceptions(req:Request,res:Response,next:NextFunction){try{const raw=req.body?.ids;if(!Array.isArray(raw)||raw.some((id)=>!Number.isInteger(id)))throw new Error("Validation: Select at least one exception");res.json(await service.deleteSafeExceptions(raw));}catch(e){next(e);}}
