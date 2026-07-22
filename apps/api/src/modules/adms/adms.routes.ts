import express,{Router} from "express";
import type { NextFunction, Request, Response } from "express";
import { env } from "../../config/environment.js";
import * as controller from "./adms.controller.js";
const router=Router();
router.use(express.text({type:()=>true,limit:env.ADMS_BODY_LIMIT}));
router.all("/cdata",controller.cdata);
router.all("/getrequest",controller.getrequest);
router.post("/devicecmd",controller.devicecmd);
// Parser failures (including an oversized device payload) must remain ADMS text,
// never the application's JSON/HTML error format.
router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  void error;
  void next;
  res.status(400).type("text/plain").send("ERROR");
});
export default router;
