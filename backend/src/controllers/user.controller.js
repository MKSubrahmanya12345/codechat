import { User } from "../models/user.model.js";

export const setRepoBasePath = async (req, res) => {
    try {
        const { repoBasePath } = req.body;
        if (!repoBasePath) return res.status(400).json({ error: "repoBasePath is required" });

        const updated = await User.findByIdAndUpdate(
            req.user._id,
            { repoBasePath },
            { new: true }
        );

        res.status(200).json({ repoBasePath: updated.repoBasePath });
    } catch (error) {
        res.status(500).json({ error: "Failed to save repo path" });
    }
};
