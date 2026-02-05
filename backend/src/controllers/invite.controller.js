import axios from "axios";
import crypto from "crypto";
import { User } from "../models/user.model.js";
import { Invite } from "../models/invite.model.js";

const getClientUrl = () => process.env.CLIENT_URL || "http://localhost:5173";

// 1. Send an Invite
export const sendInvite = async (req, res) => {
    try {
        const { receiverUsername, repoId, repoName, repoOwner } = req.body;
        const sender = req.user.username;

        if (!receiverUsername || !repoId || !repoName || !repoOwner) {
            return res.status(400).json({ error: "Missing invite data" });
        }

        if (receiverUsername === sender) return res.status(400).json({ error: "Cannot invite yourself" });

        // Validate GitHub username exists
        try {
            await axios.get(`https://api.github.com/users/${receiverUsername}`, {
                headers: { Authorization: `Bearer ${req.user.githubToken}` }
            });
        } catch (e) {
            return res.status(404).json({ error: "GitHub user not found" });
        }

        let receiver = await User.findOne({ username: receiverUsername });
        if (!receiver) {
            receiver = await User.create({ username: receiverUsername, status: "shadow" });
        }

        const exists = await Invite.findOne({ sender, receiver: receiverUsername, repoId, status: "pending" });
        if (exists) return res.status(400).json({ error: "Invite already pending" });

        const inviteToken = crypto.randomBytes(24).toString("hex");
        const invite = await Invite.create({ sender, receiver: receiverUsername, repoId, repoName, repoOwner, inviteToken });

        const inviteLink = `${getClientUrl()}/invite/${invite.inviteToken}`;

        res.status(200).json({ message: "Invite sent!", inviteLink, inviteToken: invite.inviteToken });
    } catch (error) {
        res.status(500).json({ error: "Failed to send invite" });
    }
};

// 1.5 Search GitHub Users
export const searchGithubUsers = async (req, res) => {
    try {
        const q = (req.query.q || "").trim();
        if (!q) return res.status(200).json([]);

        const ghRes = await axios.get(`https://api.github.com/search/users?q=${encodeURIComponent(q)}&per_page=10`, {
            headers: { Authorization: `Bearer ${req.user.githubToken}` }
        });

        const users = ghRes.data.items.map(u => ({
            login: u.login,
            id: u.id,
            avatar_url: u.avatar_url
        }));

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ error: "Failed to search users" });
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

        if (invite.receiver !== req.user.username) {
            return res.status(403).json({ error: "Not authorized to accept this invite" });
        }

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

// 4. Accept Invite by Token
export const acceptInviteByToken = async (req, res) => {
    try {
        const { token } = req.params;
        const invite = await Invite.findOne({ inviteToken: token });
        if (!invite) return res.status(404).json({ error: "Invite not found" });

        if (invite.receiver !== req.user.username) {
            return res.status(403).json({ error: "Not authorized to accept this invite" });
        }

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

        await Invite.findByIdAndDelete(invite._id);

        res.status(200).json({ message: "Invite accepted" });
    } catch (error) {
        res.status(500).json({ error: "Failed to accept invite" });
    }
};
