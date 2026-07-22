import type { NextFunction,Request,Response } from "express";
import { logger } from "../../config/logger.js";
import { AdmsDeviceError,receive } from "./adms.service.js";
function identity(req:Request):string|undefined{return String(req.query.SN??req.query.sn??req.query.device_code??req.header("x-device-code")??"")||undefined}
function fail(error:unknown, req:Request, res:Response, next:NextFunction){if(error instanceof AdmsDeviceError){res.status(error.statusCode).type("text/plain").send("ERROR");return;}logger.error({err:error,ip:req.ip},"ADMS request failed");res.status(500).type("text/plain").send("ERROR");void next;}
export async function cdata(req:Request,res:Response,next:NextFunction){try{const result=await receive(identity(req),typeof req.body==="string"?req.body:"",req.ip??null);res.type("text/plain").send(`OK: ${result.received}`)}catch(e){fail(e,req,res,next)}}
export async function getrequest(req:Request,res:Response,next:NextFunction){try{await receive(identity(req),"",req.ip??null);res.type("text/plain").send("OK")}catch(e){fail(e,req,res,next)}}
export async function devicecmd(req:Request,res:Response,next:NextFunction){try{await receive(identity(req),"",req.ip??null);res.type("text/plain").send("OK")}catch(e){fail(e,req,res,next)}}
