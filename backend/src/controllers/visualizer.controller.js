import fs from "fs";
import path from "path";
import axios from "axios";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { User } from "../models/user.model.js";
import { analyzeGenericFile } from "../services/astParser.service.js";
import { parseGenericDataFlow } from "../services/dataFlowParser.service.js";

const DEFAULT_REPO_BASE_PATH = process.env.DEFAULT_REPO_BASE_PATH || "C:\\Users\\User\\Repo";
const DEFAULT_MAX_NODES = 400;
const DEFAULT_EXPAND_DEPTH = 2;
const DEFAULT_REMOTE_DEPTH = 3;
const DEFAULT_SNIPPET_LINES = 10;
const MAX_FILE_BYTES_TO_PARSE = 1024 * 1024;
const MAX_NODES_UPPER_BOUND = 6000;

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

const PARSER_PROFILES = {
    "js-ts-deep": {
        id: "js-ts-deep",
        parseJsTs: true,
        symbolsInDetail: true,
        callsInDetail: true,
        extendsInDetail: true
    },
    balanced: {
        id: "balanced",
        parseJsTs: true,
        symbolsInDetail: false,
        callsInDetail: false,
        extendsInDetail: false
    },
    "structure-only": {
        id: "structure-only",
        parseJsTs: false,
        symbolsInDetail: false,
        callsInDetail: false,
        extendsInDetail: false
    }
};

const traverseFn = traverse?.default || traverse;

const getRepoDir = (basePath, owner, repoName) => {
    const safeOwner = String(owner || "").replace(/[^a-zA-Z0-9-_]/g, "");
    const safeRepo = String(repoName || "").replace(/[^a-zA-Z0-9-_]/g, "");
    return path.join(basePath, `${safeOwner}__${safeRepo}`);
};

const clampNum = (value, min, max, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
};

const parseExpandDepth = (value, fallback = DEFAULT_EXPAND_DEPTH) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (String(value).toLowerCase() === "all") return Number.POSITIVE_INFINITY;
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(1, Math.min(100, Math.floor(n)));
};

const toPosixPath = (p) => String(p).split(path.sep).join("/");

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

const safeReadUtf8 = (filePath, maxBytes = MAX_FILE_BYTES_TO_PARSE) => {
    try {
        const s = fs.statSync(filePath);
        if (!s.isFile() || s.size > maxBytes) return null;
        return fs.readFileSync(filePath, "utf-8");
    } catch {
        return null;
    }
};

const makeDocs = (partial = {}) => ({
    summary: partial.summary || "",
    exports: Array.isArray(partial.exports) ? partial.exports : [],
    imports: Array.isArray(partial.imports) ? partial.imports : [],
    dependents: Array.isArray(partial.dependents) ? partial.dependents : [],
    snippetPreview: partial.snippetPreview || "",
    filePath: partial.filePath || null,
    absolutePath: partial.absolutePath || null,
    lineStart: Number.isFinite(Number(partial.lineStart)) ? Number(partial.lineStart) : null,
    lineEnd: Number.isFinite(Number(partial.lineEnd)) ? Number(partial.lineEnd) : null
});

const getNodeStyle = (kind) => {
    if (kind === "module") {
        return {
            background: "#16213e",
            color: "white",
            border: "1px solid rgba(96,165,250,0.55)",
            width: 260,
            fontSize: "12px",
            borderRadius: 12
        };
    }
    if (kind === "directory") {
        return {
            background: "#1f2937",
            color: "white",
            border: "1px solid rgba(148,163,184,0.45)",
            width: 240,
            fontSize: "11px",
            borderRadius: 10
        };
    }
    if (kind === "file") {
        return {
            background: "#111827",
            color: "white",
            border: "1px solid rgba(16,185,129,0.55)",
            width: 300,
            fontSize: "11px",
            borderRadius: 10
        };
    }
    return {
        background: "#3b0764",
        color: "white",
        border: "1px solid rgba(192,132,252,0.6)",
        width: 230,
        fontSize: "11px",
        borderRadius: 10
    };
};

const getEdgeStyle = (relation) => {
    if (relation === "contains") return { stroke: "#64748b", strokeWidth: 1.35 };
    if (relation === "imports") return { stroke: "#10b981", strokeWidth: 1.9 };
    if (relation === "extends") return { stroke: "#f59e0b", strokeWidth: 1.8, strokeDasharray: "5 4" };
    return { stroke: "#8b5cf6", strokeWidth: 1.8 };
};

const makeNode = ({ id, label, kind, docs }) => ({
    id,
    kind,
    type: "default",
    data: { label, kind, docs },
    docs,
    position: { x: 0, y: 0 },
    style: getNodeStyle(kind)
});

const makeEdge = ({ source, target, relation }) => ({
    id: `${relation}:${source}->${target}`,
    source,
    target,
    relation,
    type: "smoothstep",
    animated: relation === "calls",
    style: getEdgeStyle(relation)
});

const getSnippet = (lines, lineStart, lineEnd, maxLines) => {
    if (!Array.isArray(lines) || lines.length === 0) return "";
    const start = Math.max(1, Number(lineStart) || 1);
    const rawEnd = Number(lineEnd) || start;
    const end = Math.max(start, rawEnd);
    const hardEnd = Math.min(lines.length, start + Math.max(1, maxLines) - 1, end);
    return lines.slice(start - 1, hardEnd).join("\n").trim();
};

const summarizeImportSpec = (spec) => {
    if (!spec || typeof spec !== "string") return "";
    return spec.startsWith(".") ? `local:${spec}` : `package:${spec}`;
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
        for (const e of JS_LIKE_EXTS) candidates.push(rawTarget + e);
        for (const e of JS_LIKE_EXTS) candidates.push(path.join(rawTarget, "index" + e));
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

const getCalleeName = (calleeNode) => {
    if (!calleeNode) return null;
    if (calleeNode.type === "Identifier") return calleeNode.name;
    if (calleeNode.type === "MemberExpression" && calleeNode.property?.type === "Identifier") {
        return calleeNode.property.name;
    }
    return null;
};
const analyzeJsTsFile = (content, { snippetLines }) => {
    const imports = [];
    const exportsSet = new Set();
    const symbols = [];
    const calls = [];
    const extendsRels = [];

    let ast;
    try {
        ast = parse(content, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "dynamicImport", "classProperties"]
        });
    } catch {
        return { imports, exports: [], symbols, calls, extendsRels, parseOk: false };
    }

    const lines = content.split(/\r?\n/);
    const symbolStack = [];

    const addSymbol = (name, symbolType, node) => {
        if (!name || typeof name !== "string") return null;
        const lineStart = node?.loc?.start?.line || null;
        const lineEnd = node?.loc?.end?.line || lineStart;

        const symbol = {
            key: `${name}:${lineStart || 0}:${symbols.length}`,
            name,
            symbolType,
            lineStart,
            lineEnd,
            snippetPreview: getSnippet(lines, lineStart || 1, lineEnd || lineStart || 1, snippetLines)
        };
        symbols.push(symbol);
        return symbol;
    };

    traverseFn(ast, {
        ImportDeclaration(p) {
            const source = p.node.source?.value;
            if (typeof source === "string") imports.push(source);
        },
        ExportNamedDeclaration(p) {
            const source = p.node.source?.value;
            if (typeof source === "string") imports.push(source);

            const decl = p.node.declaration;
            if (decl?.type === "FunctionDeclaration" && decl.id?.name) exportsSet.add(decl.id.name);
            if (decl?.type === "ClassDeclaration" && decl.id?.name) exportsSet.add(decl.id.name);
            if (decl?.type === "VariableDeclaration") {
                for (const d of decl.declarations || []) {
                    if (d.id?.type === "Identifier") exportsSet.add(d.id.name);
                }
            }

            for (const s of p.node.specifiers || []) {
                if (s.exported?.name) exportsSet.add(s.exported.name);
            }
        },
        ExportDefaultDeclaration(p) {
            const decl = p.node.declaration;
            if (decl?.id?.name) exportsSet.add(`default(${decl.id.name})`);
            else exportsSet.add("default");
        },
        FunctionDeclaration: {
            enter(p) {
                if (!p.node.id?.name) return;
                const sym = addSymbol(p.node.id.name, "function", p.node);
                if (sym) symbolStack.push(sym.key);
            },
            exit(p) {
                if (!p.node.id?.name) return;
                symbolStack.pop();
            }
        },
        VariableDeclarator: {
            enter(p) {
                const init = p.node.init;
                if (!p.node.id?.name) return;
                if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
                    const sym = addSymbol(p.node.id.name, "function", p.node);
                    if (sym) symbolStack.push(sym.key);
                }
            },
            exit(p) {
                const init = p.node.init;
                if (init && (init.type === "ArrowFunctionExpression" || init.type === "FunctionExpression")) {
                    symbolStack.pop();
                }
            }
        },
        ClassDeclaration: {
            enter(p) {
                if (!p.node.id?.name) return;
                const sym = addSymbol(p.node.id.name, "class", p.node);
                if (sym) {
                    symbolStack.push(sym.key);
                    const superClass = p.node.superClass;
                    if (superClass?.type === "Identifier") {
                        extendsRels.push({ fromSymbolKey: sym.key, toName: superClass.name });
                    }
                }
            },
            exit(p) {
                if (!p.node.id?.name) return;
                symbolStack.pop();
            }
        },
        ClassMethod: {
            enter(p) {
                if (!p.node.key?.name) return;
                const sym = addSymbol(p.node.key.name, "method", p.node);
                if (sym) symbolStack.push(sym.key);
            },
            exit(p) {
                if (!p.node.key?.name) return;
                symbolStack.pop();
            }
        },
        CallExpression(p) {
            const calleeName = getCalleeName(p.node.callee);
            if (!calleeName) return;
            const fromSymbolKey = symbolStack.length ? symbolStack[symbolStack.length - 1] : null;
            calls.push({ fromSymbolKey, toName: calleeName });
        }
    });

    return {
        imports,
        exports: Array.from(exportsSet),
        symbols,
        calls,
        extendsRels,
        parseOk: true
    };
};

const normalizeView = (viewRaw) => {
    const value = String(viewRaw || "overview").toLowerCase();
    return value === "detail" ? "detail" : "overview";
};

const resolveParserProfile = (langProfileRaw, view) => {
    const key = String(langProfileRaw || "js-ts-deep").toLowerCase();
    const base = PARSER_PROFILES[key] || PARSER_PROFILES["js-ts-deep"];
    const isDetail = view === "detail";

    return {
        id: base.id,
        parseJsTs: base.parseJsTs,
        includeImports: base.parseJsTs,
        includeSymbols: Boolean(base.parseJsTs && base.symbolsInDetail && isDetail),
        includeCalls: Boolean(base.parseJsTs && base.callsInDetail && isDetail),
        includeExtends: Boolean(base.parseJsTs && base.extendsInDetail && isDetail)
    };
};

const initializeGraph = ({ maxNodes }) => {
    const nodesById = new Map();
    const edgesById = new Map();

    const addNode = (node, stats) => {
        if (!node?.id) return null;
        if (nodesById.has(node.id)) return nodesById.get(node.id);
        if (nodesById.size >= maxNodes) {
            stats.truncated = true;
            return null;
        }
        nodesById.set(node.id, node);
        return node;
    };

    const patchNodeDocs = (nodeId, patch = {}) => {
        const node = nodesById.get(nodeId);
        if (!node) return;
        const docs = makeDocs({ ...(node.docs || {}), ...patch });
        node.docs = docs;
        node.data = { ...(node.data || {}), docs };
    };

    const addEdge = ({ source, target, relation }) => {
        if (!source || !target || !relation) return null;
        if (!nodesById.has(source) || !nodesById.has(target)) return null;
        const edge = makeEdge({ source, target, relation });
        if (!edgesById.has(edge.id)) edgesById.set(edge.id, edge);
        return edgesById.get(edge.id);
    };

    return { nodesById, edgesById, addNode, patchNodeDocs, addEdge };
};
const createDependencyNode = ({ id, label, kind, docs }) => ({
    id,
    kind,
    type: "default",
    data: { label, kind, docs },
    docs,
    position: { x: 0, y: 0 },
    style: getNodeStyle(kind)
});

export const getDependencyGraph = async (req, res) => {
    try {
        const { owner, repo, repoName, path: filePath, snippetLines } = req.query;
        const targetRepo = repo || repoName;
        const user = await User.findById(req.user._id);

        if (!user || !owner || !targetRepo || !filePath) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const snippetLineCount = clampNum(snippetLines, 3, 40, DEFAULT_SNIPPET_LINES);

        let content = null;
        let contentSource = "local";
        let fullPath = null;

        if (user?.repoBasePath || DEFAULT_REPO_BASE_PATH) {
            const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
            const repoDir = getRepoDir(basePath, owner, targetRepo);
            fullPath = path.normalize(path.join(repoDir, filePath));

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
            const url = `https://api.github.com/repos/${owner}/${targetRepo}/contents/${filePath}`;
            const ghRes = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${user.githubToken}`,
                    Accept: "application/vnd.github.v3+json"
                }
            });

            if (!ghRes.data.content) {
                return res.status(400).json({ error: "File is too large or empty." });
            }
            content = Buffer.from(ghRes.data.content, "base64").toString("utf-8");
        }

        const ext = path.extname(filePath).toLowerCase();
        if (!JS_LIKE_EXTS.has(ext)) {
            return res.status(400).json({ error: "Unsupported file type for graph. Use JS/TS files." });
        }

        const parsed = analyzeJsTsFile(content, { snippetLines: snippetLineCount });
        const lines = content.split(/\r?\n/);

        const nodes = [];
        const edges = [];
        const fileNodeId = `file:${filePath}`;

        nodes.push(createDependencyNode({
            id: fileNodeId,
            label: path.basename(filePath),
            kind: "file",
            docs: makeDocs({
                summary: "Selected file dependency graph",
                filePath,
                absolutePath: fullPath,
                snippetPreview: getSnippet(lines, 1, snippetLineCount, snippetLineCount)
            })
        }));

        const symbolByName = new Map();
        const symbolByKey = new Map();

        for (const symbol of parsed.symbols) {
            const symbolId = `sym:${filePath}:${symbol.name}:${symbol.lineStart || 0}:${symbol.symbolType}`;
            symbolByName.set(symbol.name, symbolId);
            symbolByKey.set(symbol.key, symbolId);

            nodes.push(createDependencyNode({
                id: symbolId,
                label: symbol.name,
                kind: "symbol",
                docs: makeDocs({
                    summary: `${symbol.symbolType} in ${path.basename(filePath)}`,
                    filePath,
                    absolutePath: fullPath,
                    lineStart: symbol.lineStart,
                    lineEnd: symbol.lineEnd,
                    snippetPreview: symbol.snippetPreview
                })
            }));

            edges.push({
                id: `contains:${fileNodeId}->${symbolId}`,
                source: fileNodeId,
                target: symbolId,
                relation: "contains",
                style: getEdgeStyle("contains")
            });
        }

        const edgeIds = new Set(edges.map((e) => e.id));
        for (const call of parsed.calls) {
            if (!call.fromSymbolKey) continue;
            const sourceId = symbolByKey.get(call.fromSymbolKey);
            const targetId = symbolByName.get(call.toName);
            if (!sourceId || !targetId) continue;

            const id = `calls:${sourceId}->${targetId}`;
            if (edgeIds.has(id)) continue;
            edgeIds.add(id);
            edges.push({
                id,
                source: sourceId,
                target: targetId,
                relation: "calls",
                animated: true,
                style: getEdgeStyle("calls")
            });
        }

        return res.json({
            nodes,
            edges,
            stats: {
                source: contentSource,
                totalFiles: 1,
                totalDirs: 0,
                totalLines: countLines(content),
                graphNodes: nodes.length,
                graphEdges: edges.length
            },
            capabilities: {
                view: "detail",
                langProfile: "js-ts-deep",
                supportedLangProfiles: Object.keys(PARSER_PROFILES),
                parsers: ["js-ts-parser"],
                relations: ["contains", "calls"],
                localAnalysis: contentSource === "local"
            }
        });
    } catch (error) {
        console.error("Viz Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
const buildLocalDocumentationGraph = (repoDir, options) => {
    const { maxNodes, expandDepth, snippetLines, view, parserProfile } = options;

    const stats = {
        source: "local",
        totalFiles: 0,
        totalDirs: 0,
        totalLines: 0,
        extensionCounts: {},
        truncated: false,
        note: null
    };

    const graph = initializeGraph({ maxNodes });
    const visibleFiles = [];
    const fileNodeByRel = new Map();

    const rootId = "root";
    graph.addNode(makeNode({
        id: rootId,
        label: "/",
        kind: "directory",
        docs: makeDocs({ summary: "Repository root", filePath: "/" })
    }), stats);

    const walk = (dirAbs, relDir, depth, parentVisibleId) => {
        let entries = [];
        try {
            entries = fs.readdirSync(dirAbs, { withFileTypes: true });
        } catch {
            return;
        }

        for (const ent of entries) {
            if (ent.isDirectory() && IGNORED_DIRS.has(ent.name)) continue;

            const childAbs = path.join(dirAbs, ent.name);
            const childRel = relDir ? `${relDir}/${ent.name}` : ent.name;
            const childDepth = depth + 1;

            if (ent.isDirectory()) {
                stats.totalDirs++;
                let nextParentVisibleId = parentVisibleId;

                if (childDepth <= expandDepth) {
                    const kind = childDepth === 1 ? "module" : "directory";
                    const dirNodeId = `dir:${childRel}`;
                    const node = graph.addNode(makeNode({
                        id: dirNodeId,
                        label: ent.name,
                        kind,
                        docs: makeDocs({
                            summary: kind === "module" ? "Module namespace" : "Directory",
                            filePath: childRel,
                            absolutePath: childAbs
                        })
                    }), stats);

                    if (node) {
                        graph.addEdge({ source: parentVisibleId, target: dirNodeId, relation: "contains" });
                        nextParentVisibleId = dirNodeId;
                    }
                }

                walk(childAbs, childRel, childDepth, nextParentVisibleId);
                continue;
            }

            if (!ent.isFile()) continue;

            stats.totalFiles++;
            const ext = path.extname(ent.name).toLowerCase() || "(none)";
            inc(stats.extensionCounts, ext);

            const maybeContent = isProbablyTextFile(childAbs) ? safeReadUtf8(childAbs) : null;
            if (typeof maybeContent === "string") {
                stats.totalLines += countLines(maybeContent);
            }

            if (childDepth > expandDepth) continue;

            const fileNodeId = `file:${childRel}`;
            const node = graph.addNode(makeNode({
                id: fileNodeId,
                label: ent.name,
                kind: "file",
                docs: makeDocs({
                    summary: `File${ext !== "(none)" ? ` (${ext})` : ""}`,
                    filePath: childRel,
                    absolutePath: childAbs,
                    snippetPreview: typeof maybeContent === "string"
                        ? getSnippet(maybeContent.split(/\r?\n/), 1, snippetLines, snippetLines)
                        : ""
                })
            }), stats);

            if (!node) continue;

            fileNodeByRel.set(childRel, fileNodeId);
            graph.addEdge({ source: parentVisibleId, target: fileNodeId, relation: "contains" });

            visibleFiles.push({
                relPath: childRel,
                absPath: childAbs,
                nodeId: fileNodeId,
                ext,
                content: typeof maybeContent === "string" ? maybeContent : null
            });
        }
    };

    walk(repoDir, "", 0, rootId);

    const dependents = new Map();

    if (parserProfile.parseJsTs) {
        for (const file of visibleFiles) {
            const isJs = JS_LIKE_EXTS.has(file.ext);
            const isSupportedGeneric = [".py", ".java", ".go", ".cs"].includes(file.ext);
            if (!isJs && !isSupportedGeneric) continue;

            const content = file.content ?? safeReadUtf8(file.absPath);
            if (!content) continue;

            const parsed = isJs ? analyzeJsTsFile(content, { snippetLines }) : analyzeGenericFile(content, file.ext, snippetLines);
            if (!parsed || !parsed.parseOk) continue;

            const importsResolved = [];
            for (const spec of parsed.imports) {
                let resolvedAbs = null;
                if (isJs) {
                    resolvedAbs = resolveRelativeImport(file.absPath, spec);
                } else if (spec.startsWith(".")) {
                    try {
                        const baseDir = path.dirname(file.absPath);
                        const candidate = path.resolve(baseDir, spec);
                        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                            resolvedAbs = candidate;
                        } else if (fs.existsSync(candidate + file.ext)) {
                            resolvedAbs = candidate + file.ext;
                        }
                    } catch(e) {}
                }

                const resolvedRel = resolvedAbs ? safeRepoRelative(repoDir, resolvedAbs) : null;
                const targetNodeId = resolvedRel ? fileNodeByRel.get(resolvedRel) : null;

                importsResolved.push(resolvedRel || summarizeImportSpec(spec));

                if (parserProfile.includeImports && targetNodeId) {
                    graph.addEdge({ source: file.nodeId, target: targetNodeId, relation: "imports" });
                    if (!dependents.has(targetNodeId)) dependents.set(targetNodeId, new Set());
                    dependents.get(targetNodeId).add(file.relPath);
                }
            }

            graph.patchNodeDocs(file.nodeId, {
                imports: importsResolved.slice(0, 50),
                exports: parsed.exports.slice(0, 50)
            });

            if (!parserProfile.includeSymbols) continue;

            const localByName = new Map();
            const localByKey = new Map();

            for (const symbol of parsed.symbols) {
                const symbolNodeId = `sym:${file.relPath}:${symbol.name}:${symbol.lineStart || 0}:${symbol.symbolType}`;
                const symbolNode = graph.addNode(makeNode({
                    id: symbolNodeId,
                    label: symbol.name,
                    kind: "symbol",
                    docs: makeDocs({
                        summary: `${symbol.symbolType} in ${path.basename(file.relPath)}`,
                        filePath: file.relPath,
                        absolutePath: file.absPath,
                        lineStart: symbol.lineStart,
                        lineEnd: symbol.lineEnd,
                        snippetPreview: symbol.snippetPreview
                    })
                }), stats);

                if (!symbolNode) continue;

                graph.addEdge({ source: file.nodeId, target: symbolNodeId, relation: "contains" });
                if (!localByName.has(symbol.name)) localByName.set(symbol.name, symbolNodeId);
                localByKey.set(symbol.key, symbolNodeId);
            }

            if (parserProfile.includeCalls) {
                for (const call of parsed.calls) {
                    if (!call.fromSymbolKey) continue;
                    const sourceId = localByKey.get(call.fromSymbolKey);
                    const targetId = localByName.get(call.toName);
                    if (!sourceId || !targetId) continue;
                    graph.addEdge({ source: sourceId, target: targetId, relation: "calls" });
                }
            }

            if (parserProfile.includeExtends) {
                for (const extRel of parsed.extendsRels) {
                    const sourceId = localByKey.get(extRel.fromSymbolKey);
                    const targetId = localByName.get(extRel.toName);
                    if (!sourceId || !targetId) continue;
                    graph.addEdge({ source: sourceId, target: targetId, relation: "extends" });
                }
            }
        }
    }

    for (const [nodeId, refs] of dependents.entries()) {
        graph.patchNodeDocs(nodeId, {
            dependents: Array.from(refs).slice(0, 50)
        });
    }

    if (view === "overview") {
        stats.note = "Overview mode: structure-first. Switch to detail mode for symbols and call relations.";
    }

    const nodes = Array.from(graph.nodesById.values());
    const edges = Array.from(graph.edgesById.values());

    return {
        nodes,
        edges,
        stats: {
            ...stats,
            graphNodes: nodes.length,
            graphEdges: edges.length
        },
        capabilities: {
            view,
            langProfile: parserProfile.id,
            supportedLangProfiles: Object.keys(PARSER_PROFILES),
            parsers: parserProfile.parseJsTs ? ["js-ts-parser", "fallback-structure"] : ["fallback-structure"],
            relations: [
                "contains",
                ...(parserProfile.includeImports ? ["imports"] : []),
                ...(parserProfile.includeCalls ? ["calls"] : []),
                ...(parserProfile.includeExtends ? ["extends"] : [])
            ],
            localAnalysis: true
        }
    };
};
const buildRemoteTreeDocumentationGraph = async (owner, repoName, githubToken, options) => {
    const { maxNodes, expandDepth, view, parserProfile } = options;

    const headers = {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
    };

    const repoRes = await axios.get(`https://api.github.com/repos/${owner}/${repoName}`, { headers });
    const defaultBranch = repoRes.data?.default_branch || "main";

    let tree = [];
    try {
        const treeRes = await axios.get(
            `https://api.github.com/repos/${owner}/${repoName}/git/trees/${encodeURIComponent(defaultBranch)}?recursive=1`,
            { headers }
        );
        tree = treeRes.data?.tree || [];
    } catch (e) {
        if (e?.response?.status === 409) tree = [];
        else throw e;
    }

    const stats = {
        source: "github",
        defaultBranch,
        totalFiles: 0,
        totalDirs: 0,
        totalLines: null,
        extensionCounts: {},
        truncated: false,
        note: "Remote mode is structural only. Pull repository locally for deep symbol/import/call documentation."
    };

    for (const item of tree) {
        if (!item?.path || (item.type !== "tree" && item.type !== "blob")) continue;
        if (item.type === "tree") stats.totalDirs++;
        if (item.type === "blob") {
            stats.totalFiles++;
            inc(stats.extensionCounts, path.extname(item.path).toLowerCase() || "(none)");
        }
    }

    const graph = initializeGraph({ maxNodes });
    const rootId = "root";
    graph.addNode(makeNode({
        id: rootId,
        label: "/",
        kind: "directory",
        docs: makeDocs({ summary: "Repository root", filePath: "/" })
    }), stats);

    const depthLimit = Math.max(1, Number(expandDepth) || DEFAULT_REMOTE_DEPTH);

    for (const item of tree) {
        if (!item?.path || (item.type !== "tree" && item.type !== "blob")) continue;

        const parts = String(item.path).split("/");
        if (parts.length > depthLimit) continue;

        let parentId = rootId;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            const prefix = parts.slice(0, i + 1).join("/");
            const isLeaf = i === parts.length - 1;
            const kind = isLeaf
                ? (item.type === "blob" ? "file" : (i === 0 ? "module" : "directory"))
                : (i === 0 ? "module" : "directory");
            const nodeId = `${kind === "file" ? "file" : "dir"}:${prefix}`;

            const node = graph.addNode(makeNode({
                id: nodeId,
                label: part,
                kind,
                docs: makeDocs({
                    summary: kind === "file" ? "Remote file metadata" : "Directory",
                    filePath: prefix
                })
            }), stats);

            if (node) {
                graph.addEdge({ source: parentId, target: nodeId, relation: "contains" });
                parentId = nodeId;
            }

            if (stats.truncated) break;
        }

        if (stats.truncated) break;
    }

    const nodes = Array.from(graph.nodesById.values());
    const edges = Array.from(graph.edgesById.values());

    return {
        nodes,
        edges,
        stats: {
            ...stats,
            graphNodes: nodes.length,
            graphEdges: edges.length
        },
        capabilities: {
            view,
            langProfile: parserProfile.id,
            supportedLangProfiles: Object.keys(PARSER_PROFILES),
            parsers: ["remote-tree-only"],
            relations: ["contains"],
            localAnalysis: false
        }
    };
};

export const getAppStructure = async (req, res) => {
    try {
        const {
            owner,
            repo,
            repoName,
            view: viewRaw,
            langProfile: langProfileRaw,
            maxNodes,
            expandDepth,
            depth,
            snippetLines
        } = req.query;

        const targetRepo = repo || repoName;
        const view = normalizeView(viewRaw);
        const parserProfile = resolveParserProfile(langProfileRaw, view);
        const maxNodesNum = clampNum(maxNodes, 50, MAX_NODES_UPPER_BOUND, DEFAULT_MAX_NODES);
        const expandDepthNum = parseExpandDepth(expandDepth ?? depth, DEFAULT_EXPAND_DEPTH);
        const snippetLinesNum = clampNum(snippetLines, 3, 40, DEFAULT_SNIPPET_LINES);

        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token. Please login again." });
        }

        if (owner && targetRepo) {
            const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
            const repoDir = getRepoDir(basePath, String(owner), String(targetRepo));

            if (fs.existsSync(repoDir)) {
                return res.json(buildLocalDocumentationGraph(repoDir, {
                    maxNodes: maxNodesNum,
                    expandDepth: expandDepthNum,
                    snippetLines: snippetLinesNum,
                    view,
                    parserProfile
                }));
            }

            const remote = await buildRemoteTreeDocumentationGraph(String(owner), String(targetRepo), user.githubToken, {
                maxNodes: maxNodesNum,
                expandDepth: expandDepthNum,
                view,
                parserProfile
            });
            return res.json(remote);
        }

        const localBase = path.join(process.cwd(), "src");
        if (!fs.existsSync(localBase)) {
            return res.json({
                nodes: [],
                edges: [],
                stats: { source: "local", totalFiles: 0, totalDirs: 0, totalLines: 0, graphNodes: 0, graphEdges: 0 },
                capabilities: {
                    view,
                    langProfile: parserProfile.id,
                    supportedLangProfiles: Object.keys(PARSER_PROFILES),
                    parsers: ["fallback-structure"],
                    relations: ["contains"],
                    localAnalysis: true
                }
            });
        }

        return res.json(buildLocalDocumentationGraph(localBase, {
            maxNodes: maxNodesNum,
            expandDepth: expandDepthNum,
            snippetLines: snippetLinesNum,
            view,
            parserProfile
        }));
    } catch (error) {
        const status = error?.response?.status;
        const gh = error?.response?.data;

        if (status) {
            return res.status(status).json({
                error: gh?.message || "Failed to visualize repository"
            });
        }

        console.error("Visualizer Error:", error.message);
        return res.status(500).json({ error: "Failed to visualize architecture: " + error.message });
    }
};

const readDirFiles = (dirAbs, filterFn) => {
    const out = [];
    const walk = (curr) => {
        let entries = [];
        try {
            entries = fs.readdirSync(curr, { withFileTypes: true });
        } catch {
            return;
        }

        for (const ent of entries) {
            if (ent.isDirectory() && IGNORED_DIRS.has(ent.name)) continue;
            const abs = path.join(curr, ent.name);
            if (ent.isDirectory()) {
                walk(abs);
                continue;
            }
            if (ent.isFile()) {
                if (!filterFn || filterFn(abs)) out.push(abs);
            }
        }
    };

    walk(dirAbs);
    return out;
};

const resolveImportPath = (fromAbsFile, importSpec) => {
    if (!importSpec || typeof importSpec !== "string") return null;
    if (!importSpec.startsWith(".")) return null;
    const baseDir = path.dirname(fromAbsFile);
    const rawTarget = path.resolve(baseDir, importSpec);
    const ext = path.extname(rawTarget);

    const candidates = ext
        ? [rawTarget]
        : [
            `${rawTarget}.js`,
            `${rawTarget}.ts`,
            `${rawTarget}.mjs`,
            `${rawTarget}.cjs`,
            path.join(rawTarget, "index.js"),
            path.join(rawTarget, "index.ts")
        ];

    for (const candidate of candidates) {
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
        } catch {
            // ignore
        }
    }

    return null;
};

const findBackendSrcDir = (repoDir) => {
    const candidates = [
        path.join(repoDir, "backend", "src"),
        path.join(repoDir, "server", "src"),
        path.join(repoDir, "api", "src"),
        path.join(repoDir, "backend"),
        path.join(repoDir, "server"),
        path.join(repoDir, "api"),
        path.join(repoDir, "src"),
        repoDir
    ];

    for (const dir of candidates) {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const entryFiles = ["index.js", "index.ts", "server.js", "server.ts", "app.js", "app.ts", "main.js", "main.ts"];
            if (entryFiles.some(f => fs.existsSync(path.join(dir, f)))) return dir;
        }
    }

    for (const dir of candidates) {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    }

    return repoDir;
};

const extractLocalImports = (content, absFile) => {
    const byIdentifier = new Map();
    let ast;
    try {
        ast = parse(content, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "dynamicImport"]
        });
    } catch {
        return byIdentifier;
    }

    traverseFn(ast, {
        ImportDeclaration(p) {
            const src = p.node.source?.value;
            if (typeof src !== "string") return;
            const resolved = resolveImportPath(absFile, src);
            if (!resolved) return;

            for (const spec of p.node.specifiers || []) {
                if (spec.local?.name) {
                    byIdentifier.set(spec.local.name, { resolved, source: src });
                }
            }
        },
        VariableDeclarator(p) {
            if (p.node.init?.type !== "CallExpression") return;
            if (p.node.init.callee?.type !== "Identifier" || p.node.init.callee.name !== "require") return;
            const arg0 = p.node.init.arguments?.[0];
            if (arg0?.type !== "StringLiteral") return;
            const src = arg0.value;
            const resolved = resolveImportPath(absFile, src);
            if (!resolved) return;

            if (p.node.id?.type === "Identifier") {
                byIdentifier.set(p.node.id.name, { resolved, source: src });
                return;
            }
            if (p.node.id?.type === "ObjectPattern") {
                for (const prop of p.node.id.properties || []) {
                    if (prop.type === "ObjectProperty" && prop.value?.type === "Identifier") {
                        byIdentifier.set(prop.value.name, { resolved, source: src });
                    }
                }
            }
        }
    });

    return byIdentifier;
};

const normalizeJoinedPath = (prefix, routePath) => {
    const p1 = String(prefix || "").trim();
    const p2 = String(routePath || "").trim();

    const left = p1.endsWith("/") ? p1.slice(0, -1) : p1;
    const right = p2.startsWith("/") ? p2 : `/${p2}`;
    const joined = `${left}${right}`.replace(/\/{2,}/g, "/");
    return joined || "/";
};

const parseGlobalDataFlow = (repoDir) => {
    const jsFiles = readDirFiles(repoDir, (abs) => [".js", ".ts", ".mjs", ".cjs"].includes(path.extname(abs).toLowerCase()));
    const pythonFiles = readDirFiles(repoDir, (abs) => abs.endsWith(".py"));
    const javaFiles = readDirFiles(repoDir, (abs) => abs.endsWith(".java"));
    const goFiles = readDirFiles(repoDir, (abs) => abs.endsWith(".go"));

    const genericRoutes = [
        ...parseGenericDataFlow(repoDir, ".py", pythonFiles),
        ...parseGenericDataFlow(repoDir, ".java", javaFiles),
        ...parseGenericDataFlow(repoDir, ".go", goFiles)
    ];

    const fileMap = new Map();

    for (const abs of jsFiles) {
        const content = safeReadUtf8(abs, 2 * 1024 * 1024);
        if (!content) continue;
        if (!/\b(use|get|post|put|patch|delete|all|require|import)\b/i.test(content)) continue;

        const imports = extractLocalImports(content, abs);
        const routes = [];
        const mounts = [];

        let ast;
        try {
            ast = parse(content, { sourceType: "unambiguous", plugins: ["typescript", "jsx", "dynamicImport"] });
        } catch {
            continue;
        }

        traverseFn(ast, {
            CallExpression(p) {
                const callee = p.node.callee;
                if (callee?.type !== "MemberExpression") return;
                const propName = callee.property?.name;
                if (!propName) return;

                const args = p.node.arguments || [];
                if (propName === "use" && args.length >= 2 && args[0].type === "StringLiteral") {
                    const mountPrefix = args[0].value;
                    const arg1 = args[1];
                    let targetResolved = null;
                    if (arg1.type === "Identifier") {
                        targetResolved = imports.get(arg1.name)?.resolved;
                    } else if (arg1.type === "CallExpression" && arg1.callee?.name === "require") {
                        const reqArg = arg1.arguments?.[0];
                        if (reqArg?.type === "StringLiteral") {
                            targetResolved = resolveImportPath(abs, reqArg.value);
                        }
                    }
                    if (targetResolved) mounts.push({ mountPrefix, targetResolved });
                }

                const method = String(propName).toUpperCase();
                if (["GET", "POST", "PUT", "PATCH", "DELETE", "ALL"].includes(method)) {
                    if (args.length >= 2 && args[0].type === "StringLiteral") {
                        const routePath = args[0].value;
                        const objName = callee.object?.name;
                        if (objName && ["axios", "request", "agent", "supertest", "fetch", "http", "httpClient"].includes(objName)) return;

                        const handlers = [];
                        for (let i = 1; i < args.length; i++) {
                            const h = args[i];
                            if (h.type === "Identifier") {
                                handlers.push({ name: h.name, controllerFile: imports.get(h.name)?.resolved || abs });
                            } else if (h.type === "MemberExpression" && h.property?.type === "Identifier") {
                                const oName = h.object?.name;
                                handlers.push({ name: h.property.name, controllerFile: oName ? (imports.get(oName)?.resolved || abs) : abs });
                            } else if (["ArrowFunctionExpression", "FunctionExpression"].includes(h.type)) {
                                handlers.push({ name: "inline_handler", controllerFile: abs });
                            }
                        }
                        if (handlers.length > 0) {
                            routes.push({ method, path: routePath, handlers });
                        }
                    }
                }
            }
        });

        if (routes.length > 0 || mounts.length > 0) {
            fileMap.set(abs, { absPath: abs, routes, mounts, content });
        }
    }

    const globalPrefixes = new Map();
    let changed = true;
    while(changed) {
        changed = false;
        for (const [abs, data] of fileMap.entries()) {
            for (const mount of data.mounts) {
                const target = mount.targetResolved;
                const parentPrefix = globalPrefixes.get(abs) || "";
                const absolutePrefix = normalizeJoinedPath(parentPrefix, mount.mountPrefix);
                
                const currentPrefix = globalPrefixes.get(target);
                if (currentPrefix !== absolutePrefix) {
                    globalPrefixes.set(target, absolutePrefix);
                    changed = true;
                }
            }
        }
    }

    const allRoutes = [...genericRoutes];
    for (const [abs, data] of fileMap.entries()) {
        const filePrefix = globalPrefixes.get(abs) || "";
        for (const r of data.routes) {
            allRoutes.push({
                method: r.method,
                path: normalizeJoinedPath(filePrefix, r.path),
                routeFile: abs,
                handlers: r.handlers
            });
        }
    }

    return allRoutes;
};

const parseControllerDetails = (controllerAbs) => {
    const content = safeReadUtf8(controllerAbs, 2 * 1024 * 1024);
    if (!content) return { functions: new Map() };

    const imports = extractLocalImports(content, controllerAbs);
    const modelIdentifiers = new Set();
    for (const [ident, imp] of imports.entries()) {
        if (imp.resolved.includes(`${path.sep}models${path.sep}`)) modelIdentifiers.add(ident);
    }

    const functionMap = new Map();
    let ast;
    try {
        ast = parse(content, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "dynamicImport"]
        });
    } catch {
        return { functions: functionMap };
    }

    const lines = content.split(/\r?\n/);

    const registerFn = (name, node) => {
        if (!name || !node) return;
        const lineStart = node.loc?.start?.line || null;
        const lineEnd = node.loc?.end?.line || lineStart;
        const snippetPreview = getSnippet(lines, lineStart || 1, lineEnd || lineStart || 1, 16);

        const usedModels = new Set();
        const calledServices = new Set();
        const fnText = getSnippet(lines, lineStart || 1, lineEnd || lineStart || 1, 200);
        for (const modelName of modelIdentifiers) {
            const modelRegex = new RegExp(`\\b${modelName}\\b`);
            if (modelRegex.test(fnText)) usedModels.add(modelName);
        }
        if (/\baxios\b/.test(fnText)) calledServices.add("axios");

        functionMap.set(name, {
            name,
            lineStart,
            lineEnd,
            snippetPreview,
            usedModels: Array.from(usedModels),
            calledServices: Array.from(calledServices)
        });
    };

    traverseFn(ast, {
        ExportNamedDeclaration(p) {
            const decl = p.node.declaration;
            if (!decl) return;
            if (decl.type === "FunctionDeclaration" && decl.id?.name) {
                registerFn(decl.id.name, decl);
            }
            if (decl.type === "VariableDeclaration") {
                for (const d of decl.declarations || []) {
                    if (d.id?.type === "Identifier" && d.init && (d.init.type === "ArrowFunctionExpression" || d.init.type === "FunctionExpression")) {
                        registerFn(d.id.name, d.init);
                    }
                }
            }
        },
        FunctionDeclaration(p) {
            if (p.node.id?.name && !functionMap.has(p.node.id.name)) {
                registerFn(p.node.id.name, p.node);
            }
        },
        VariableDeclarator(p) {
            if (p.node.id?.type !== "Identifier" || functionMap.has(p.node.id.name)) return;
            if (p.node.init && (p.node.init.type === "ArrowFunctionExpression" || p.node.init.type === "FunctionExpression")) {
                registerFn(p.node.id.name, p.node.init);
            }
        }
    });

    return { functions: functionMap };
};

const buildDataFlowGraph = (repoDir) => {
    let allRoutes = [];
    try {
        allRoutes = parseGlobalDataFlow(repoDir);
    } catch (e) {
        console.error(e);
    }

    if (allRoutes.length === 0) {
        return {
            nodes: [],
            edges: [],
            flows: [],
            routes: [],
            stats: { totalRoutes: 0, totalControllers: 0, totalModels: 0, source: "local", note: "No API routes detected globally via AST." }
        };
    }

    const nodes = [];
    const edges = [];
    const flows = [];
    const routesMeta = [];
    const nodeIds = new Set();
    const edgeIds = new Set();

    const pushNode = (node) => {
        if (!node || !node.id || nodeIds.has(node.id)) return;
        nodeIds.add(node.id);
        nodes.push(node);
    };

    const pushEdge = (edge) => {
        if (!edge || !edge.id || edgeIds.has(edge.id)) return;
        edgeIds.add(edge.id);
        edges.push(edge);
    };

    const clientNodeId = "client:external";
    pushNode(makeNode({
        id: clientNodeId,
        label: "Client",
        kind: "module",
        docs: makeDocs({ summary: "Entry point for incoming requests", filePath: "external" })
    }));

    const controllerCache = new Map();
    const modelNodeIds = new Set();

    for (const routeDef of allRoutes) {
        const routeNodeId = `route:${routeDef.method}:${routeDef.path}`;
        pushNode(makeNode({
            id: routeNodeId,
            label: `${routeDef.method} ${routeDef.path}`,
            kind: "file",
            docs: makeDocs({
                summary: `Route defined in ${safeRepoRelative(repoDir, routeDef.routeFile) || routeDef.routeFile}`,
                filePath: safeRepoRelative(repoDir, routeDef.routeFile) || routeDef.routeFile
            })
        }));
        pushEdge(makeEdge({ source: clientNodeId, target: routeNodeId, relation: "calls" }));

        const flowPath = [clientNodeId, routeNodeId];
        const controllerNodeIds = [];

        for (const handler of routeDef.handlers) {
            if (!handler.controllerFile || handler.name === "inline_handler") continue;

            if (!controllerCache.has(handler.controllerFile)) {
                controllerCache.set(handler.controllerFile, parseControllerDetails(handler.controllerFile));
            }
            const details = controllerCache.get(handler.controllerFile);
            const fn = details.functions.get(handler.name);

                const relController = safeRepoRelative(repoDir, handler.controllerFile) || handler.controllerFile;
                const controllerNodeId = `controller:${relController}:${handler.name}`;
                controllerNodeIds.push(controllerNodeId);

                pushNode(makeNode({
                    id: controllerNodeId,
                    label: handler.name,
                    kind: "symbol",
                    docs: makeDocs({
                        summary: `Controller handler in ${path.basename(relController)}`,
                        filePath: relController,
                        absolutePath: handler.controllerFile,
                        lineStart: fn?.lineStart || null,
                        lineEnd: fn?.lineEnd || null,
                        snippetPreview: fn?.snippetPreview || ""
                    })
                }));
                pushEdge(makeEdge({ source: routeNodeId, target: controllerNodeId, relation: "calls" }));

                if (!flowPath.includes(controllerNodeId)) flowPath.push(controllerNodeId);

                const usedModels = Array.isArray(fn?.usedModels) ? fn.usedModels : [];
                for (const modelName of usedModels) {
                    const modelNodeId = `model:${modelName}`;
                    modelNodeIds.add(modelNodeId);
                    pushNode(makeNode({
                        id: modelNodeId,
                        label: modelName,
                        kind: "module",
                        docs: makeDocs({ summary: "Model used by controller", filePath: "models" })
                    }));
                    pushEdge(makeEdge({ source: controllerNodeId, target: modelNodeId, relation: "imports" }));
                    if (!flowPath.includes(modelNodeId)) flowPath.push(modelNodeId);
                }

                if (Array.isArray(fn?.calledServices) && fn.calledServices.includes("axios")) {
                    const serviceNodeId = "service:external-api";
                    pushNode(makeNode({
                        id: serviceNodeId,
                        label: "External API",
                        kind: "module",
                        docs: makeDocs({ summary: "Outbound HTTP dependency" })
                    }));
                    pushEdge(makeEdge({ source: controllerNodeId, target: serviceNodeId, relation: "extends" }));
                    if (!flowPath.includes(serviceNodeId)) flowPath.push(serviceNodeId);
                }
            }

            const flowId = `flow:${routeDef.method}:${routeDef.path}`;
            flows.push({
                id: flowId,
                label: `${routeDef.method} ${routeDef.path}`,
                nodePath: flowPath
            });

            routesMeta.push({
                id: flowId,
                method: routeDef.method,
                path: routeDef.path,
                routeNodeId,
                controllers: controllerNodeIds
            });
        }

    return {
        nodes,
        edges,
        flows,
        routes: routesMeta,
        stats: {
            source: "local",
            totalRoutes: routesMeta.length,
            totalControllers: controllerCache.size,
            totalModels: modelNodeIds.size,
            graphNodes: nodes.length,
            graphEdges: edges.length
        }
    };
};

export const getDataFlowGraph = async (req, res) => {
    try {
        const { owner, repo, repoName } = req.query;
        const targetRepo = repo || repoName;
        const user = await User.findById(req.user._id);

        if (!user || !owner || !targetRepo) {
            return res.status(400).json({ error: "Missing parameters" });
        }

        const basePath = user?.repoBasePath || DEFAULT_REPO_BASE_PATH;
        const repoDir = getRepoDir(basePath, String(owner), String(targetRepo));
        if (!fs.existsSync(repoDir)) {
            return res.status(404).json({ error: "Repository not found locally. Pull repo first." });
        }

        return res.json(buildDataFlowGraph(repoDir));
    } catch (error) {
        console.error("Data Flow Viz Error:", error.message);
        return res.status(500).json({ error: "Failed to build data flow graph: " + error.message });
    }
};

export const testDataFlowApi = async (req, res) => {
    try {
        const {
            baseUrl = "http://localhost:5000",
            method = "GET",
            path: routePath = "/",
            headers = {},
            query = {},
            body = null
        } = req.body || {};

        const m = String(method || "GET").toUpperCase();
        if (!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(m)) {
            return res.status(400).json({ error: "Unsupported method" });
        }

        const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");
        const normalizedPath = String(routePath || "/").startsWith("/") ? String(routePath) : `/${routePath}`;
        const url = `${normalizedBase}${normalizedPath}`;

        const start = Date.now();
        const response = await axios.request({
            url,
            method: m,
            headers,
            params: query,
            data: body,
            validateStatus: () => true
        });
        const durationMs = Date.now() - start;

        return res.json({
            ok: response.status >= 200 && response.status < 300,
            status: response.status,
            durationMs,
            headers: response.headers,
            data: response.data
        });
    } catch (error) {
        const status = error?.response?.status || 500;
        return res.status(status).json({
            ok: false,
            status,
            error: error?.response?.data || error.message
        });
    }
};
