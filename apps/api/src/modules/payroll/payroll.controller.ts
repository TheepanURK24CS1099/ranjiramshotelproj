import type { Request, Response } from "express";
import * as service from "./payroll.service.js";

function fail(res: Response, error: unknown): void { const message=error instanceof Error ? error.message : "Payroll operation failed"; const status=message.startsWith("Not Found:")?404:message.startsWith("Conflict:")?409:400; res.status(status).json({message:message.replace(/^(Not Found|Conflict|Validation): /u,"")}); }
export async function listPeriods(_req:Request,res:Response){try{res.json(await service.listPeriods());}catch(e){fail(res,e);}}
export async function getPeriod(req:Request,res:Response){try{res.json(await service.getPeriod(req.params.id as string));}catch(e){fail(res,e);}}
export async function createPeriod(req:Request,res:Response){try{res.status(201).json(await service.createPeriod(req.body,req.user!.id));}catch(e){fail(res,e);}}
export async function generate(req:Request,res:Response){try{res.json(await service.generate(req.params.id as string,req.user!.id));}catch(e){fail(res,e);}}
export async function recalculate(req:Request,res:Response){try{res.json(await service.recalculate(req.params.id as string,req.user!.id));}catch(e){fail(res,e);}}
export async function lock(req:Request,res:Response){try{res.json(await service.lock(req.params.id as string,req.user!.id));}catch(e){fail(res,e);}}
export async function cancel(req:Request,res:Response){try{res.json(await service.cancel(req.params.id as string,req.body?.cancellation_reason));}catch(e){fail(res,e);}}
export async function listRecords(req:Request,res:Response){try{res.json(await service.listRecords(req.params.id as string));}catch(e){fail(res,e);}}
export async function getRecord(req:Request,res:Response){try{res.json(await service.getRecord(req.params.recordId as string));}catch(e){fail(res,e);}}
export async function updateRecord(req:Request,res:Response){try{res.json(await service.updateRecord(req.params.recordId as string,req.body));}catch(e){fail(res,e);}}
export async function updateRecordStatus(req:Request,res:Response){try{res.json(await service.updateRecordStatus(req.params.recordId as string,req.body.status,req.user!.id,req.user!.role));}catch(e){fail(res,e);}}
export async function addDeduction(req:Request,res:Response){try{res.status(201).json(await service.addDeduction(req.params.recordId as string,req.body));}catch(e){fail(res,e);}}
export async function updateDeduction(req:Request,res:Response){try{res.json(await service.updateDeduction(req.params.recordId as string,req.params.deductionId as string,req.body));}catch(e){fail(res,e);}}
export async function deleteDeduction(req:Request,res:Response){try{await service.deleteDeduction(req.params.recordId as string,req.params.deductionId as string);res.status(204).end();}catch(e){fail(res,e);}}
export async function deleteDrafts(req:Request,res:Response){try{if(!Array.isArray(req.body?.ids)||!req.body.ids.length||req.body.ids.some((id:unknown)=>typeof id!=="string"))throw new Error("Validation: Select at least one draft payroll period");res.json(await service.deleteDrafts(req.body.ids));}catch(e){fail(res,e);}}
