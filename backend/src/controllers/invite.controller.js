import { User } from "../models/user.model.js";
import { Invite } from "../models/invite.model.js";

// 1. Send an Invite
export const sendInvite = async (req, res) => {
    try {
        const { receiverUsername, repoId, repoName, repoOwner } = req.body;
        const sender = req.user.username;

        const receiver = await User.findOne({ username: receiverUsername });
        if (!receiver) return res.status(404).json({ error: "User not found" });

        if (receiver.username === sender) return res.status(400).json({ error: "Cannot invite yourself" });

        const exists = await Invite.findOne({ sender, receiver: receiverUsername, repoId, status: "pending" });
        if (exists) return res.status(400).json({ error: "Invite already pending" });

        await Invite.create({ sender, receiver: receiverUsername, repoId, repoName, repoOwner });

        res.status(200).json({ message: "Invite sent!" });
    } catch (error) {
        res.status(500).json({ error: "Failed to send invite" });
    }
};

// 2. Get My Invites
export const getMyInvites = async (req, res) => {
    try {
        const invites = await Invite.find({ receiver: req.user.username, status: "pending" });
        res.status(200).json(invites);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch invites" });
    }
};

// 3. Accept Invite
export const acceptInvite = async (req, res) => {
    try {
        const { inviteId } = req.body;
        const invite = await Invite.findById(inviteId);
        if (!invite) return res.status(404).json({ error: "Invite not found" });

        // Add to User's Shared Repos
        await User.findByIdAndUpdate(req.user._id, {
            $addToSet: { 
                sharedRepos: { 
                    repoId: invite.repoId, 
                    name: invite.repoName, 
                    owner: invite.repoOwner,
                    description: "Shared with you" 
                } 
            }
        });

        // Delete Invite
        await Invite.findByIdAndDelete(inviteId);

        res.status(200).json({ message: "Invite accepted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to accept invite" });
    }
};