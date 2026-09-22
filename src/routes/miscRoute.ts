import { Router } from "express";
import { getIpInfo } from "../controller/MiscController.js";

const miscRouter = Router();

miscRouter.get("/ip-info", getIpInfo);

export default miscRouter;