import axios from "axios";
import path from "path";
import fs from "fs";
import simpleGit from "simple-git";
import { User } from "../models/user.model.js";
import { Message } from "../models/message.model.js";

const DEFAULT_REPO_BASE_PATH = process.env.DEFAULT_REPO_BASE_PATH || "C:\\Users\\User\\Repo";

const getRepoDir = (basePath, owner, repoName) => {
    const safeOwner = owner.replace(/[^a-zA-Z0-9-_]/g, "");
    const safeRepo = repoName.replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(basePath, `${safeOwner}__${safeRepo}`);
};

const getAuthedRepoUrl = (token, owner, repoName) => {
    return `https://oauth2:${token}@github.com/${owner}/${repoName}.git`;
};

export const getRepos = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) return res.status(401).json({ error: "No Token" });

        // 1. Fetch GitHub Repos (best-effort)
        let githubRepos = [];
        try {
            const githubRes = await axios.get("https://api.github.com/user/repos?sort=updated&per_page=10", {
                headers: { Authorization: `Bearer ${user.githubToken}` }
            });
            githubRepos = githubRes.data || [];
        } catch (e) {
            // If GitHub call fails (bad scope, rate limit, etc), still return shared repos.
            console.error("GitHub repo list failed:", e?.response?.data || e?.message);
            githubRepos = [];
        }

        // 2. Get Shared Repos (from DB)
        const sharedReposRaw = user.sharedRepos || [];

        // Deduplicate by repoId (fixes double-invite / double-accept issues)
        const sharedById = new Map();
        for (const r of sharedReposRaw) {
            const rid = r?.repoId ? String(r.repoId) : null;
            if (!rid) continue;
            sharedById.set(rid, r);
        }
        const sharedRepos = Array.from(sharedById.values());

        // Also avoid duplicates if the repo already appears in the user's normal GitHub repos.
        const githubIds = new Set((githubRepos || []).map(r => (r?.id !== undefined ? String(r.id) : "")));
        const sharedFiltered = sharedRepos.filter(r => {
            const rid = r?.repoId ? String(r.repoId) : "";
            return rid && !githubIds.has(rid);
        });

        // 3. Combine them
        // We add a flag 'isShared' to style them differently if we want
        const combined = [
            ...githubRepos,
            ...sharedFiltered.map(r => ({ 
                ...r,
                id: String(r.repoId),
                name: r.name || "(shared repo)",
                owner: r.owner || "unknown",
                isShared: true 
            }))
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

export const setRepoPath = async (req, res) => {
    try {
        const { repoBasePath } = req.body;
        if (!repoBasePath) return res.status(400).json({ error: "repoBasePath is required" });
        const user = await User.findByIdAndUpdate(req.user._id, { repoBasePath }, { new: true });
        res.status(200).json({ repoBasePath: user.repoBasePath });
    } catch (error) {
        res.status(500).json({ error: "Failed to set repo path" });
    }
};

export const pullRepo = async (req, res) => {
    try {
        const { owner, repoName } = req.body;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        if (!owner || !repoName) return res.status(400).json({ error: "Missing repo info" });

        if (!fs.existsSync(basePath)) {
            fs.mkdirSync(basePath, { recursive: true });
        }

        const repoDir = getRepoDir(basePath, owner, repoName);
        const git = simpleGit();

        if (!fs.existsSync(repoDir)) {
            const url = getAuthedRepoUrl(user.githubToken, owner, repoName);
            await git.clone(url, repoDir);
            return res.status(200).json({ message: "Repo cloned", repoDir });
        }

        const repoGit = simpleGit(repoDir);
        await repoGit.pull();
        res.status(200).json({ message: "Repo pulled", repoDir });
    } catch (error) {
        res.status(500).json({ error: "Failed to pull repo" });
    }
};

export const pushRepo = async (req, res) => {
    try {
        const { owner, repoName, commitMessage } = req.body;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        if (!owner || !repoName) return res.status(400).json({ error: "Missing repo info" });

        const repoDir = getRepoDir(basePath, owner, repoName);
        if (!fs.existsSync(repoDir)) return res.status(404).json({ error: "Repo not found locally" });

        const repoGit = simpleGit(repoDir);
        const status = await repoGit.status();
        const isClean = status.isClean();
        const hasAheadCommits = typeof status.ahead === "number" && status.ahead > 0;

        if (isClean && !hasAheadCommits) {
            return res.status(200).json({ message: "Nothing to push" });
        }

        if (!isClean && commitMessage && commitMessage.trim()) {
            await repoGit.add("./*");
            await repoGit.commit(commitMessage.trim());
        }

        const url = getAuthedRepoUrl(user.githubToken, owner, repoName);
        await repoGit.remote(["set-url", "origin", url]);
        await repoGit.push();
        res.status(200).json({ message: "Repo pushed" });
    } catch (error) {
        console.error("Push Repo Error:", error);
        res.status(500).json({ error: "Failed to push repo", details: error?.message || String(error) });
    }
};

export const getLocalFilePath = async (req, res) => {
    try {
        const { owner, repoName, filePath } = req.query;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        if (!owner || !repoName || !filePath) return res.status(400).json({ error: "Missing file info" });

        const repoDir = getRepoDir(basePath, owner, repoName);
        const fullPath = path.normalize(path.join(repoDir, filePath));
        if (!fullPath.startsWith(repoDir)) return res.status(400).json({ error: "Invalid path" });
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found" });

        res.status(200).json({ path: fullPath });
    } catch (error) {
        res.status(500).json({ error: "Failed to resolve local file path" });
    }
};

export const getLocalFileContent = async (req, res) => {
    try {
        const { owner, repoName, filePath } = req.query;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        if (!owner || !repoName || !filePath) return res.status(400).json({ error: "Missing file info" });

        const repoDir = getRepoDir(basePath, owner, repoName);
        const fullPath = path.normalize(path.join(repoDir, filePath));
        if (!fullPath.startsWith(repoDir)) return res.status(400).json({ error: "Invalid path" });
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found locally. Pull repo first." });

        const content = fs.readFileSync(fullPath, "utf-8");
        res.status(200).json({ content });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch local file content" });
    }
};

export const updateLocalFileContent = async (req, res) => {
    try {
        const { owner, repoName, filePath, content } = req.body;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        if (!owner || !repoName || !filePath) return res.status(400).json({ error: "Missing file info" });
        if (typeof content !== "string") return res.status(400).json({ error: "Content must be a string" });

        const repoDir = getRepoDir(basePath, owner, repoName);
        const fullPath = path.normalize(path.join(repoDir, filePath));
        if (!fullPath.startsWith(repoDir)) return res.status(400).json({ error: "Invalid path" });
        if (!fs.existsSync(fullPath)) return res.status(404).json({ error: "File not found locally. Pull repo first." });

        fs.writeFileSync(fullPath, content, "utf-8");
        res.status(200).json({ message: "File saved" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save local file content" });
    }
};
export const getCodeAnchor = async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: "URL is required" });

        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/blob\/([^\/]+)\/(.+?)#L(\d+)(?:-L(\d+))?/);
        if (!match) return res.status(400).json({ error: "Invalid GitHub blob URL" });

        const [, owner, repoName, branch, filePath, startRaw, endRaw] = match;
        const startLine = parseInt(startRaw, 10);
        const endLine = parseInt(endRaw || startRaw, 10);

        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) return res.status(401).json({ error: "No Token" });

        const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${filePath}`;
        const response = await axios.get(apiUrl, {
            headers: {
                Authorization: `Bearer ${user.githubToken}`,
                Accept: "application/vnd.github.v3+json"
            },
            params: { ref: branch }
        });

        const content = Buffer.from(response.data.content, "base64").toString("utf-8");
        const lines = content.split("\n");
        const snippet = lines.slice(startLine - 1, endLine).join("\n");

        const filename = path.basename(filePath);
        const ext = path.extname(filePath).replace(".", "").toLowerCase();

        res.status(200).json({
            filename,
            language: ext || "text",
            startLine,
            endLine,
            code: snippet
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch code anchor" });
    }
};

const pickDefined = (obj) => {
    return Object.fromEntries(
        Object.entries(obj).filter(([, v]) => v !== undefined)
    );
};

export const createRepo = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token. Please login again." });
        }

        const {
            ownerType = "user", // 'user' | 'org'
            org,
            name,
            description,
            homepage,
            visibility = "public", // 'public' | 'private' | 'internal'

            // init / templates
            auto_init,
            gitignore_template,
            license_template,
            is_template,

            // common toggles
            has_issues,
            has_projects,
            has_wiki,
            has_discussions,

            // merge settings
            allow_squash_merge,
            allow_merge_commit,
            allow_rebase_merge,
            delete_branch_on_merge,

            // Optional: create repo from template repo
            template_owner,
            template_repo,
            include_all_branches
        } = req.body || {};

        const repoName = String(name || "").trim();
        if (!repoName) return res.status(400).json({ error: "Repository name is required" });
        if (repoName.length > 100) return res.status(400).json({ error: "Repository name is too long (max 100 chars)" });
        if (!/^[A-Za-z0-9_.-]+$/.test(repoName)) {
            return res.status(400).json({
                error: "Invalid repository name. Use letters, numbers, '.', '_' or '-' (no spaces)."
            });
        }

        if (ownerType === "org" && !String(org || "").trim()) {
            return res.status(400).json({ error: "org is required when ownerType is 'org'" });
        }

        if (ownerType !== "user" && ownerType !== "org") {
            return res.status(400).json({ error: "ownerType must be 'user' or 'org'" });
        }

        if (visibility === "internal" && ownerType !== "org") {
            return res.status(400).json({ error: "'internal' visibility is only valid for organization repositories" });
        }

        const desiredPrivate = visibility === "private" || visibility === "internal";
        const githubHeaders = {
            Authorization: `Bearer ${user.githubToken}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28"
        };

        // -------------------------------
        // Template-based repo creation
        // -------------------------------
        if (template_owner && template_repo) {
            const targetOwner = ownerType === "org" ? String(org).trim() : user.username;
            const url = `https://api.github.com/repos/${template_owner}/${template_repo}/generate`;

            const payload = pickDefined({
                owner: targetOwner,
                name: repoName,
                description,
                private: desiredPrivate,
                include_all_branches: include_all_branches === true
            });

            const response = await axios.post(url, payload, { headers: githubHeaders });
            return res.status(201).json({ repo: response.data });
        }

        // -------------------------------
        // Normal repo creation
        // -------------------------------
        const url = ownerType === "org"
            ? `https://api.github.com/orgs/${String(org).trim()}/repos`
            : "https://api.github.com/user/repos";

        // GitHub only applies license/gitignore when the repo is initialized.
        const shouldAutoInit = auto_init === true || Boolean(gitignore_template) || Boolean(license_template);

        const payload = pickDefined({
            name: repoName,
            description,
            homepage,
            private: desiredPrivate,

            ...(ownerType === "org" ? { visibility } : {}),

            auto_init: shouldAutoInit,
            gitignore_template,
            license_template,
            is_template,

            has_issues,
            has_projects,
            has_wiki,
            has_discussions,

            allow_squash_merge,
            allow_merge_commit,
            allow_rebase_merge,
            delete_branch_on_merge
        });

        const response = await axios.post(url, payload, { headers: githubHeaders });
        return res.status(201).json({ repo: response.data });

    } catch (error) {
        const status = error?.response?.status || 500;
        const gh = error?.response?.data;

        // Normalize GitHub error payloads for the UI
        return res.status(status).json({
            error: gh?.message || "Failed to create repository",
            details: gh?.errors || undefined
        });
    }
};
