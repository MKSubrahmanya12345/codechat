import express from "express";
import { searchBridgeRepos, syncBridgeRepo } from "../controllers/bridge.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

// ??$$$ — Bridge Search API
router.get("/search", protectRoute, searchBridgeRepos);

// ??$$$ — Bridge Sync API
router.post("/sync", protectRoute, syncBridgeRepo);

export default router;
