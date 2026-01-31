import express from "express";
import { protectRoute } from "../middleware/protectRoute.js";
import { sendInvite, getMyInvites, acceptInvite } from "../controllers/invite.controller.js";

const router = express.Router();

router.post("/send", protectRoute, sendInvite);
router.get("/mine", protectRoute, getMyInvites);
router.post("/accept", protectRoute, acceptInvite);

export default router;