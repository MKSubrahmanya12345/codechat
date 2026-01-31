import axios from "axios";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";

export const getRepos = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) return res.status(401).json({ error: "No Token" });

        // 1. Fetch GitHub Repos
        const githubRes = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=10", {
            headers: { Authorization: `Bearer ${user.githubToken}` }
        });

        // 2. Get Shared Repos (from DB)
        const sharedRepos = user.sharedRepos || [];

        // 3. Combine them
        // We add a flag 'isShared' to style them differently if we want
        const combined = [
            ...githubRes.data, 
            ...sharedRepos.map(r => ({ ...r, id: r.repoId, isShared: true }))
        ];

        res.status(200).json(combined);
    } catch (error) {
        console.error("Repo Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch repos" });
    }
};


export const getRepoMessages = async (req, res) => {
    try {
        const { repoId } = req.params;
        const messages = await Message.find({ repoId }).sort({ createdAt: 1 }).limit(50);
        res.status(200).json(messages);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch messages" });
    }
};


export const getRepoFiles = async (req, res) => {
    try {
        const { repoName, owner, path = "" } = req.query; // Expects ?repoName=x&owner=y&path=z
        const user = await User.findById(req.user._id);

        // GitHub API to get content of a path
        const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

        const fileRes = await axios.get(url, {
            headers: { 
                Authorization: `Bearer ${user.githubToken}`,
                Accept: "application/vnd.github.v3+json"
            }
        });

        // Filter and Format for UI
        const files = fileRes.data.map(file => ({
            name: file.name,
            type: file.type, // 'file' or 'dir'
            path: file.path,
            download_url: file.download_url
        }));

        // Sort: Folders first, then files
        files.sort((a, b) => (a.type === b.type ? 0 : a.type === "dir" ? -1 : 1));

        res.status(200).json(files);
    } catch (error) {
        console.error("File Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch files" });
    }
};

export const getFileContent = async (req, res) => {
    try {
        const { repoName, owner, path } = req.query;
        const user = await User.findById(req.user._id);

        // GitHub API to get file content
        const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`;

        const response = await axios.get(url, {
            headers: { 
                Authorization: `Bearer ${user.githubToken}`,
                Accept: "application/vnd.github.v3+json"
            }
        });

        // GitHub returns content in Base64
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');

        res.status(200).json({ content });
    } catch (error) {
        console.error("Content Fetch Error:", error.message);
        res.status(500).json({ error: "Failed to fetch content" });
    }
};