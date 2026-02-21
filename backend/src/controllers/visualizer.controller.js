import fs from "fs";
import path from "path";
import axios from "axios"; // ðŸ‘ˆ ADDED
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { User } from "../models/user.model.js"; // ðŸ‘ˆ ADDED

const DEFAULT_REPO_BASE_PATH = process.env.DEFAULT_REPO_BASE_PATH || "C:\\Users\\User\\Repo";

const getRepoDir = (basePath, owner, repoName) => {
    const safeOwner = owner.replace(/[^a-zA-Z0-9-_]/g, "");
    const safeRepo = repoName.replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(basePath, `${safeOwner}__${safeRepo}`);
};

const traverseFn = traverse?.default || traverse;

// --- HELPER FOR GITHUB GRAPH ---
const createNode = (id, label, type) => {
    const styles = {
        file: '#10b981',
        function: '#3b82f6',
        call: '#a855f7'
    };
    return {
        id,
        type: 'default',
        data: { label },
        position: { x: 0, y: 0 },
        style: {
            background: styles[type] || '#a855f7',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)',
            width: 200,
            fontSize: '12px'
        }
    };
};

// ==========================================
// 1. GITHUB FILE DEPENDENCY VISUALIZER
// ==========================================
export const getDependencyGraph = async (req, res) => {
    try {
        // ðŸ‘‡ FIX: Accept 'repo' OR 'repoName'
        let { owner, repo, repoName, path: filePath } = req.query;
        const targetRepo = repo || repoName; 

        const user = await User.findById(req.user._id);

        if (!user || !owner || !targetRepo || !filePath) {
            console.log("Missing Params:", { owner, targetRepo, filePath });
            return res.status(400).json({ error: "Missing parameters" });
        }

        console.log(`Visualizing: ${owner}/${targetRepo}/${filePath}`);

        let content = null;
        let contentSource = "local";

        if (user?.repoBasePath || DEFAULT_REPO_BASE_PATH) {
            const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
            const repoDir = getRepoDir(basePath, owner, targetRepo);
            const fullPath = path.normalize(path.join(repoDir, filePath));

            if (!fullPath.startsWith(repoDir)) {
                return res.status(400).json({ error: "Invalid file path" });
            }

            if (!fs.existsSync(fullPath)) {
                return res.status(404).json({ error: "File not found locally. Pull repo first." });
            }

            content = fs.readFileSync(fullPath, "utf-8");
        } else {
            contentSource = "github";
        }

        if (!content && contentSource === "github") {
            // Fetch File Content from GitHub
            const url = `https://api.github.com/repos/${owner}/${targetRepo}/contents/${filePath}`;
            const ghRes = await axios.get(url, {
                headers: { 
                    Authorization: `Bearer ${user.githubToken}`,
                    Accept: "application/vnd.github.v3+json"
                }
            });

            // Handle Empty/Large Files
            if (!ghRes.data.content) {
                return res.status(400).json({ error: "File is too large or empty." });
            }

            content = Buffer.from(ghRes.data.content, 'base64').toString('utf-8');
        }

        const ext = path.extname(filePath).toLowerCase();
        const supported = [".js", ".jsx", ".ts", ".tsx"];
        if (!supported.includes(ext)) {
            return res.status(400).json({ error: "Unsupported file type for graph. Use JS/TS files." });
        }

        const nodes = [];
        const edges = [];
        let idCounter = 0;

        const fileNodeId = "file-node";
        nodes.push(createNode(fileNodeId, filePath.split('/').pop(), 'file'));

        const functionNodes = new Map(); // name -> id

        const ensureFunctionNode = (name) => {
            if (!functionNodes.has(name)) {
                const id = `fn-${idCounter++}`;
                functionNodes.set(name, id);
                nodes.push(createNode(id, name, 'function'));
                edges.push({ id: `e-${idCounter++}`, source: fileNodeId, target: id, style: { stroke: '#10b981' } });
            }
            return functionNodes.get(name);
        };

        let ast;
        try {
            ast = parse(content, {
                sourceType: "module",
                plugins: ["typescript", "jsx"]
            });
        } catch (parseError) {
            return res.status(400).json({ error: "Failed to parse file for graph. Ensure valid JS/TS." });
        }

        let currentFunction = null;

        traverseFn(ast, {
            FunctionDeclaration(path) {
                if (path.node.id?.name) {
                    currentFunction = path.node.id.name;
                    ensureFunctionNode(currentFunction);
                }
            },
            VariableDeclarator(path) {
                const init = path.node.init;
                if (!path.node.id?.name) return;
                if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
                    currentFunction = path.node.id.name;
                    ensureFunctionNode(currentFunction);
                }
            },
            ClassMethod(path) {
                if (path.node.key?.name) {
                    const name = path.node.key.name;
                    currentFunction = name;
                    ensureFunctionNode(name);
                }
            },
            CallExpression(path) {
                const callee = path.node.callee;
                let calleeName = null;
                if (callee.type === "Identifier") calleeName = callee.name;
                if (callee.type === "MemberExpression" && callee.property?.name) {
                    calleeName = callee.property.name;
                }
                if (!calleeName) return;
                const sourceFn = currentFunction ? ensureFunctionNode(currentFunction) : fileNodeId;
                const targetFn = ensureFunctionNode(calleeName);
                edges.push({
                    id: `e-${idCounter++}`,
                    source: sourceFn,
                    target: targetFn,
                    animated: true,
                    style: { stroke: '#3b82f6' }
                });
            },
            exit(path) {
                if (path.isFunctionDeclaration() || path.isVariableDeclarator() || path.isClassMethod()) {
                    currentFunction = null;
                }
            }
        });

        res.json({ nodes, edges });

    } catch (error) {
        console.error("Viz Error:", error);
        res.status(500).json({ error: error.message });
    }
};

// ==========================================
// 2. REPO STATS + ARCHITECTURE VISUALIZER
// ==========================================

const IGNORED_DIRS = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    "out",
    ".next",
    ".turbo",
    ".cache",
    "coverage",
    ".vscode",
    ".idea"
]);

const JS_LIKE_EXTS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const TEXT_LIKE_EXTS = new Set([
    ...JS_LIKE_EXTS,
    ".json",
    ".md",
    ".txt",
    ".yml",
    ".yaml",
    ".html",
    ".css",
    ".scss",
    ".py",
    ".java",
    ".go",
    ".rs",
    ".c",
    ".cpp",
    ".h",
    ".hpp",
    ".cs",
    ".php"
]);

const DEFAULT_MAX_NODES = 400;
const DEFAULT_REMOTE_DEPTH = 3;
const MAX_FILE_BYTES_TO_PARSE = 1024 * 1024; // 1MB

const toPosixPath = (p) => p.split(path.sep).join("/");

const safeRepoRelative = (repoDir, absPath) => {
    const rel = path.relative(repoDir, absPath);
    const norm = toPosixPath(rel);
    if (!norm || norm.startsWith("..")) return null;
    return norm;
};

const inc = (obj, key) => {
    obj[key] = (obj[key] || 0) + 1;
};

const isProbablyTextFile = (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return TEXT_LIKE_EXTS.has(ext);
};

const countLines = (content) => {
    if (!content) return 0;
    let lines = 1;
    for (let i = 0; i < content.length; i++) {
        if (content[i] === "\n") lines++;
    }
    return lines;
};

const walkDir = (dir, onEntry) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.isDirectory() && IGNORED_DIRS.has(ent.name)) continue;
        const abs = path.join(dir, ent.name);
        onEntry(ent, abs);
        if (ent.isDirectory()) {
            walkDir(abs, onEntry);
        }
    }
};

const extractJsImports = (code) => {
    const imports = [];

    let ast;
    try {
        ast = parse(code, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "dynamicImport"]
        });
    } catch {
        return imports;
    }

    traverseFn(ast, {
        ImportDeclaration(p) {
            const v = p.node.source?.value;
            if (typeof v === "string") imports.push(v);
        },
        ExportNamedDeclaration(p) {
            const v = p.node.source?.value;
            if (typeof v === "string") imports.push(v);
        },
        ExportAllDeclaration(p) {
            const v = p.node.source?.value;
            if (typeof v === "string") imports.push(v);
        },
        CallExpression(p) {
            const callee = p.node.callee;
            const args = p.node.arguments;

            // require('...')
            if (callee?.type === "Identifier" && callee.name === "require") {
                const arg0 = args?.[0];
                if (arg0?.type === "StringLiteral") imports.push(arg0.value);
            }
        },
        Import(p) {
            // import('...') dynamic import
            const parent = p.parentPath?.node;
            const arg0 = parent?.arguments?.[0];
            if (arg0?.type === "StringLiteral") imports.push(arg0.value);
        }
    });

    return imports;
};

const resolveRelativeImport = (fromAbsFile, spec) => {
    if (!spec || typeof spec !== "string") return null;
    if (!spec.startsWith(".")) return null;

    const baseDir = path.dirname(fromAbsFile);
    const rawTarget = path.resolve(baseDir, spec);

    const ext = path.extname(rawTarget);
    const candidates = [];

    if (ext) {
        candidates.push(rawTarget);
    } else {
        for (const e of JS_LIKE_EXTS) {
            candidates.push(rawTarget + e);
        }
        for (const e of JS_LIKE_EXTS) {
            candidates.push(path.join(rawTarget, "index" + e));
        }
    }

    for (const c of candidates) {
        try {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
        } catch {
            // ignore
        }
    }

    return null;
};

const buildLocalImportGraph = (repoDir, { maxNodes }) => {
    const stats = {
        source: "local",
        totalFiles: 0,
        totalDirs: 0,
        totalLines: 0,
        extensionCounts: {},
        truncated: false,
        note: null
    };

    const nodesById = new Map();
    const edges = [];
    let edgeCounter = 0;

    const ensureNode = (relPath) => {
        if (nodesById.has(relPath)) return;
        if (nodesById.size >= maxNodes) {
            stats.truncated = true;
            return;
        }

        nodesById.set(relPath, {
            id: relPath,
            type: "default",
            data: { label: relPath },
            position: { x: 0, y: 0 },
            style: {
                background: "#111",
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                width: 260,
                fontSize: "11px"
            }
        });
    };

    const jsFiles = [];

    walkDir(repoDir, (ent, abs) => {
        if (ent.isDirectory()) {
            stats.totalDirs++;
            return;
        }
        if (!ent.isFile()) return;

        stats.totalFiles++;
        const ext = path.extname(ent.name).toLowerCase() || "(none)";
        inc(stats.extensionCounts, ext);

        if (isProbablyTextFile(abs)) {
            try {
                const s = fs.statSync(abs);
                if (s.size <= MAX_FILE_BYTES_TO_PARSE) {
                    const content = fs.readFileSync(abs, "utf-8");
                    stats.totalLines += countLines(content);
                }
            } catch {
                // ignore unreadable
            }
        }

        const fileExt = path.extname(abs).toLowerCase();
        if (JS_LIKE_EXTS.has(fileExt)) {
            jsFiles.push(abs);
        }
    });

    // If repo is huge, avoid blowing up: only graph the first N JS/TS files.
    // Stats still cover the whole repo.
    const maxJsFilesToGraph = Math.max(50, Math.min(jsFiles.length, maxNodes));
    const jsToGraph = jsFiles.slice(0, maxJsFilesToGraph);

    if (jsFiles.length > jsToGraph.length) {
        stats.note = `Graph limited to first ${jsToGraph.length} JS/TS files (repo has ${jsFiles.length}). Pull specific files for deeper graphs.`;
    }

    for (const absFile of jsToGraph) {
        const fromRel = safeRepoRelative(repoDir, absFile);
        if (!fromRel) continue;

        ensureNode(fromRel);
        if (!nodesById.has(fromRel)) continue;

        let content;
        try {
            const s = fs.statSync(absFile);
            if (s.size > MAX_FILE_BYTES_TO_PARSE) continue;
            content = fs.readFileSync(absFile, "utf-8");
        } catch {
            continue;
        }

        const imports = extractJsImports(content);
        for (const spec of imports) {
            const resolved = resolveRelativeImport(absFile, spec);
            if (!resolved) continue;

            const toRel = safeRepoRelative(repoDir, resolved);
            if (!toRel) continue;

            ensureNode(toRel);
            if (!nodesById.has(toRel)) continue;

            edges.push({
                id: `e-${edgeCounter++}`,
                source: fromRel,
                target: toRel,
                animated: false,
                style: { stroke: "#10b981" }
            });
        }
    }

    return {
        nodes: Array.from(nodesById.values()),
        edges,
        stats: {
            ...stats,
            graphNodes: nodesById.size,
            graphEdges: edges.length
        }
    };
};

const buildRemoteTreeGraph = async (owner, repoName, githubToken, { maxNodes, depth }) => {
    const headers = {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };

    // 1) resolve default branch (fixes hard-coded main/master)
    const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
    const defaultBranch = repoRes.data?.default_branch || "main";

    // 2) fetch tree
    let tree = [];
    try {
        const treeRes = await axios.get(
            `https://api.github.com/repos/${owner}/${repoName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
            { headers }
        );
        tree = treeRes.data?.tree || [];
    } catch (e) {
        // Empty repos can return 409 (Git repository is empty)
        const status = e?.response?.status;
        if (status === 409) {
            tree = [];
        } else {
            throw e;
        }
    }

    const stats = {
        source: "github",
        defaultBranch,
        totalFiles: 0,
        totalDirs: 0,
        totalLines: null,
        extensionCounts: {},
        truncated: false,
        note: "Remote mode uses GitHub tree data (no full file parsing). Pull repo locally for an import graph." 
    };

    // Count full repo stats first (independent of graph depth)
    for (const item of tree) {
        if (!item?.path || (item.type !== "tree" && item.type !== "blob")) continue;
        if (item.type === "tree") {
            stats.totalDirs++;
        } else {
            stats.totalFiles++;
            const ext = path.extname(item.path).toLowerCase() || "(none)";
            inc(stats.extensionCounts, ext);
        }
    }

    const nodesById = new Map();
    const edgesById = new Map();

    const ensureNode = (id, label, kind) => {
        if (nodesById.has(id)) return;
        if (nodesById.size >= maxNodes) {
            stats.truncated = true;
            return;
        }

        const bg = kind === "dir" ? "#1f2937" : "#111";
        nodesById.set(id, {
            id,
            type: "default",
            data: { label },
            position: { x: 0, y: 0 },
            style: {
                background: bg,
                color: "white",
                border: "1px solid rgba(255,255,255,0.15)",
                width: 260,
                fontSize: "11px"
            }
        });
    };

    const ensureEdge = (source, target) => {
        const id = `e:${source}->${target}`;
        if (edgesById.has(id)) return;
        edgesById.set(id, {
            id,
            source,
            target,
            animated: false,
            style: { stroke: "#3b82f6" }
        });
    };

    const depthLimit = Math.max(1, Number(depth) || DEFAULT_REMOTE_DEPTH);

    for (const item of tree) {
        if (!item?.path || (item.type !== "tree" && item.type !== "blob")) continue;

        const parts = String(item.path).split("/");
        if (parts.length > depthLimit) continue;

        // Add all prefixes so the graph is connected
        let prefix = "";
        for (let i = 0; i < parts.length; i++) {
            const isLeaf = i === parts.length - 1;
            const kind = isLeaf ? (item.type === "tree" ? "dir" : "file") : "dir";
            prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];

            ensureNode(prefix, parts[i], kind === "dir" ? "dir" : "file");
            if (i > 0) {
                const parent = parts.slice(0, i).join("/");
                if (nodesById.has(parent) && nodesById.has(prefix)) {
                    ensureEdge(parent, prefix);
                }
            }
        }

        if (stats.truncated) break;
    }

    return {
        nodes: Array.from(nodesById.values()),
        edges: Array.from(edgesById.values()),
        stats: {
            ...stats,
            graphNodes: nodesById.size,
            graphEdges: edgesById.size
        }
    };
};

export const getAppStructure = async (req, res) => {
    try {
        const { owner, repo, repoName, maxNodes, depth } = req.query;
        const targetRepo = repo || repoName;

        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token. Please login again." });
        }

        const maxNodesNum = Math.max(50, Math.min(Number(maxNodes) || DEFAULT_MAX_NODES, 1200));

        // If owner/repo are provided, prefer a local clone (deep parsing), else fall back to GitHub tree (stats only).
        if (owner && targetRepo) {
            const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
            const repoDir = getRepoDir(basePath, String(owner), String(targetRepo));

            if (fs.existsSync(repoDir)) {
                return res.json(buildLocalImportGraph(repoDir, { maxNodes: maxNodesNum }));
            }

            const remote = await buildRemoteTreeGraph(String(owner), String(targetRepo), user.githubToken, {
                maxNodes: maxNodesNum,
                depth
            });
            return res.json(remote);
        }

        // Fallback: analyze the backend project itself (useful for debugging)
        const localBase = path.join(process.cwd(), "src");
        if (!fs.existsSync(localBase)) {
            return res.json({ nodes: [], edges: [], stats: { source: "local", totalFiles: 0, totalDirs: 0, totalLines: 0 } });
        }
        return res.json(buildLocalImportGraph(localBase, { maxNodes: maxNodesNum }));

    } catch (error) {
        const status = error?.response?.status;
        const gh = error?.response?.data;

        if (status) {
            return res.status(status).json({
                error: gh?.message || "Failed to visualize repository",
            });
        }

        console.error("Visualizer Error:", error.message);
        res.status(500).json({ error: "Failed to visualize architecture: " + error.message });
    }
};
