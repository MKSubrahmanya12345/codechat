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
// 2. LOCAL ARCHITECTURE VISUALIZER
// ==========================================
// ... imports and getDependencyGraph remain the same ...

// ==========================================
// 2. ARCHITECTURE VISUALIZER (Local OR Remote)
// ==========================================
export const getAppStructure = async (req, res) => {
    try {
        const { owner, repo, repoName } = req.query;
        const targetRepo = repo || repoName;
        
        const nodes = [];
        const edges = [];
        let idCounter = 0;

        const addNode = (label, type, code = "", parentId = null) => {
            const id = `node-${idCounter++}`;
            nodes.push({
                id, type, data: { label, code }, position: { x: 0, y: 0 }, parentNode: parentId
            });
            return id;
        };

        // --- MODE A: REMOTE GITHUB REPO ---
        if (owner && targetRepo) {
            console.log(`Analyzing Remote Repo: ${owner}/${targetRepo}`);
            const user = await User.findById(req.user._id);
            
            // 1. Get File Tree (Recursive)
            const treeUrl = `https://api.github.com/repos/${owner}/${targetRepo}/git/trees/main?recursive=1`;
            let treeData;
            
            try {
                const treeRes = await axios.get(treeUrl, {
                    headers: { Authorization: `Bearer ${user.githubToken}` }
                });
                treeData = treeRes.data.tree;
            } catch (e) {
                // Fallback for 'master' branch if 'main' fails
                const masterUrl = `https://api.github.com/repos/${owner}/${targetRepo}/git/trees/master?recursive=1`;
                const masterRes = await axios.get(masterUrl, {
                    headers: { Authorization: `Bearer ${user.githubToken}` }
                });
                treeData = masterRes.data.tree;
            }

            // 2. Find Route Files
            const routeFiles = treeData.filter(f => f.path.includes("routes/") && f.path.endsWith(".js"));

            for (const file of routeFiles) {
                // Fetch Route Content
                const contentRes = await axios.get(file.url, {
                    headers: { Authorization: `Bearer ${user.githubToken}` }
                });
                const content = Buffer.from(contentRes.data.content, 'base64').toString('utf-8');
                
                const fileNodeId = addNode(file.path.split('/').pop(), "file");

                // Parse Routes
                const routeRegex = /router\.(get|post|put|delete)\s*\(\s*["']([^"']+)["']\s*,\s*([a-zA-Z0-9_]+)/g;
                let match;
                
                while ((match = routeRegex.exec(content)) !== null) {
                    const [_, method, pathUrl, functionName] = match;
                    const routeId = addNode(`${method.toUpperCase()} ${pathUrl}`, "route");
                    edges.push({ id: `e-${idCounter++}`, source: fileNodeId, target: routeId });

                    // Try to find matching Controller
                    // Heuristic: auth.route.js -> auth.controller.js
                    const controllerName = file.path.split('/').pop().replace("route", "controller");
                    const controllerFile = treeData.find(f => f.path.includes("controllers") && f.path.endsWith(controllerName));

                    if (controllerFile) {
                        const ctrlRes = await axios.get(controllerFile.url, {
                            headers: { Authorization: `Bearer ${user.githubToken}` }
                        });
                        const ctrlContent = Buffer.from(ctrlRes.data.content, 'base64').toString('utf-8');
                        
                        const funcRegex = new RegExp(`export const ${functionName} = async \\(req, res\\) => \\{([\\s\\S]*?)\\n\\};`, "m");
                        const funcMatch = funcRegex.exec(ctrlContent);

                        if (funcMatch) {
                            const codeSnippet = funcMatch[0];
                            const codeId = addNode(functionName, "code", codeSnippet);
                            edges.push({ 
                                id: `e-${idCounter++}`, source: routeId, target: codeId, 
                                animated: true, style: { stroke: '#10b981' } 
                            });
                        }
                    }
                }
            }
        } 
        
        // --- MODE B: LOCAL FILE SYSTEM (Original Logic) ---
        else {
            console.log("Analyzing Local File System");
            const baseDir = path.join(process.cwd(), "src");
            const routesDir = path.join(baseDir, "routes");
            
            if (fs.existsSync(routesDir)) {
                const routeFiles = fs.readdirSync(routesDir);
                for (const file of routeFiles) {
                    if (!file.endsWith(".route.js")) continue;
                    const content = fs.readFileSync(path.join(routesDir, file), "utf-8");
                    const fileNodeId = addNode(file, "file");

                    const routeRegex = /router\.(get|post|put|delete)\s*\(\s*["']([^"']+)["']\s*,\s*([a-zA-Z0-9_]+)/g;
                    let match;
                    while ((match = routeRegex.exec(content)) !== null) {
                        const [_, method, pathUrl, functionName] = match;
                        const routeId = addNode(`${method.toUpperCase()} ${pathUrl}`, "route");
                        edges.push({ id: `e-${idCounter++}`, source: fileNodeId, target: routeId });

                        const controllerName = file.replace(".route.js", ".controller.js");
                        const controllerPath = path.join(baseDir, "controllers", controllerName);
                        if (fs.existsSync(controllerPath)) {
                            const ctrlContent = fs.readFileSync(controllerPath, "utf-8");
                            const funcRegex = new RegExp(`export const ${functionName} = async \\(req, res\\) => \\{([\\s\\S]*?)\\n\\};`, "m");
                            const funcMatch = funcRegex.exec(ctrlContent);
                            if (funcMatch) {
                                const codeId = addNode(functionName, "code", funcMatch[0]);
                                edges.push({ 
                                    id: `e-${idCounter++}`, source: routeId, target: codeId, 
                                    animated: true, style: { stroke: '#10b981' } 
                                });
                            }
                        }
                    }
                }
            }
        }

        res.json({ nodes, edges });

    } catch (error) {
        console.error("Visualizer Error:", error.message);
        res.status(500).json({ error: "Failed to visualize architecture: " + error.message });
    }
};
