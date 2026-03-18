import axios from "axios";
import path from "path";
import fs from "fs";
import simpleGit from "simple-git";
import { User } from "../models/user.model.js";

const DEFAULT_REPO_BASE_PATH = process.env.DEFAULT_REPO_BASE_PATH || "C:\\Users\\User\\Repo";

// ??$$$ — Build an authenticated git URL
const getAuthedRepoUrl = (token, owner, repoName) => {
    return `https://oauth2:${token}@github.com/${owner}/${repoName}.git`;
};

// ??$$$ — Files/dirs to ALWAYS exclude from the sync (security + cleanliness)
const EXCLUDED_PATTERNS = new Set([
    ".git", ".gitmodules", "node_modules", ".env", ".env.local",
    ".env.development", ".env.production", ".env.test", ".DS_Store",
    "Thumbs.db"
]);

const isExcluded = (name) => {
    if (EXCLUDED_PATTERNS.has(name)) return true;
    // Also exclude any .env.* variants dynamically
    if (/^\.env(\..+)?$/.test(name)) return true;
    return false;
};

// ??$$$ — Recursively delete a directory (works on all Node versions)
const removeDirSync = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    for (const entry of fs.readdirSync(dirPath)) {
        const full = path.join(dirPath, entry);
        if (fs.lstatSync(full).isDirectory()) {
            removeDirSync(full);
        } else {
            fs.unlinkSync(full);
        }
    }
    fs.rmdirSync(dirPath);
};

// ??$$$ — Recursively copy src → dest, skipping excluded patterns
//         Also skips hidden files starting with "." to avoid submodule artifacts
const copyDirSync = (src, dest) => {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
        // ??$$$ — Skip excluded files & hidden files (handles submodule references)
        if (isExcluded(entry) || entry.startsWith(".")) continue;
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        if (fs.lstatSync(srcPath).isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
};

// ??$$$ — Collect files in a directory (flat list, filtered)
const collectFiles = (dir, base = dir) => {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir)) {
        if (isExcluded(entry) || entry.startsWith(".")) continue;
        const full = path.join(dir, entry);
        const rel = path.relative(base, full);
        if (fs.lstatSync(full).isDirectory()) {
            results.push(...collectFiles(full, base));
        } else {
            results.push(rel);
        }
    }
    return results;
};

// ??$$$ — Split an array into N roughly-equal chunks
const chunkArray = (arr, n) => {
    const size = Math.ceil(arr.length / n);
    return Array.from({ length: n }, (_, i) => arr.slice(i * size, (i + 1) * size)).filter(c => c.length > 0);
};

// ??$$$ — Commit Smoothing: 4 staggered commits with backdated timestamps
//         This makes the repo look like rapid-fire dev work, not a paste job.
const COMMIT_PLAN = [
    { label: "chore: setup folder structure & config",    minutesAgo: 28 },
    { label: "feat: add boilerplate and dependencies",     minutesAgo: 20 },
    { label: "feat: initial UI and core components",       minutesAgo: 11 },
    { label: "feat: wire up backend routes and services",  minutesAgo: 2  },
];

const getBackdatedIso = (minutesAgo) => {
    const d = new Date(Date.now() - minutesAgo * 60 * 1000);
    return d.toISOString();
};

// =============================================
// ??$$$ — SEARCH: List user's GitHub repos
// =============================================
export const searchBridgeRepos = async (req, res) => {
    try {
        const { q } = req.query;
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) return res.status(401).json({ error: "No GitHub token" });

        let repos;
        if (q && q.trim()) {
            const response = await axios.get(
                `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}+user:${user.username}&per_page=10`,
                { headers: { Authorization: `Bearer ${user.githubToken}` } }
            );
            repos = response.data.items || [];
        } else {
            const response = await axios.get(
                `https://api.github.com/user/repos?sort=updated&per_page=20`,
                { headers: { Authorization: `Bearer ${user.githubToken}` } }
            );
            repos = response.data || [];
        }

        res.status(200).json(repos);
    } catch (error) {
        console.error("Bridge Search Error:", error.message);
        res.status(500).json({ error: "Failed to search repositories" });
    }
};

// =============================================
// ??$$$ — SYNC: The Bridge Full Flow
// =============================================
export const syncBridgeRepo = async (req, res) => {
    const tempBase = DEFAULT_REPO_BASE_PATH;
    const tempDir = path.join(tempBase, `__bridge_temp_${Date.now()}`);

    try {
        const { sideRepo, targetRepoName, targetDescription, targetVisibility } = req.body;
        const user = await User.findById(req.user._id);
        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;

        if (!sideRepo || !targetRepoName) {
            return res.status(400).json({ error: "Missing sideRepo or targetRepoName" });
        }

        const sideOwner = sideRepo.owner?.login || sideRepo.owner;
        const sideName = sideRepo.name;
        const isPrivateTarget = targetVisibility === "private";

        const githubHeaders = {
            Authorization: `Bearer ${user.githubToken}`,
            Accept: "application/vnd.github+json"
        };

        // ─── STEP 1: Create empty target repo on GitHub ──────────────────────────
        console.log(`[Bridge] Creating target repo: ${targetRepoName}`);
        const createRes = await axios.post("https://api.github.com/user/repos", {
            name: targetRepoName,
            description: targetDescription || `Synced from ${sideName} via The Bridge`,
            private: isPrivateTarget,
            auto_init: false  // ??$$$ — must be false to avoid commit conflict on push
        }, { headers: githubHeaders });

        const targetRepo = createRes.data;
        const targetOwner = targetRepo.owner.login;

        // ─── STEP 2: Ghost Sync — clone side repo into temp dir ──────────────────
        console.log(`[Bridge] Cloning side repo: ${sideOwner}/${sideName}`);
        if (!fs.existsSync(tempBase)) fs.mkdirSync(tempBase, { recursive: true });

        const sideUrl = getAuthedRepoUrl(user.githubToken, sideOwner, sideName);
        await simpleGit().clone(sideUrl, tempDir);

        // ─── STEP 3: The Wipe — delete .git + scrub .env / node_modules ──────────
        console.log(`[Bridge] Wiping .git and scrubbing sensitive files...`);
        removeDirSync(path.join(tempDir, ".git"));

        // ??$$$ — Also delete node_modules and .env files from the cloned source
        for (const dangerous of ["node_modules", ".env", ".env.local", ".env.development", ".env.production"]) {
            const target = path.join(tempDir, dangerous);
            if (fs.existsSync(target)) {
                if (fs.lstatSync(target).isDirectory()) {
                    removeDirSync(target);
                } else {
                    fs.unlinkSync(target);
                }
            }
        }

        // ─── STEP 4: Init fresh git + configure user ─────────────────────────────
        console.log(`[Bridge] Initialising fresh git history...`);
        const git = simpleGit(tempDir);
        await git.init();
        await git.addConfig("user.name",  user.username || "Bridge Bot");
        await git.addConfig("user.email", user.email    || "bridge@codechat.dev");

        // Add remote
        const targetUrl = getAuthedRepoUrl(user.githubToken, targetOwner, targetRepoName);
        await git.addRemote("origin", targetUrl);

        // ─── STEP 5: Commit Smoothing — 4 staggered backdated commits ────────────
        console.log(`[Bridge] Applying commit smoothing...`);
        const allFiles = collectFiles(tempDir);

        if (allFiles.length === 0) {
            // Fallback: just add everything if no files collected
            const iso = getBackdatedIso(2);
            await git.env({ GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso }).add(".");
            await git.env({ GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso }).commit("Initial Commit");
        } else {
            const numCommits = Math.min(COMMIT_PLAN.length, allFiles.length);
            const chunks = chunkArray(allFiles, numCommits);

            for (let i = 0; i < chunks.length; i++) {
                const plan = COMMIT_PLAN[i];
                const iso = getBackdatedIso(plan.minutesAgo);
                // Add only the files in this chunk
                await git.add(chunks[i]);
                await git
                    .env({ GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso })
                    .commit(plan.label);
                console.log(`  [Bridge] commit ${i + 1}/${chunks.length}: "${plan.label}" @ -${plan.minutesAgo}min`);
            }
        }

        // ─── STEP 6: Push (try main first, fallback master) ──────────────────────
        console.log(`[Bridge] Pushing to ${targetOwner}/${targetRepoName}...`);
        try {
            await git.push("origin", "main", ["--set-upstream"]);
        } catch {
            await git.push("origin", "master", ["--set-upstream"]);
        }

        // ─── STEP 7: Copy to local workspace ─────────────────────────────────────
        const localTargetDir = path.join(basePath, `${targetOwner}__${targetRepoName}`);
        if (!fs.existsSync(localTargetDir)) {
            copyDirSync(tempDir, localTargetDir);
        }

        res.status(200).json({
            message: `✅ Bridge Sync complete! "${targetRepoName}" is live on GitHub with ${Math.min(COMMIT_PLAN.length, 4)} staggered commits.`,
            repo: targetRepo
        });

    } catch (error) {
        console.error("[Bridge] Sync Error:", error?.response?.data || error.message);
        const detail = error?.response?.data?.message || error.message || "Unknown error";
        res.status(500).json({ error: "Bridge Sync Failed: " + detail });
    } finally {
        try { removeDirSync(tempDir); } catch (_) {}
    }
};
