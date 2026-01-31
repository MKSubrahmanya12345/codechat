import express from "express";
import { getRepos } from "../controllers/repo.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";

const router = express.Router();

router.get("/", protectRoute, getRepos);

export default router;