import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import {
    sendInvite,
    getMyInvites,
    getInviteByToken,
    acceptInvite,
    acceptInviteByToken,
    searchGithubUsers
} from "../controllers/invite.controller.js";

const router = express.Router();

router.post("/send", protectRoute, sendInvite);
router.get("/search-users", protectRoute, searchGithubUsers);
router.get("/mine", protectRoute, getMyInvites);

// Invite link flow
router.get("/token/:token", protectRoute, getInviteByToken);
router.get("/accept/:token", protectRoute, acceptInviteByToken);

// In-app invite accept
router.post("/accept", protectRoute, acceptInvite);

export default router;
