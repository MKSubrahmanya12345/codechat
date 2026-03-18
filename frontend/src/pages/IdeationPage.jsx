import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactFlow, {
    Background, Controls, MiniMap,
    useNodesState, useEdgesState, addEdge,
    Handle, Position
} from "reactflow";
import "reactflow/dist/style.css";
import axios from "axios";
import {
    ArrowLeft, Send, Sparkles, Bot, User as UserIcon,
    Code2, Loader, Cpu, FolderTree, Cloud, FileText, Network,
    Download, Plus, X, RefreshCw, Star, Trophy, Zap, Eye, Circle
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuthStore } from "../store/authUser";

// ??$$$ — Singleton socket for ideation (shared real-time channel)
const ideationSocket = io("http://localhost:5000");

// ??$$$ — STORAGE KEY for session persistence
const SESSION_KEY = "hackbot_session_v2";

// ??$$$ — QUICK PROMPTS for first-time users
const QUICK_PROMPTS = [
    "Generate the architecture graph →",
    "How should we host this?",
    "What is the MVP scope for 24h?",
    "What makes this idea unique?",
];

// ??$$$ — KIND → COLOUR map for custom nodes
const kindColors = {
    client:   { bg: "#0F2A4A", border: "#3B82F6", badge: "#60A5FA" },
    api:      { bg: "#0A2A1A", border: "#22C55E", badge: "#4ADE80" },
    db:       { bg: "#2A0A2A", border: "#A855F7", badge: "#C084FC" },
    service:  { bg: "#2A2A0A", border: "#EAB308", badge: "#FDE047" },
    queue:    { bg: "#2A1A0A", border: "#F97316", badge: "#FB923C" },
    ml:       { bg: "#0A1A2A", border: "#06B6D4", badge: "#22D3EE" },
    default:  { bg: "#1A1A1A", border: "#4B5563", badge: "#9CA3AF" },
};

// ??$$$ — CUSTOM REACT-FLOW NODE (with handles for user-created edges)
const CustomNode = ({ data, id }) => {
    const c = kindColors[data.kind] || kindColors.default;
    return (
        <div
            style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 12, padding: "10px 16px", minWidth: 148, cursor: "default" }}
            title="Double-click to rename"
        >
            <Handle type="target" position={Position.Left} style={{ background: c.border, borderColor: c.border, width: 10, height: 10 }} />
            <div style={{ fontSize: 10, color: c.badge, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
                {data.kind || "node"}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{data.label}</div>
            {data.tech && <div style={{ fontSize: 11, color: "#9CA3AF", marginTop: 3 }}>{data.tech}</div>}
            <Handle type="source" position={Position.Right} style={{ background: c.border, borderColor: c.border, width: 10, height: 10 }} />
        </div>
    );
};



// ??$$$ — SCORECARD MODAL
const ScorecardModal = ({ scores, onClose }) => {
    const axes = [
        { key: "feasibility",    label: "Feasibility",     color: "#4ADE80" },
        { key: "originality",    label: "Originality",     color: "#C084FC" },
        { key: "technicalDepth", label: "Tech Depth",      color: "#60A5FA" },
        { key: "demoability",    label: "Demo-ability",    color: "#FB923C" },
    ];

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 backdrop-blur-sm p-6">
            <div className="bg-[#111] border border-white/10 rounded-2xl p-8 w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Trophy size={20} className="text-yellow-400" />
                        <h2 className="font-bold text-lg">AI Judge Scorecard</h2>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white p-1"><X size={18} /></button>
                </div>

                <div className="space-y-4 mb-6">
                    {axes.map(a => (
                        <div key={a.key}>
                            <div className="flex justify-between text-sm mb-1">
                                <span className="text-gray-300 font-semibold">{a.label}</span>
                                <span className="font-bold" style={{ color: a.color }}>{scores[a.key]}/10</span>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-700"
                                    style={{ width: `${(scores[a.key] / 10) * 100}%`, background: a.color }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-gray-300 leading-relaxed">
                    <Star size={14} className="inline text-yellow-400 mr-1.5 mb-0.5" />
                    {scores.summary}
                </div>

                <button onClick={onClose} className="w-full mt-4 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-sm font-bold transition">
                    Got it, let's ship! 🚀
                </button>
            </div>
        </div>
    );
};

// ??$$$ — PANEL TABS
const TABS = [
    { id: "techStack",           label: "Tech Stack",  icon: Cpu },
    { id: "folderStructure",     label: "Folders",     icon: FolderTree },
    { id: "vision",              label: "Vision",      icon: Eye },
    { id: "hostingInstructions", label: "Hosting",     icon: Cloud },
    { id: "codeMePreview",       label: "CodeME.md",   icon: FileText },
    { id: "graph",               label: "Graph",       icon: Network },
];

// ??$$$ — EMPTY STATE
const EmptyState = ({ icon, label, hint }) => (
    <div className="flex flex-col items-center justify-center h-full text-gray-600 p-12 text-center gap-3">
        {icon}
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <p className="text-xs">{hint}</p>
    </div>
);

// ??$$$ — Download helper
const downloadFile = (filename, content) => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
};

// =============================
//   MAIN COMPONENT
// =============================
const IdeationPage = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // ??$$$ — Memoize nodeTypes/edgeTypes to avoid React Flow warnings/re-renders
    const nodeTypes = React.useMemo(() => ({ custom: CustomNode }), []);
    const edgeTypes = React.useMemo(() => ({}), []); 
    const newRepo = location.state?.newRepo || null;

    // ??$$$ — DYNAMIC KEY: use repo-specific key to retain individual chat state
    let initialSlug = newRepo?.name;
    if (initialSlug) {
        localStorage.setItem("last_ideation_repo", initialSlug);
    } else {
        initialSlug = localStorage.getItem("last_ideation_repo") || "latest";
    }
    const repoSlug = initialSlug;
    const activeKey = `hackbot_session_${repoSlug}`;

    // ??$$$ — Load from localStorage on mount (initial fast load)
    const savedSession = (() => {
        try { return JSON.parse(localStorage.getItem(activeKey)) || {}; } catch { return {}; }
    })();

    // ??$$$ — State: chat
    const [messages, setMessages] = useState(
        savedSession.messages || [{ role: "ai", content: "I'm your CTO. Give me your raw idea — I'll shape it into a hackathon winner." }]
    );
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error

    // ??$$$ — State: hackathon context (team size / hours)
    const [teamSize, setTeamSize] = useState(savedSession.teamSize || 2);
    const [hackHours, setHackHours] = useState(savedSession.hackHours || 24);

    // ??$$$ — Helper to ensure blueprint fields are always correctly typed (AI sometimes returns null/empty objects)
    const normalizeBlueprint = (bp) => ({
        techStack:           Array.isArray(bp?.techStack) ? bp.techStack : [],
        folderStructure:     (typeof bp?.folderStructure === "string" && bp.folderStructure) || "",
        hostingInstructions: (typeof bp?.hostingInstructions === "string" && bp.hostingInstructions) || "",
        codeMePreview:       (typeof bp?.codeMePreview === "string" && bp.codeMePreview) || "",
        graph:               bp?.graph || null
    });

    // ??$$$ — State: live blueprint
    const [blueprint, setBlueprint] = useState(() => normalizeBlueprint(savedSession?.blueprint));

    // ??$$$ — State: editable CodeME (user can edit the preview before pushing)
    const [editableCodeMe, setEditableCodeMe] = useState(savedSession.blueprint?.codeMePreview || "");

    // ??$$$ — ReactFlow (useNodesState gives drag-to-reposition for free)
    const initNodes = (savedSession.nodes || []).map(n => ({ ...n, type: "custom" }));
    const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(savedSession.edges || []);

    const [fileDrafts, setFileDrafts] = useState(savedSession.fileDrafts || {});
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDrafting, setIsDrafting] = useState(false);

    // ??$$$ — LOVABLE STYLE: UI Preview (Vision)
    const [uiPreview, setUiPreview] = useState(savedSession.uiPreview || "");
    const [isGeneratingUi, setIsGeneratingUi] = useState(false);

    // ??$$$ — Auth user (for sender tagging)
    const { authUser } = useAuthStore();
    const myUsername = authUser?.username || "You";

    // ??$$$ — Collaborative: live teammates + typing
    const [teammates, setTeammates] = useState([]);
    const [someoneTyping, setSomeoneTyping] = useState(null); // username or null

    // ??$$$ — Conflict detection state
    const [conflicts, setConflicts] = useState([]);
    const [dismissedConflicts, setDismissedConflicts] = useState(new Set());
    const [conflictCheckLoading, setConflictCheckLoading] = useState(false);

    // ??$$$ — Image upload state
    const [imageUploadLoading, setImageUploadLoading] = useState(false);
    const imageInputRef = useRef(null);

    // ??$$$ — @mention autocomplete state
    const [mentionDropdown, setMentionDropdown] = useState([]);
    const inputRef = useRef(null);

    // ??$$$ — Ref that always holds latest messages (needed for socket callbacks without stale closures)
    const messagesRef = useRef(messages);
    useEffect(() => { messagesRef.current = messages; }, [messages]);

    // ??$$$ — Ref for latest repoSlug (for socket callbacks)
    const repoSlugRef = useRef(repoSlug);
    const myUsernameRef = useRef(myUsername);
    useEffect(() => { myUsernameRef.current = myUsername; }, [myUsername]);

    // ??$$$ — Fetch Cloud Session on mount + join ideation socket room
    useEffect(() => {
        const fetchCloudSession = async () => {
            try {
                const res = await axios.get(`http://localhost:5000/api/hackathon/session/${repoSlug}`);
                if (res.data) {
                    const s = res.data;
                    setMessages(s.messages || []);
                    setBlueprint(normalizeBlueprint(s.blueprint));
                    setTeamSize(s.teamSize || 2);
                    setHackHours(s.hackHours || 24);
                    if (s.nodes) setNodes(s.nodes.map(n => ({ ...n, type: "custom" })));
                    if (s.edges) setEdges(s.edges);
                    if (s.fileDrafts) setFileDrafts(s.fileDrafts);
                    if (s.uiPreview) setUiPreview(s.uiPreview);
                    setSaveStatus("saved");
                }
            } catch (e) {
                console.log("No cloud session found or error fetching:", e.message);
            }
        };
        fetchCloudSession();

        // ??$$$ — Join ideation socket room for this repo
        if (myUsername && repoSlug) {
            ideationSocket.emit("ideation_join", { repoSlug, username: myUsername });
        }

        // ??$$$ — Helper: merge two message arrays, deduplicated, sorted by timestamp
        const mergeMessages = (existing, incoming) => {
            const map = new Map();
            [...existing, ...incoming].forEach(m => {
                // Key: timestamp + role + sender + first 30 chars of content (handles missing ts)
                const key = `${m.ts || 0}_${m.role}_${m.sender || "ai"}_${(m.content || "").slice(0, 30)}`;
                if (!map.has(key)) map.set(key, m);
            });
            return Array.from(map.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));
        };

        // ??$$$ — Listen: teammate list updates
        ideationSocket.on("ideation_teammates", (list) => setTeammates(list));

        // ??$$$ — Listen: another teammate sent a message + got AI response
        //         MERGE messages instead of replace to prevent overwriting own history
        ideationSocket.on("ideation_update", ({ session }) => {
            if (!session) return;
            if (session.messages?.length) {
                setMessages(prev => mergeMessages(prev, session.messages));
            }
            if (session.blueprint) {
                setBlueprint(prev => {
                    const bp = session.blueprint;
                    return {
                        ...prev,
                        techStack:           Array.isArray(bp.techStack) && bp.techStack.length > 0 ? bp.techStack : prev.techStack,
                        folderStructure:     (typeof bp.folderStructure === "string" && bp.folderStructure) || prev.folderStructure,
                        hostingInstructions: (typeof bp.hostingInstructions === "string" && bp.hostingInstructions) || prev.hostingInstructions,
                        codeMePreview:       (typeof bp.codeMePreview === "string" && bp.codeMePreview) || prev.codeMePreview,
                    };
                });
            }
            if (session.nodes?.length) setNodes(session.nodes.map(n => ({ ...n, type: "custom" })));
            if (session.edges?.length) setEdges(session.edges);
            if (session.conflicts?.length) setConflicts(session.conflicts);
        });

        // ??$$$ — Listen: existing member asked to re-broadcast (catch-up for new joiner)
        ideationSocket.on("ideation_need_sync", () => {
            const current = messagesRef.current;
            if (!current?.length) return;
            ideationSocket.emit("ideation_sync", {
                repoSlug: repoSlugRef.current,
                senderUsername: myUsernameRef.current,
                session: { messages: current }
            });
        });

        // ??$$$ — Listen: typing indicator from teammates
        ideationSocket.on("ideation_user_typing", ({ username, isTyping }) => {
            setSomeoneTyping(isTyping ? username : null);
        });

        // ??$$$ — Listen: conflict dismissed by any teammate
        ideationSocket.on("ideation_conflict_dismissed", ({ conflictId }) => {
            setDismissedConflicts(prev => new Set([...prev, conflictId]));
        });

        return () => {
            ideationSocket.off("ideation_teammates");
            ideationSocket.off("ideation_update");
            ideationSocket.off("ideation_need_sync");
            ideationSocket.off("ideation_user_typing");
            ideationSocket.off("ideation_conflict_dismissed");
        };
    }, [repoSlug, setNodes, setEdges, myUsername]);

    // ??$$$ — Save logic (manual or automatic)
    const saveToCloud = useCallback(async (currentData) => {
        setSaveStatus("saving");
        try {
            await axios.post("http://localhost:5000/api/hackathon/session", {
                repoName: repoSlug,
                ...currentData
            });
            setSaveStatus("saved");
        } catch (e) {
            console.error("Cloud save failed:", e);
            setSaveStatus("error");
        }
    }, [repoSlug]);

    // ??$$$ — Persist session to repo-specific local key + Cloud Save (Debounced)
    useEffect(() => {
        const dataObj = { messages, blueprint, nodes, edges, teamSize, hackHours, fileDrafts, uiPreview };
        const dataStr = JSON.stringify(dataObj);
        
        // Save to repo-specific localStorage to survive hard refreshes
        localStorage.setItem(activeKey, dataStr);

        const timeout = setTimeout(() => {
            // ??$$$ ONLY save to cloud if the user has actually interacted or generated something.
            // This prevents overwriting the cloud state with the default empty template on mount!
            if (messages.length > 1 || nodes.length > 0 || blueprint.techStack?.length > 0) {
                saveToCloud(dataObj);
            }
        }, 1500);
        
        return () => clearTimeout(timeout);
    }, [messages, blueprint, nodes, edges, teamSize, hackHours, activeKey, saveToCloud, fileDrafts, uiPreview]);

    // ??$$$ — State: UI controls (Restored)
    const [activeTab, setActiveTab] = useState("techStack");
    const [compiling, setCompiling] = useState(false);
    const [compileError, setCompileError] = useState("");

    // ??$$$ — Scorecard
    const [scorecard, setScorecard] = useState(null);
    const [scorecardLoading, setScorecardLoading] = useState(false);

    // ??$$$ — Rename node modal
    const [renameNode, setRenameNode] = useState(null); // { id, label }

    // ??$$$ — Tech stack tag management
    const [newTag, setNewTag] = useState("");

    const chatEndRef = useRef(null);
    const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    useEffect(() => { scrollToBottom(); }, [messages]);

    // ??$$$ — Switch to graph tab when nodes arrive
    useEffect(() => { if (nodes.length > 0) setActiveTab("graph"); }, [nodes.length]);

    // ??$$$ — Keep editableCodeMe in sync when blueprint.codeMePreview updates from AI
    useEffect(() => {
        if (blueprint.codeMePreview) setEditableCodeMe(blueprint.codeMePreview);
    }, [blueprint.codeMePreview]);

    // ??$$$ — ReactFlow: connect new edges manually
    const onConnect = useCallback(
        (params) => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
        [setEdges]
    );

    // ??$$$ — Double-click node to rename
    const onNodeDoubleClick = useCallback((_e, node) => {
        setRenameNode({ id: node.id, label: node.data.label });
    }, []);

    const commitRename = () => {
        setNodes(nds => nds.map(n =>
            n.id === renameNode.id ? { ...n, data: { ...n.data, label: renameNode.label } } : n
        ));
        setRenameNode(null);
    };

    // ??$$$ — Run conflict detection after each AI response (debounced, non-blocking)
    const runConflictCheck = useCallback(async (currentMessages, currentBlueprint) => {
        if (currentMessages.length < 4) return; // not enough context yet
        setConflictCheckLoading(true);
        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/detect-conflicts", {
                messages: currentMessages,
                blueprint: currentBlueprint
            });
            if (res.data?.conflicts?.length > 0) {
                setConflicts(res.data.conflicts);
            }
        } catch (e) {
            // Silently fail — conflicts are non-critical
        } finally {
            setConflictCheckLoading(false);
        }
    }, []);

    // ??$$$ — Parse @mentions from a message
    const parseMentions = (text) => {
        const found = [];
        const re = /@(\w+)/g;
        let m;
        while ((m = re.exec(text)) !== null) found.push(m[1].toLowerCase());
        return found;
    };

    // ??$$$ — Upload image attachment
    const handleImageUpload = async (file) => {
        if (!file) return;
        setImageUploadLoading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await axios.post("http://localhost:5000/api/upload", formData, {
                headers: { "Content-Type": "multipart/form-data" }
            });
            const imageUrl = res.data?.url || res.data?.fileUrl || null;
            if (!imageUrl) return;

            const imgMsg = { role: "user", content: "", sender: myUsername, ts: Date.now(), imageUrl };
            const newHistory = [...messages, imgMsg];
            setMessages(newHistory);

            // Immediately broadcast so teammates see image
            ideationSocket.emit("ideation_sync", { repoSlug, senderUsername: myUsername, session: { messages: newHistory } });
            // Save to cloud silently
            saveToCloud({ messages: newHistory, blueprint, nodes, edges, teamSize, hackHours, fileDrafts, uiPreview });
        } catch (e) {
            console.error("Image upload failed:", e.message);
        } finally {
            setImageUploadLoading(false);
            if (imageInputRef.current) imageInputRef.current.value = "";
        }
    };

    // ??$$$ — Insert @mention into input at cursor position
    const insertMention = (name) => {
        const atIdx = input.lastIndexOf("@");
        const newVal = input.slice(0, atIdx) + `@${name} `;
        setInput(newVal);
        setMentionDropdown([]);
        setTimeout(() => inputRef.current?.focus(), 0);
    };

    // ??$$$ — Send chat message — with mention parsing, immediate socket, argument detection
    const handleSend = async (text) => {
        const msg = text || input;
        if (!msg.trim()) return;

        // Inject hackathon context into first user message
        const contextNote = `[Context: ${teamSize} devs, ${hackHours}h hackathon] `;
        const finalContent = messages.length === 1 ? contextNote + msg : msg;

        const newMsg = { role: "user", content: finalContent, sender: myUsername, ts: Date.now() };
        const newHistory = [...messages, newMsg];
        setMessages(newHistory);
        setInput("");
        setMentionDropdown([]);

        // ??$$$ — IMMEDIATELY broadcast to teammates (smooth / real-time)
        ideationSocket.emit("ideation_sync", { repoSlug, senderUsername: myUsername, session: { messages: newHistory } });
        ideationSocket.emit("ideation_typing", { repoSlug, username: myUsername, isTyping: false });

        // ??$$$ — Parse @mentions
        const mentions = parseMentions(finalContent);
        const mentionsAI = mentions.includes("ai") || mentions.includes("bot") || finalContent.toLowerCase().includes("@ai");
        const mentionsOnlyUsers = mentions.length > 0 && !mentionsAI;

        // ??$$$ — If message is directed @user only (no @ai) — skip AI, just save + broadcast
        if (mentionsOnlyUsers) {
            saveToCloud({ messages: newHistory, blueprint, nodes, edges, teamSize, hackHours, fileDrafts, uiPreview });
            return;
        }

        // ??$$$ — Argument detection: 2+ senders rapid-fire in last 8 messages
        const recentUserMsgs = messages.slice(-8).filter(m => m.role === "user");
        const uniqueSenders = new Set(recentUserMsgs.map(m => m.sender));
        const isArgument = uniqueSenders.size >= 2 && recentUserMsgs.length >= 4 && mentionsAI;

        setLoading(true);
        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/chat", {
                messages: newHistory,
                isArgument
            });
            const data = res.data;

            const replyText = typeof data.reply === "string" ? data.reply : "Processing...";

            let newBP = blueprint;
            if (data.blueprint) {
                const bp = data.blueprint;
                newBP = {
                    techStack:           Array.isArray(bp.techStack) && bp.techStack.length > 0 ? bp.techStack : blueprint.techStack,
                    folderStructure:     (typeof bp.folderStructure === "string" && bp.folderStructure) || blueprint.folderStructure,
                    hostingInstructions: (typeof bp.hostingInstructions === "string" && bp.hostingInstructions) || blueprint.hostingInstructions,
                    codeMePreview:       (typeof bp.codeMePreview === "string" && bp.codeMePreview) || blueprint.codeMePreview,
                };
                setBlueprint(newBP);

                if (bp.graph && Array.isArray(bp.graph.nodes) && bp.graph.nodes.length > 0) {
                    setNodes(bp.graph.nodes.map(n => ({ ...n, type: "custom" })));
                    setEdges(bp.graph.edges || []);
                }
            }

            const finalMessages = [...newHistory, { role: "ai", content: replyText, ts: Date.now() }];
            setMessages(finalMessages);

            // ??$$$ — Broadcast AI response to teammates
            ideationSocket.emit("ideation_sync", { repoSlug, senderUsername: myUsername, session: { messages: finalMessages, blueprint: newBP } });

            if (finalMessages.length % 5 === 0) runConflictCheck(finalMessages, newBP);

        } catch {
            setMessages([...newHistory, { role: "ai", content: "⚠️ Couldn't reach AI. Check GEMINI_API_KEY in backend .env." }]);
        } finally {
            setLoading(false);
        }
    };

    // ??$$$ — Regenerate graph prompt
    const handleRegenerateGraph = () => {
        const msg = "Please regenerate the architecture graph based on everything we've discussed so far.";
        setInput(msg);
        handleSend(msg);
    };

    // ??$$$ — Compile & create repo (sends custom edited CodeME)
    // ??$$$ — Compile & create repo. Does NOT wipe session so user can come back and re-push.
    const [compileSuccess, setCompileSuccess] = useState(null); // { repoUrl }
    const handleCompileAndCreate = async () => {
        if (!newRepo) { setCompileError("No repo metadata. Start from the 'Create Repo' modal."); return; }
        if (!editableCodeMe.trim()) { setCompileError("CodeME.md is empty. Generate it first."); return; }
        try {
            setCompiling(true);
            setCompileError("");
            setCompileSuccess(null);
            const res = await axios.post("http://localhost:5000/api/hackathon/compile-and-push", {
                messages, nodes, edges, newRepo,
                customCodeMe: editableCodeMe,
                blueprint          // ??$$$ — pass blueprint so AI has all sections if fallback needed
            }, { timeout: 120000 }); // ??$$$ — Increase timeout for heavy AI generation
            // ??$$$ — Show success inline instead of navigating away
            //  User can keep chatting, editing, and re-push with updated CodeME
            setCompileSuccess({ repoUrl: res.data?.repo?.html_url });
        } catch (e) {
            setCompileError(e?.response?.data?.error || "Failed to compile.");
        } finally {
            setCompiling(false);
        }
    };

    // ??$$$ — Generate the full God-Prompt CodeME.md via dedicated endpoint
    const [generatingCodeMe, setGeneratingCodeMe] = useState(false);
    const handleGenerateCodeMe = async () => {
        if (messages.length < 2) { alert("Chat with the CTO first before generating the spec."); return; }
        try {
            setGeneratingCodeMe(true);
            setActiveTab("codeMePreview"); // ??$$$ — Switch to tab immediately so user sees the "Generating..." state
            const res = await axios.post("http://localhost:5000/api/hackathon/generate-codeme", {
                messages, nodes, edges, 
                blueprint: { ...blueprint, uiPreview } // ??$$$ — strictly pass the latest UI vision mockup
            }, { timeout: 120000 }); // ??$$$ — High fidelity takes time
            setEditableCodeMe(res.data.content);
            setBlueprint(b => ({ ...b, codeMePreview: res.data.content }));
            
            // ??$$$ — SCALE TIP: Celebrate the speed!
            if (res.data.isCached) {
                console.log("Instant blueprint served from cache library.");
                // You could add a toast or badge here
            }
        } catch (e) {
            alert(e?.response?.data?.error || "CodeME generation failed.");
        } finally {
            setGeneratingCodeMe(false);
        }
    };

    // ??$$$ — Fetch AI Scorecard
    const handleScorecard = async () => {
        setScorecardLoading(true);
        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/scorecard", { messages, blueprint });
            setScorecard(res.data);
        } catch {
            alert("Scorecard generation failed. Try again after the AI has enough context.");
        } finally {
            setScorecardLoading(false);
        }
    };

    // ??$$$ — Tech stack tag management (null-safe)
    const removeTag = (idx) => setBlueprint(b => ({ ...b, techStack: (b.techStack || []).filter((_, i) => i !== idx) }));
    const addTag = () => {
        if (!newTag.trim()) return;
        setBlueprint(b => ({ ...b, techStack: [...(b.techStack || []), newTag.trim()] }));
        setNewTag("");
    };

    // ??$$$ — Has data indicator per tab (null-safe — AI now returns null in Phase 1/2)
    const hasData = {
        techStack:           Array.isArray(blueprint?.techStack) && blueprint.techStack.length > 0,
        folderStructure:     typeof blueprint?.folderStructure === "string" && blueprint.folderStructure.length > 0,
        hostingInstructions: typeof blueprint?.hostingInstructions === "string" && blueprint.hostingInstructions.length > 0,
        codeMePreview:       (typeof blueprint?.codeMePreview === "string" && blueprint.codeMePreview.length > 0) || (typeof editableCodeMe === "string" && editableCodeMe.length > 0),
        graph:               nodes.length > 0,
    };

    // ??$$$ — Draft file code (AI Factory)
    const handleDraftFile = async (fileName) => {
        if (!fileName) return;
        setIsDrafting(true);
        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/draft-file", {
                messages,
                blueprint,
                fileName
            });
            setFileDrafts(prev => ({ ...prev, [fileName]: res.data.code }));
        } catch (e) {
            alert("Drafting failed: " + (e.response?.data?.error || e.message));
        } finally {
            setIsDrafting(false);
        }
    };

    // ??$$$ — Generate UI Preview (The Vision)
    const handleGenerateUi = async () => {
        setIsGeneratingUi(true);
        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/generate-ui-preview", {
                messages,
                blueprint
            });
            setUiPreview(res.data.html);
        } catch (e) {
            alert("Vision generation failed.");
        } finally {
            setIsGeneratingUi(false);
        }
    };

    // ======================================================
    //  TAB RENDERERS
    // ======================================================
    const renderTab = () => {
        // --- GRAPH ---
        if (activeTab === "graph") {
            return nodes.length > 0 ? (
                <div className="relative w-full h-full">
                    <ReactFlow
                        nodes={nodes} edges={edges}
                        nodeTypes={nodeTypes}
                        edgeTypes={edgeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onConnect={onConnect}
                        onNodeDoubleClick={onNodeDoubleClick}
                        fitView
                    >
                        <Background color="#2A2A2A" gap={20} />
                        <Controls />
                        <MiniMap style={{ background: "#111" }} nodeColor="#4F46E5" />
                    </ReactFlow>

                    {/* Floating toolbar on graph */}
                    <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                        <button onClick={handleRegenerateGraph} title="Regenerate graph"
                            className="p-2 bg-[#1A1A1A] border border-white/10 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition">
                            <RefreshCw size={15} />
                        </button>
                        <button onClick={() => {
                            const data = JSON.stringify({ nodes, edges }, null, 2);
                            downloadFile("graph.json", data);
                        }} title="Export graph JSON"
                            className="p-2 bg-[#1A1A1A] border border-white/10 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition">
                            <Download size={15} />
                        </button>
                    </div>

                    {/* Double-click rename modal */}
                    {renameNode && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
                            <div className="bg-[#1A1A1A] border border-white/10 rounded-xl p-6 w-72">
                                <p className="text-sm font-bold mb-3">Rename Node</p>
                                <input autoFocus className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-sm outline-none focus:border-purple-500 mb-3"
                                    value={renameNode.label}
                                    onChange={e => setRenameNode(r => ({ ...r, label: e.target.value }))}
                                    onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setRenameNode(null); }}
                                />
                                <div className="flex gap-2">
                                    <button onClick={() => setRenameNode(null)} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
                                    <button onClick={commitRename} className="flex-1 py-2 bg-purple-600 rounded-lg text-sm font-bold">Save</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <EmptyState icon={<Network size={40} className="opacity-30" />}
                    label="No graph yet."
                    hint='Say "generate the architecture graph" or click the quick prompt.' />
            );
        }

        // --- TECH STACK ---
        if (activeTab === "techStack") {
            return (
                <div className="p-6 space-y-3 overflow-auto h-full">
                    <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-4">Tech Stack</h3>
                    {(!blueprint.techStack || blueprint.techStack.length === 0) && (
                        <p className="text-xs text-gray-600 text-center py-8">No stack defined yet. Chat with the CTO to lock the tech choices.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {(blueprint.techStack || []).map((t, i) => (
                            <div key={i} className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-full px-3 py-1 text-sm text-indigo-200">
                                {t}
                                <button onClick={() => removeTag(i)} className="text-indigo-400 hover:text-red-400 transition ml-1">
                                    <X size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                    {/* ??$$$ — Add custom tag */}
                    <div className="flex gap-2 pt-3">
                        <input
                            className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-2 text-sm outline-none focus:border-indigo-500 placeholder-gray-600"
                            placeholder="Add tech (e.g. Prisma, Redis...)"
                            value={newTag}
                            onChange={e => setNewTag(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && addTag()}
                        />
                        <button onClick={addTag} className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg transition">
                            <Plus size={16} />
                        </button>
                    </div>
                </div>
            );
        }

        // --- FOLDER STRUCTURE (VIRTUAL FILE EXPLORER) ---
        if (activeTab === "folderStructure") {
            const lines = (typeof blueprint.folderStructure === "string" ? blueprint.folderStructure : "").split(/\n|\\n/).filter(l => l.trim() && !l.includes("📁"));
            // Simple logic to find filenames (usually ending in .js, .jsx, .json, .css etc)
            const files = lines.map(l => l.trim().split(" ").pop()).filter(f => f && typeof f === "string" && f.includes("."));

            return blueprint.folderStructure ? (
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#111]">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Plan Explorer</h3>
                        <span className="text-[9px] text-gray-600 bg-white/5 px-2 py-0.5 rounded">Virtual Structure</span>
                    </div>
                    
                    <div className="flex-1 flex overflow-hidden">
                        {/* File Tree */}
                        <div className="w-1/3 border-r border-white/5 bg-[#0D0D0D] overflow-auto p-4 space-y-1">
                            {files.length === 0 && <p className="text-[10px] text-gray-700 italic">No files detected. Chat more to refine structure.</p>}
                            {files.map((file, i) => (
                                <button 
                                    key={i}
                                    onClick={() => setSelectedFile(file)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs transition flex items-center gap-2 group ${
                                        selectedFile === file ? "bg-purple-500/20 text-purple-300" : "text-gray-400 hover:bg-white/5"
                                    }`}
                                >
                                    <FileText size={12} className={selectedFile === file ? "text-purple-400" : "text-gray-600"} />
                                    <span className="truncate">{file}</span>
                                    {fileDrafts[file] && <div className="ml-auto w-1 h-1 rounded-full bg-emerald-500" />}
                                </button>
                            ))}
                        </div>

                        {/* Code Preview */}
                        <div className="flex-1 bg-black overflow-auto relative">
                            {selectedFile ? (
                                <div className="h-full flex flex-col">
                                    <div className="p-3 border-b border-white/5 flex items-center justify-between bg-[#080808]">
                                        <span className="text-xs font-mono text-gray-500">{selectedFile}</span>
                                        <button 
                                            onClick={() => handleDraftFile(selectedFile)}
                                            disabled={isDrafting}
                                            className="text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full border border-purple-500/20 transition disabled:opacity-50"
                                        >
                                            {isDrafting ? <Loader size={10} className="animate-spin inline mr-1" /> : <Zap size={10} className="inline mr-1" />}
                                            {fileDrafts[selectedFile] ? "Re-draft Implementation" : "Draft Implementation"}
                                        </button>
                                    </div>
                                    <div className="flex-1 p-4 font-mono text-[11px] leading-relaxed text-gray-400 whitespace-pre overflow-auto">
                                        {fileDrafts[selectedFile] || (
                                            <div className="h-full flex flex-col items-center justify-center text-gray-700 gap-2 opacity-50">
                                                <Code2 size={24} />
                                                <p>Code not drafted yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-gray-700 gap-3 opacity-30">
                                    <ArrowLeft size={30} />
                                    <p className="text-sm">Select a file from the list to draft implementation.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                <EmptyState icon={<FolderTree size={40} className="opacity-30" />} label="Folder scaffold not yet generated." hint="Lock the tech stack first." />
            );
        }

        // --- VISION (UI PREVIEW) ---
        if (activeTab === "vision") {
            return (
                <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
                    <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#111] shrink-0">
                        <div className="flex items-center gap-2">
                            <Eye size={14} className="text-purple-400" />
                            <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Interactive Vision</h3>
                        </div>
                        <button 
                            onClick={handleGenerateUi}
                            disabled={isGeneratingUi}
                            className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg font-bold transition flex items-center gap-2 disabled:opacity-50"
                        >
                            {isGeneratingUi ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                            {uiPreview ? "Regenerate Vision" : "Magic Generate UI"}
                        </button>
                    </div>

                    <div className="flex-1 relative bg-white/2 overflow-hidden">
                        {uiPreview ? (
                            <iframe 
                                title="App Preview"
                                srcDoc={`
                                    <html>
                                        <head>
                                            <script src="https://cdn.tailwindcss.com"></script>
                                            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
                                            <style>body { font-family: 'Inter', sans-serif; }</style>
                                        </head>
                                        <body class="bg-black text-white">
                                            ${uiPreview}
                                        </body>
                                    </html>
                                `}
                                className="w-full h-full border-none"
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-12 gap-4">
                                <div className="p-6 bg-purple-500/5 rounded-full border border-purple-500/20">
                                    <Eye size={40} className="text-purple-400 opacity-50" />
                                </div>
                                <div className="max-w-xs">
                                    <p className="text-sm text-gray-400 font-bold">See your app before it exists.</p>
                                    <p className="text-xs text-gray-600 mt-2">Click the button above to generate a full Tailwind CSS mockup of your dashboard.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        // --- HOSTING (CLOUD LAUNCHPAD) ---
        if (activeTab === "hostingInstructions") {
            const repoUrl = compileSuccess?.repoUrl;

            return (
                <div className="p-6 flex flex-col h-full overflow-hidden bg-[#0A0A0A]">
                    <div className="mb-6">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">Cloud Launchpad</h3>
                        <p className="text-xs text-gray-600">Ship your project to production in one click.</p>
                    </div>

                    {/* Stage 1: Github Requirement */}
                    {!repoUrl && (
                        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 flex gap-3 items-center mb-6">
                            <Star size={18} className="text-yellow-500 shrink-0" />
                            <p className="text-xs text-gray-400">
                                <span className="font-bold text-yellow-500">Action Required:</span> You must push your repository to GitHub before you can deploy.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Vercel Card */}
                        <div className={`p-4 rounded-xl border transition-all ${
                            repoUrl ? "bg-white/5 border-white/10 hover:border-purple-500/50" : "bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed"
                        }`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-white rounded flex items-center justify-center">
                                        <svg viewBox="0 0 76 65" className="w-4 h-4 text-black fill-current"><path d="M37.5274 0L75.0548 65L0 65L37.5274 0Z"/></svg>
                                    </div>
                                    <span className="text-sm font-bold">Vercel</span>
                                </div>
                                <div className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Fastest</div>
                            </div>
                            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">Best for Frontend & Static projects. Instant global Edge deployment.</p>
                            <a 
                                href={repoUrl ? `https://vercel.com/new/clone?repository-url=${encodeURIComponent(repoUrl)}` : "#"} 
                                target="_blank" rel="noreferrer"
                                className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                                    repoUrl ? "bg-white text-black hover:bg-gray-200" : "bg-gray-800 text-gray-600 pointer-events-none"
                                }`}
                            >
                                {repoUrl ? "Deploy to Vercel" : "Push to GitHub First"}
                                {repoUrl && <ArrowLeft size={12} className="rotate-180" />}
                            </a>
                        </div>

                        {/* Render Card */}
                        <div className={`p-4 rounded-xl border transition-all ${
                            repoUrl ? "bg-white/5 border-white/10 hover:border-sky-500/50" : "bg-white/[0.02] border-white/5 opacity-50 cursor-not-allowed"
                        }`}>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 bg-sky-600 rounded flex items-center justify-center flex-col gap-0.5">
                                        <div className="w-4 h-0.5 bg-white rounded-full"></div>
                                        <div className="w-3 h-0.5 bg-white/60 rounded-full"></div>
                                    </div>
                                    <span className="text-sm font-bold">Render</span>
                                </div>
                                <div className="text-[10px] text-sky-400 font-bold bg-sky-500/10 px-2 py-0.5 rounded">Fullstack</div>
                            </div>
                            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">Best for Node.js Backends & Databases. Auto-scaling included.</p>
                            <a 
                                href={repoUrl ? `https://render.com/deploy?repo=${encodeURIComponent(repoUrl)}` : "#"} 
                                target="_blank" rel="noreferrer"
                                className={`w-full py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 ${
                                    repoUrl ? "bg-sky-600 text-white hover:bg-sky-500" : "bg-gray-800 text-gray-600 pointer-events-none"
                                }`}
                            >
                                {repoUrl ? "Deploy to Render" : "Push to GitHub First"}
                                {repoUrl && <ArrowLeft size={12} className="rotate-180" />}
                            </a>
                        </div>
                    </div>

                    {/* Custom Plan (Original AI Instructions) — ??$$$ null-safe: only if it's a real string */}
                    {blueprint.hostingInstructions && typeof blueprint.hostingInstructions === "string" && (
                        <div className="mt-8 pt-8 border-t border-white/5">
                            <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">AI Recommended Strategy</h4>
                            <div className="space-y-3">
                                {(blueprint.hostingInstructions?.split?.(". ") || []).filter(Boolean).map((line, i) => (
                                    <div key={i} className="flex items-start gap-3 bg-white/2 rounded-lg p-3">
                                        <Circle size={4} className="text-purple-500 mt-2 shrink-0 fill-purple-500" />
                                        <span className="text-[11px] text-gray-400 leading-relaxed">{line.trim()}.</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // --- CODEME PREVIEW (EDITABLE) ---
        if (activeTab === "codeMePreview") {
            return (
                <div className="p-5 h-full flex flex-col gap-3 overflow-hidden">
                    <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
                        <h3 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">CodeME.md</h3>
                        <div className="flex gap-2 flex-wrap">
                            {/* ??$$$ — Generate Full CodeME from backend God Prompt */}
                            <button
                                onClick={handleGenerateCodeMe}
                                disabled={generatingCodeMe || messages.length < 2}
                                title="Generate full detailed CodeME.md spec"
                                className="flex items-center gap-1.5 text-xs bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 text-purple-300 rounded-lg px-3 py-1.5 transition disabled:opacity-30"
                            >
                                {generatingCodeMe ? <Loader size={11} className="animate-spin" /> : <Sparkles size={11} />}
                                {generatingCodeMe ? "Generating..." : "Generate Full CodeME"}
                            </button>
                            <button
                                onClick={() => downloadFile("CodeME.md", editableCodeMe)}
                                disabled={!editableCodeMe}
                                title="Download as file"
                                className="flex items-center gap-1.5 text-xs bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg px-3 py-1.5 transition disabled:opacity-30"
                            >
                                <Download size={11} /> Export
                            </button>
                        </div>
                    </div>

                    {/* ??$$$ — Fully editable textarea */}
                    <textarea
                        className="flex-1 text-xs text-gray-300 bg-[#0C0C0C] border border-white/8 rounded-xl p-4 font-mono resize-none outline-none focus:border-purple-500 leading-relaxed transition overflow-auto"
                        placeholder="Click 'Generate Full CodeME' or chat more with the CTO — this will auto-populate with a detailed 12-section spec."
                        value={editableCodeMe}
                        onChange={e => setEditableCodeMe(e.target.value)}
                        spellCheck={false}
                    />

                    {/* ??$$$ — Success banner: stays on page so user can keep iterating */}
                    {compileSuccess && (
                        <div className="shrink-0 bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                                <span>✅ Pushed!</span>
                                {compileSuccess.repoUrl && (
                                    <a href={compileSuccess.repoUrl} target="_blank" rel="noreferrer"
                                        className="underline text-xs text-emerald-300 hover:text-white">
                                        View on GitHub →
                                    </a>
                                )}
                            </div>
                            <button onClick={() => navigate("/home")} className="text-xs text-gray-500 hover:text-white transition">
                                Go to Repos
                            </button>
                        </div>
                    )}

                    {newRepo && (
                        <div className="shrink-0 space-y-2">
                            {compileError && (
                                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">{compileError}</div>
                            )}
                            <button
                                onClick={handleCompileAndCreate}
                                disabled={compiling || !editableCodeMe.trim()}
                                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-40"
                            >
                                {compiling ? <Loader className="animate-spin" size={15} /> : <Code2 size={15} />}
                                {compileSuccess
                                    ? (compiling ? "Re-pushing..." : "Re-push Updated CodeME.md")
                                    : (compiling ? "Creating Repository..." : "Compile & Create Repository")}
                            </button>
                        </div>
                    )}
                </div>
            );
        }


        return null;
    };

    return (
        <div className="h-screen flex bg-[#0C0C0C] text-white overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* =================== LEFT: BLUEPRINT PANEL =================== */}
            <div className="flex-1 flex flex-col border-r border-white/10 h-full overflow-hidden">

                {/* Panel Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#111] shrink-0">
                    <button onClick={() => navigate("/home")} className="p-1.5 hover:bg-white/10 rounded-lg text-gray-500 hover:text-white transition">
                        <ArrowLeft size={16} />
                    </button>
                    <Sparkles size={15} className="text-purple-400" />
                    <div className="flex flex-col">
                        <span className="font-bold text-sm leading-tight">Live Blueprint</span>
                        <div className="flex items-center gap-1.5 leading-none mt-0.5">
                            <div className={`w-1.5 h-1.5 rounded-full ${
                                saveStatus === "saving" ? "bg-yellow-400 animate-pulse" :
                                saveStatus === "saved" ? "bg-emerald-500" :
                                saveStatus === "error" ? "bg-red-500" : "bg-gray-600"
                            }`} />
                            <span className="text-[9px] uppercase tracking-tighter text-gray-500 font-bold">
                                {saveStatus === "saving" ? "Cloud Syncing..." :
                                 saveStatus === "saved" ? "Cloud Saved" :
                                 saveStatus === "error" ? "Cloud Error" : "Local Only"}
                            </span>
                        </div>
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                        {/* ??$$$ — Scorecard button */}
                        <button
                            onClick={handleScorecard}
                            disabled={scorecardLoading || messages.length < 3}
                            title="Get AI Judge Score"
                            className="flex items-center gap-1.5 text-xs bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20 rounded-lg px-3 py-1.5 transition disabled:opacity-30"
                        >
                            {scorecardLoading ? <Loader size={12} className="animate-spin" /> : <Trophy size={12} />}
                            Score
                        </button>

                        {newRepo && (
                            <span className="text-xs text-gray-500 bg-white/5 border border-white/10 rounded px-2 py-1">
                                → {newRepo.name}
                            </span>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 bg-[#0F0F0F] shrink-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all
                                    ${active
                                        ? "text-white border-b-2 border-purple-500"
                                        : "text-gray-600 hover:text-gray-300 border-b-2 border-transparent"}
                                `}
                            >
                                <Icon size={13} />
                                {tab.label}
                                {hasData[tab.id] && (
                                    <span className="absolute top-2 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-hidden bg-[#0C0C0C]">
                    {renderTab()}
                </div>
            </div>

            {/* =================== RIGHT: CHAT PANEL =================== */}
            <div className="w-[390px] flex flex-col h-full bg-[#111] shrink-0">

                {/* Chat Header */}
                <div className="px-5 py-3.5 border-b border-white/10 bg-[#151515] shrink-0">
                    <div className="flex items-center gap-2">
                        <Bot size={17} className="text-emerald-400" />
                        <span className="font-bold">AI Co-Founder</span>
                        <span className="ml-auto text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-2 py-0.5 font-bold">LIVE</span>
                    </div>

                    {/* ??$$$ — Online teammates indicator */}
                    {teammates.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            {teammates.map(t => (
                                <span key={t.username} className={`text-[10px] flex items-center gap-1 px-2 py-0.5 rounded-full font-bold ${
                                    t.username === myUsername
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                }`}>
                                    <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                                    {t.username === myUsername ? "You" : t.username}
                                </span>
                            ))}
                            {conflictCheckLoading && <span className="text-[9px] text-yellow-500 animate-pulse ml-1">Checking conflicts...</span>}
                        </div>
                    )}

                    {/* ??$$$ — Hackathon context controls */}
                    <div className="flex gap-3 mt-3">
                        <div className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
                            <UserIcon size={11} className="text-gray-500" />
                            <input
                                type="number" min={1} max={10}
                                className="bg-transparent text-xs w-full outline-none text-gray-300"
                                value={teamSize}
                                onChange={e => setTeamSize(Number(e.target.value))}
                                title="Team size"
                            />
                            <span className="text-[10px] text-gray-600">devs</span>
                        </div>
                        <div className="flex-1 bg-black border border-white/10 rounded-lg px-3 py-1.5 flex items-center gap-2">
                            <Zap size={11} className="text-gray-500" />
                            <input
                                type="number" min={4} max={72} step={4}
                                className="bg-transparent text-xs w-full outline-none text-gray-300"
                                value={hackHours}
                                onChange={e => setHackHours(Number(e.target.value))}
                                title="Hackathon duration"
                            />
                            <span className="text-[10px] text-gray-600">hours</span>
                        </div>
                        {/* Clear session */}
                        <button
                            onClick={async () => {
                                try {
                                    await axios.delete(`http://localhost:5000/api/hackathon/session/${repoSlug}`);
                                } catch {}
                                localStorage.removeItem(SESSION_KEY);
                                localStorage.removeItem(activeKey);
                                window.location.reload();
                            }}
                            title="Clear session"
                            className="p-2 bg-black border border-white/10 rounded-lg text-gray-600 hover:text-red-400 hover:border-red-500/30 transition"
                        >
                            <X size={13} />
                        </button>
                    </div>
                </div>

                {/* ??$$$ — Conflict Banner */}
                {conflicts.filter(c => !dismissedConflicts.has(c.id)).length > 0 && (
                    <div className="mx-4 mt-3 border border-yellow-500/30 bg-yellow-500/5 rounded-xl p-3 space-y-2 shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="text-yellow-400 text-[11px] font-bold uppercase tracking-wider">⚠️ Conflicts Detected</span>
                            <span className="text-[10px] text-gray-600">Fix before generating CodeME.md</span>
                        </div>
                        {conflicts.filter(c => !dismissedConflicts.has(c.id)).map(conflict => (
                            <div key={conflict.id} className="bg-[#1a1500] border border-yellow-500/20 rounded-lg p-2">
                                <div className="text-[11px] font-semibold text-yellow-300 mb-0.5">{conflict.title}</div>
                                <div className="text-[10px] text-gray-400 mb-1.5">{conflict.description}</div>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={() => {
                                            setInput(conflict.fixPrompt || conflict.fix);
                                        }}
                                        className="text-[10px] px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded-lg font-bold transition"
                                    >Fix Now ↗</button>
                                    <button
                                        onClick={() => {
                                            const newSet = new Set([...dismissedConflicts, conflict.id]);
                                            setDismissedConflicts(newSet);
                                            ideationSocket.emit("ideation_conflict_resolved", { repoSlug, conflictId: conflict.id });
                                        }}
                                        className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 text-gray-500 rounded-lg transition"
                                    >Later</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* ??$$$ — Group Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1">
                    {messages.map((m, idx) => {
                        const isMe = m.role === "user" && (m.sender === myUsername || !m.sender);
                        const isAI = m.role === "ai";
                        const prevMsg = messages[idx - 1];
                        const isSameAsPrev = prevMsg
                            && prevMsg.role === m.role
                            && prevMsg.sender === m.sender;
                        const nextMsg = messages[idx + 1];
                        const isSameAsNext = nextMsg
                            && nextMsg.role === m.role
                            && nextMsg.sender === m.sender;

                        // ??$$$ — Avatar initials (first 2 chars of username)
                        const initials = isAI ? null : (m.sender || "?").slice(0, 2).toUpperCase();
                        const timeStr = m.ts
                            ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : "";

                        return (
                            <div
                                key={idx}
                                className={`flex items-end gap-2 ${
                                    isMe ? "flex-row-reverse" : "flex-row"
                                } ${isSameAsPrev ? "mt-0.5" : "mt-4"}`}
                            >
                                {/* ??$$$ — Avatar (left for others, hidden for me) */}
                                {!isMe && (
                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mb-1 ${
                                        isAI
                                            ? "bg-emerald-700 text-emerald-200"
                                            : "bg-purple-700 text-purple-200"
                                    } ${isSameAsPrev ? "opacity-0 pointer-events-none" : ""}`}
                                        style={{ fontSize: "10px", fontWeight: 700 }}
                                    >
                                        {isAI ? <Bot size={13} /> : initials}
                                    </div>
                                )}

                                {/* ??$$$ — Bubble + name + time */}
                                <div className={`flex flex-col max-w-[78%] ${
                                    isMe ? "items-end" : "items-start"
                                }`}>
                                    {/* Sender name — only on first in a group */}
                                    {!isSameAsPrev && (
                                        <span className={`text-[10px] font-semibold mb-0.5 ${
                                            isMe ? "text-blue-400 mr-1" :
                                            isAI ? "text-emerald-400 ml-1" :
                                            "text-purple-400 ml-1"
                                        }`}>
                                            {isAI ? "AI Co-Founder" : isMe ? "You" : m.sender}
                                        </span>
                                    )}

                                    {/* Bubble */}
                                    <div className={`text-sm whitespace-pre-wrap leading-relaxed px-3.5 py-2.5 break-words ${
                                        isMe
                                            ? "bg-blue-600 text-white rounded-2xl rounded-br-none"
                                            : isAI
                                            ? "bg-[#1C1C1C] border border-white/8 text-gray-200 rounded-2xl rounded-bl-none"
                                            : "bg-purple-800/60 border border-purple-500/20 text-white rounded-2xl rounded-bl-none"
                                    }`}>
                                        {/* ??$$$ — Render image if present */}
                                        {m.imageUrl && (
                                            <img
                                                src={m.imageUrl}
                                                alt="shared"
                                                className="max-w-[220px] max-h-[200px] rounded-xl mb-1 object-cover cursor-pointer"
                                                onClick={() => window.open(m.imageUrl, "_blank")}
                                            />
                                        )}
                                        {/* ??$$$ — Highlight @mentions in message text */}
                                        {m.content && m.content.split(/(@\w+)/g).map((part, i) =>
                                            /^@\w+$/.test(part)
                                                ? <span key={i} className={`font-bold ${
                                                    part.toLowerCase() === "@ai" || part.toLowerCase() === "@bot"
                                                        ? "text-emerald-300"
                                                        : "text-yellow-300"
                                                }`}>{part}</span>
                                                : part
                                        )}
                                    </div>

                                    {/* Timestamp — only on last in a group */}
                                    {!isSameAsNext && timeStr && (
                                        <span className={`text-[9px] text-gray-700 mt-0.5 ${
                                            isMe ? "mr-1" : "ml-1"
                                        }`}>
                                            {timeStr}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* ??$$$ — Teammate typing indicator */}
                    {someoneTyping && (
                        <div className="flex items-end gap-2 mt-4">
                            <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center shrink-0" style={{ fontSize: "10px", fontWeight: 700 }}>
                                {someoneTyping.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="bg-purple-800/40 border border-purple-500/20 px-4 py-2.5 rounded-2xl rounded-bl-none">
                                <div className="flex gap-1 items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                            </div>
                        </div>
                    )}

                    {loading && (
                        <div className="flex items-start">
                            <div className="bg-[#1C1C1C] border border-white/8 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                                <Loader size={11} className="animate-spin text-emerald-400" />
                                <span className="text-xs text-gray-500">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* ??$$$ — Quick Prompt Chips */}
                <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                    {QUICK_PROMPTS.map(qp => (
                        <button
                            key={qp}
                            onClick={() => handleSend(qp)}
                            disabled={loading}
                            className="text-[11px] bg-white/5 border border-white/10 hover:bg-purple-500/20 hover:border-purple-500/40 text-gray-400 hover:text-purple-300 rounded-full px-3 py-1 transition disabled:opacity-40"
                        >
                            {qp}
                        </button>
                    ))}
                </div>

                {/* Input Box + Image Upload */}
                <div className="p-4 border-t border-white/10 bg-[#151515] shrink-0">

                    {/* ??$$$ — @mention autocomplete dropdown */}
                    {mentionDropdown.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                            {mentionDropdown.map(name => (
                                <button
                                    key={name}
                                    onMouseDown={(e) => { e.preventDefault(); insertMention(name); }}
                                    className={`text-[11px] px-2.5 py-1 rounded-full font-bold border transition ${
                                        name === "ai"
                                            ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30"
                                            : "bg-purple-500/20 border-purple-500/30 text-purple-300 hover:bg-purple-500/30"
                                    }`}
                                >
                                    @{name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ??$$$ — @ai hint when no AI trigger (Phase 1 conversations) */}
                    {messages.length > 1 && !loading && (
                        <div className="text-[9px] text-gray-700 mb-1.5">
                            Tip: type <span className="text-emerald-700 font-bold">@ai</span> to call the AI • <span className="text-yellow-700 font-bold">@teammate</span> to DM without AI responding
                        </div>
                    )}

                    <div className="flex gap-2 items-end">
                        {/* ??$$$ — Image upload button */}
                        <button
                            onClick={() => imageInputRef.current?.click()}
                            disabled={imageUploadLoading}
                            title="Send image"
                            className="p-2.5 bg-[#0C0C0C] border border-white/10 hover:border-purple-500/40 hover:bg-purple-500/10 rounded-xl text-gray-500 hover:text-purple-300 transition shrink-0 disabled:opacity-40"
                        >
                            {imageUploadLoading
                                ? <Loader size={15} className="animate-spin" />
                                : <span style={{ fontSize: 15 }}>📎</span>}
                        </button>
                        <input
                            type="file"
                            accept="image/*"
                            ref={imageInputRef}
                            className="hidden"
                            onChange={e => handleImageUpload(e.target.files?.[0])}
                        />

                        <textarea
                            ref={inputRef}
                            rows={1}
                            className="flex-1 bg-[#0C0C0C] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-500 resize-none leading-relaxed placeholder-gray-600 transition"
                            placeholder="Message the team… type @ai to call AI, @name to DM"
                            value={input}
                            onChange={e => {
                                const val = e.target.value;
                                setInput(val);
                                e.target.style.height = "auto";
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                                // Typing indicator
                                ideationSocket.emit("ideation_typing", { repoSlug, username: myUsername, isTyping: !!val.trim() });
                                // ??$$$ — @mention detection
                                const atMatch = val.match(/@(\w*)$/);
                                if (atMatch) {
                                    const q = atMatch[1].toLowerCase();
                                    const options = ["ai", ...teammates.map(t => t.username).filter(n => n !== myUsername)];
                                    setMentionDropdown(options.filter(o => o.startsWith(q)));
                                } else {
                                    setMentionDropdown([]);
                                }
                            }}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                            }}
                            style={{ minHeight: 40 }}
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={loading || (!input.trim() && !imageUploadLoading)}
                            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl disabled:opacity-40 transition shrink-0"
                        >
                            {loading ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* ??$$$ — Scorecard Modal */}
            {scorecard && <ScorecardModal scores={scorecard} onClose={() => setScorecard(null)} />}
        </div>
    );
};

export default IdeationPage;
