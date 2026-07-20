import type { NextFunction, Request, Response } from "express";
import * as service from "./devices.service.js";
import { createDeviceSchema, recentPunchesQuerySchema, updateDeviceSchema } from "./devices.schema.js";

const invalid = (res: Response, error: unknown) => res.status(400).json({ message: "Validation failed", errors: error });
const conflict = (error: unknown, res: Response, next: NextFunction) => error instanceof Error && error.message.startsWith("Conflict:") ? res.status(409).json({ message: error.message }) : next(error);
export async function list(_req: Request,res: Response,next: NextFunction){try{res.json(await service.list());}catch(e){next(e)}}
export async function get(req: Request,res: Response,next: NextFunction){try{const d=await service.get(String(req.params.id));if(!d){res.status(404).json({message:"Device not found"});return}res.json(d)}catch(e){next(e)}}
export async function create(req: Request,res: Response,next: NextFunction){const v=createDeviceSchema.safeParse(req.body);if(!v.success){invalid(res,v.error.issues);return}try{res.status(201).json(await service.create(v.data))}catch(e){conflict(e,res,next)}}
export async function update(req: Request,res: Response,next: NextFunction){const v=updateDeviceSchema.safeParse(req.body);if(!v.success){invalid(res,v.error.issues);return}try{const d=await service.update(String(req.params.id),v.data);if(!d){res.status(404).json({message:"Device not found"});return}res.json(d)}catch(e){conflict(e,res,next)}}
export async function activate(req: Request,res: Response,next: NextFunction){try{const d=await service.setActive(String(req.params.id),true);if(!d){res.status(404).json({message:"Device not found"});return}res.json(d)}catch(e){next(e)}}
export async function deactivate(req: Request,res: Response,next: NextFunction){try{const d=await service.setActive(String(req.params.id),false);if(!d){res.status(404).json({message:"Device not found"});return}res.json(d)}catch(e){next(e)}}
export async function recent(req: Request,res: Response,next: NextFunction){const v=recentPunchesQuerySchema.safeParse(req.query);if(!v.success){invalid(res,v.error.issues);return}try{const rows=await service.recentPunches(String(req.params.id),v.data.limit);if(!rows){res.status(404).json({message:"Device not found"});return}res.json(rows)}catch(e){next(e)}}
