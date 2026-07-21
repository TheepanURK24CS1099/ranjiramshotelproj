import type { Request, Response, NextFunction } from "express";
import * as shiftsService from "./shifts.service.js";
import { createShiftSchema, updateShiftSchema, updateShiftStatusSchema } from "./shifts.schema.js";

export async function getShifts(req: Request, res: Response, next: NextFunction) {
  try {
    const activeOnly = req.query.active !== undefined ? req.query.active === "true" : undefined;
    const shifts = await shiftsService.getShifts(activeOnly);
    res.json(shifts);
  } catch (error) {
    next(error);
  }
}

export async function getShiftById(req: Request, res: Response, next: NextFunction) {
  try {
    const shift = await shiftsService.getShiftById(req.params.id as string);
    if (!shift) {
      res.status(404).json({ message: "Shift not found" });
      return;
    }
    res.json(shift);
  } catch (error) {
    next(error);
  }
}

export async function createShift(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = createShiftSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const shift = await shiftsService.createShift(validationResult.data);
    res.status(201).json(shift);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Conflict:")) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
}

export async function updateShift(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = updateShiftSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const shift = await shiftsService.updateShift(req.params.id as string, validationResult.data as unknown as Parameters<typeof shiftsService.updateShift>[1]);
    if (!shift) {
      res.status(404).json({ message: "Shift not found" });
      return;
    }
    res.json(shift);
  } catch (error: unknown) {
    if (error instanceof Error && error.message.startsWith("Conflict:")) {
      res.status(409).json({ message: error.message });
      return;
    }
    next(error);
  }
}

export async function updateShiftStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const validationResult = updateShiftStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ message: "Validation failed", errors: validationResult.error.issues });
      return;
    }

    const shift = await shiftsService.updateShiftStatus(req.params.id as string, validationResult.data.active);
    if (!shift) {
      res.status(404).json({ message: "Shift not found" });
      return;
    }
    res.json(shift);
  } catch (error) {
    next(error);
  }
}
export async function deleteShift(req: Request,res:Response,next:NextFunction) { try { const deleted=await shiftsService.deleteShiftIfUnused(req.params.id as string); if(!deleted){res.status(404).json({message:"Shift not found"});return;}res.status(204).end(); }catch(error){if(error instanceof Error&&error.message.startsWith("Cannot delete")){res.status(409).json({message:error.message});return;}next(error);} }
