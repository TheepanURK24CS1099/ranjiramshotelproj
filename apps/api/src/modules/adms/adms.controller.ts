import type { NextFunction,Request,Response } from "express";
import { AdmsDeviceError,receive } from "./adms.service.js";
function identity(req:Request):string|undefined{return String(req.query.SN??req.query.sn??req.query.device_code??req.header("x-device-code")??"")||undefined}
export async function cdata(req:Request,res:Response,next:NextFunction){try{const result=await receive(identity(req),typeof req.body==="string"?req.body:"",req.ip??null);res.type("text/plain").send(`OK: ${result.received}`)}catch(e){if(e instanceof AdmsDeviceError){res.status(e.statusCode).type("text/plain").send("ERROR");return}next(e)}}
export async function getrequest(req:Request,res:Response,next:NextFunction){try{await receive(identity(req),"",req.ip??null);res.type("text/plain").send("OK")}catch(e){if(e instanceof AdmsDeviceError){res.status(e.statusCode).type("text/plain").send("ERROR");return}next(e)}}
