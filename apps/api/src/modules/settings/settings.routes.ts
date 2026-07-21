import { Router } from "express";
import { getDatabasePool } from "../../infrastructure/database/database.js";
import { requireAuth, requireRole } from "../auth/auth.middleware.js";
const pool=getDatabasePool(); const router=Router();
router.get("/modules",requireAuth,requireRole("ADMIN","MANAGER"),async(_q,res,next)=>{try{res.json((await pool.query("SELECT payroll_enabled AS enabled,updated_at FROM module_settings WHERE module_name='payroll'")).rows[0]);}catch(e){next(e);}});
router.patch("/modules/payroll",requireAuth,requireRole("ADMIN"),async(req,res,next)=>{try{if(typeof req.body?.enabled!=="boolean"){res.status(400).json({message:"enabled must be boolean"});return;}res.json((await pool.query("UPDATE module_settings SET payroll_enabled=$1,updated_by=$2,updated_at=now() WHERE module_name='payroll' RETURNING payroll_enabled AS enabled,updated_at",[req.body.enabled,req.user!.id])).rows[0]);}catch(e){next(e);}});
export default router;
