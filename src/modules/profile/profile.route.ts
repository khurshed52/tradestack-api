import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { getMyProfile } from "./profile.controller.js";

const router = Router();

router.get("/", authenticate, getMyProfile);

export default router;