import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import { sendInvite, getMyInvites, acceptInvite, acceptInviteByToken, searchGithubUsers } from "../controllers/invite.controller.js";

const router = express.Router();

router.post("/send", protectRoute, sendInvite);
router.get("/search-users", protectRoute, searchGithubUsers);
router.get("/mine", protectRoute, getMyInvites);
router.post("/accept", protectRoute, acceptInvite);
router.get("/accept/:token", protectRoute, acceptInviteByToken);

export default router;
