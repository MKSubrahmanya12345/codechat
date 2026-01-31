import express from "express";
import { githubLogin, githubCallback, logout } from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/protectRoute.js";
import { checkAuth } from "../controllers/auth.controller.js";

const router = express.Router();

router.get("/github", githubLogin);
router.get("/github/callback", githubCallback);
router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth);

export default router;