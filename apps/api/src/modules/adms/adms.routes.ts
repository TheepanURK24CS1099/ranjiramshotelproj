import express,{Router} from "express";
import { env } from "../../config/environment.js";
import * as controller from "./adms.controller.js";
const router=Router();
router.use(express.text({type:()=>true,limit:env.ADMS_BODY_LIMIT}));
router.all("/cdata",controller.cdata);
router.all("/getrequest",controller.getrequest);
router.post("/devicecmd",controller.devicecmd);
export default router;
