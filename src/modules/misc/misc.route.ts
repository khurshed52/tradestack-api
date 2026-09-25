import { Router } from "express";
import { getIpInfo } from "./misc.controller.js";

const miscRouter = Router();

miscRouter.get("/ip-info", getIpInfo);

export default miscRouter;