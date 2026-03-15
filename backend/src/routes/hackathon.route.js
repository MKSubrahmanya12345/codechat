import express from "express";
import { chatWithAi, compileAndPushRepo } from "../controllers/hackathon.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.post("/chat", protectRoute, chatWithAi);
router.post("/compile-and-push", protectRoute, compileAndPushRepo);

export default router;
