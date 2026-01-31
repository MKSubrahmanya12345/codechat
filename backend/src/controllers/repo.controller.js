import axios from "axios";
import { User } from "../models/user.model.js";

export const getRepos = async (req, res) => {
    try {
        // req.user comes from the protectRoute middleware
        // We need to fetch the full user again to get the githubToken (if not in session)
        const user = await User.findById(req.user._id);

        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token found" });
        }

        const repoRes = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=10", {
            headers: { 
                Authorization: `Bearer ${user.githubToken}`,
                Accept: "application/vnd.github.v3+json"
            }
        });

        res.status(200).json(repoRes.data);

    } catch (error) {
        console.error("Repo Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch repos" });
    }
};