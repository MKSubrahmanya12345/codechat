import express from "express";
import { 
    chatWithAi, 
    compileAndPushRepo, 
    getScorecard, 
    generateCodeMe,
    saveIdeationSession,
    getIdeationSession,
    clearIdeationSession,
    draftFileCode,
    generateUiPreview,
    detectConflicts
} from "../controllers/hackathon.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.post("/chat", protectRoute, chatWithAi);
router.post("/compile-and-push", protectRoute, compileAndPushRepo);
router.post("/scorecard", protectRoute, getScorecard);
router.post("/generate-codeme", protectRoute, generateCodeMe);
router.post("/draft-file", protectRoute, draftFileCode);
router.post("/generate-ui-preview", protectRoute, generateUiPreview);

// ??$$$ — Session management
router.post("/session", protectRoute, saveIdeationSession);
router.get("/session/:repoName", protectRoute, getIdeationSession);
router.delete("/session/:repoName", protectRoute, clearIdeationSession);

// ??$$$ — Conflict detection for collaborative ideation
router.post("/detect-conflicts", protectRoute, detectConflicts);

export default router;

