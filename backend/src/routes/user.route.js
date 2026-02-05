import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import { setRepoBasePath } from "../controllers/user.controller.js";

const router = express.Router();

router.post("/repo-path", protectRoute, setRepoBasePath);

export default router;
