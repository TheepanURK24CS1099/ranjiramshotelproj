import { Router } from "express";
import { z } from "zod";
import { getDatabasePool } from "../../infrastructure/database/database.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";

const router = Router();
const pool = getDatabasePool();
const schema = z.object({ holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u), name: z.string().min(1).max(150), description: z.string().max(1000).nullable().optional(), active: z.boolean().optional() });
const fail = (res: import("express").Response, error: unknown) => res.status(400).json({ message: error instanceof Error ? error.message : "Validation failed" });

router.get("/", requireAuth, requireRole("ADMIN", "MANAGER"), async (_req, res, next) => { try { res.json((await pool.query("SELECT h.id, h.holiday_date::text AS holiday_date, h.name, h.description, h.active, h.created_at, h.updated_at FROM holidays h ORDER BY h.holiday_date DESC")).rows); } catch (e) { next(e); } });
router.post("/", requireAuth, requireRole("ADMIN"), async (req, res) => { try { const v=schema.parse(req.body); res.status(201).json((await pool.query("INSERT INTO holidays(holiday_date,name,description,active) VALUES($1,$2,$3,$4) RETURNING *,holiday_date::text",[v.holiday_date,v.name,v.description??null,v.active??true])).rows[0]); } catch(e) { fail(res,e); } });
router.patch("/:id", requireAuth, requireRole("ADMIN"), async (req,res) => { try { const v=schema.partial().parse(req.body); const r=await pool.query("UPDATE holidays SET holiday_date=COALESCE($2,holiday_date),name=COALESCE($3,name),description=CASE WHEN $6 THEN $4 ELSE description END,active=COALESCE($5,active) WHERE id=$1 RETURNING *,holiday_date::text",[req.params.id,v.holiday_date??null,v.name??null,v.description??null,v.active??null,v.description!==undefined]); if(!r.rows[0]) res.status(404).json({message:"Holiday not found"}); else res.json(r.rows[0]); } catch(e) { fail(res,e); } });
router.patch("/:id/status", requireAuth, requireRole("ADMIN"), async (req,res) => { try { const active=z.object({active:z.boolean()}).parse(req.body).active; const r=await pool.query("UPDATE holidays SET active=$2 WHERE id=$1 RETURNING *,holiday_date::text",[req.params.id,active]); if(!r.rows[0]) res.status(404).json({message:"Holiday not found"}); else res.json(r.rows[0]); } catch(e) { fail(res,e); } });
router.delete("/:id", requireAuth, requireRole("ADMIN"), async (req,res,next) => { try { const used=await pool.query("SELECT 1 FROM daily_attendance_records WHERE holiday_id=$1 LIMIT 1",[req.params.id]); if(used.rowCount){res.status(409).json({message:"Cannot delete this holiday because historical attendance exists. Deactivate the holiday instead."});return;} const r=await pool.query("DELETE FROM holidays WHERE id=$1 RETURNING id",[req.params.id]); if(!r.rows[0])res.status(404).json({message:"Holiday not found"});else res.status(204).end(); }catch(e){next(e);} });
export default router;
