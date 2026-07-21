import type { NextFunction, Request, Response } from "express";
import { createSalarySchema, updateSalarySchema, updateSalaryStatusSchema } from "./salaries.schema.js";
import * as service from "./salaries.service.js";

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Salary operation failed";
  if (message.startsWith("Not Found:")) { res.status(404).json({ message: message.slice(11) }); return; }
  if (message.startsWith("Conflict:") || (typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23P01")) { res.status(409).json({ message: message.startsWith("Conflict:") ? message : "Salary effective dates overlap" }); return; }
  res.status(400).json({ message });
}

export async function listSalaries(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.json(await service.listSalaries(req.params.employeeId as string)); } catch (error) { if (error instanceof Error && error.message.startsWith("Not Found:")) sendError(res, error); else next(error); } }
export async function getCurrentSalary(req: Request, res: Response, next: NextFunction): Promise<void> { try { res.json(await service.getCurrentSalary(req.params.employeeId as string, req.query.date?.toString())); } catch (error) { if (error instanceof Error && error.message.startsWith("Not Found:")) sendError(res, error); else next(error); } }
export async function createSalary(req: Request, res: Response): Promise<void> { const parsed=createSalarySchema.safeParse(req.body); if(!parsed.success){res.status(400).json({message:"Validation failed",errors:parsed.error.issues});return;} try { res.status(201).json(await service.createSalary(req.params.employeeId as string, { ...parsed.data, monthly_salary: parsed.data.monthly_salary?.toFixed(2) ?? null, daily_rate: parsed.data.daily_rate?.toFixed(2) ?? null, hourly_rate: parsed.data.hourly_rate?.toFixed(2) ?? null })); } catch(error) { sendError(res,error); } }
export async function updateSalary(req: Request, res: Response): Promise<void> { const parsed=updateSalarySchema.safeParse(req.body); if(!parsed.success){res.status(400).json({message:"Validation failed",errors:parsed.error.issues});return;} try { const updated=await service.updateSalary(req.params.employeeId as string,req.params.salaryId as string,parsed.data); if(!updated){res.status(404).json({message:"Salary record not found"});return;}res.json(updated); }catch(error){sendError(res,error);} }
export async function updateSalaryStatus(req: Request, res: Response): Promise<void> { const parsed=updateSalaryStatusSchema.safeParse(req.body); if(!parsed.success){res.status(400).json({message:"Validation failed",errors:parsed.error.issues});return;} try { const updated=await service.updateSalaryStatus(req.params.employeeId as string,req.params.salaryId as string,parsed.data.active); if(!updated){res.status(404).json({message:"Salary record not found"});return;}res.json(updated); }catch(error){sendError(res,error);} }
