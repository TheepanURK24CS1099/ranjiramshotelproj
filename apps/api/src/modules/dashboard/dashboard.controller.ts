import type { Request, Response, NextFunction } from "express";
import * as dashboardService from "./dashboard.service.js";

export async function getDashboardSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await dashboardService.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    next(error);
  }
}
