import express from "express";
import { pipelineChat, generateTasks, getSessions, createSession, updateSession, deleteSession, generateSkeleton, generateFunction } from "../controllers/pipeline.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.post("/chat", protectRoute, pipelineChat);
router.post("/build", protectRoute, generateTasks);
router.post("/generate-skeleton", protectRoute, generateSkeleton);
router.post("/generate-function", protectRoute, generateFunction);

router.get("/sessions/:repoName", protectRoute, getSessions);
router.post("/sessions", protectRoute, createSession);
router.put("/sessions/:id", protectRoute, updateSession);
router.delete("/sessions/:id", protectRoute, deleteSession);

export default router;
