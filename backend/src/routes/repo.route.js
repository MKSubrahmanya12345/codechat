import express from "express";
import { getRepos, getRepoMessages, getRepoFiles, getFileContent } from "../controllers/repo.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/", protectRoute, getRepos);

router.get("/:repoId/messages", protectRoute, getRepoMessages);
router.get("/files", protectRoute, getRepoFiles);
router.get("/content", protectRoute, getFileContent);

export default router;