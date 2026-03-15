import React, { useState, useEffect, useRef } from "react";
import ReactFlow, { Background, Controls, MiniMap } from "reactflow";
import "reactflow/dist/style.css";
import axios from "axios";
import {
    ArrowLeft, Send, Sparkles, Bot, User as UserIcon,
    Code2, Loader, Cpu, FolderTree, Cloud, FileText, Network
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

// ??$$$ — NODE COLOURS BY KIND
const kindColors = {
    client:   { bg: "#1E3A5F", border: "#3B82F6", badge: "#3B82F6" },
    api:      { bg: "#1A3A2A", border: "#22C55E", badge: "#22C55E" },
    db:       { bg: "#3A1A2A", border: "#C026D3", badge: "#C026D3" },
    service:  { bg: "#2A2A1A", border: "#EAB308", badge: "#EAB308" },
    queue:    { bg: "#2A1A1A", border: "#F97316", badge: "#F97316" },
    default:  { bg: "#1A1A1A", border: "#6B7280", badge: "#6B7280" },
};

// ??$$$ — Blueprint tab definition
const TABS = [
    { id: "techStack",           label: "Tech Stack",     icon: Cpu },
    { id: "folderStructure",     label: "Folders",        icon: FolderTree },
    { id: "hostingInstructions", label: "Hosting",        icon: Cloud },
    { id: "codeMePreview",       label: "CodeME",         icon: FileText },
    { id: "graph",               label: "Graph",          icon: Network },
];

// ??$$$ — CUSTOM NODE for ReactFlow
const CustomNode = ({ data }) => {
    const colors = kindColors[data.kind] || kindColors.default;
    return (
        <div style={{
            background: colors.bg,
            border: `1.5px solid ${colors.border}`,
            borderRadius: "10px",
            padding: "10px 16px",
            minWidth: "140px",
        }}>
            <div style={{ fontSize: "11px", color: colors.badge, fontWeight: 700, marginBottom: 2, textTransform: "uppercase" }}>
                {data.kind || "node"}
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{data.label}</div>
            {data.tech && (
                <div style={{ fontSize: "11px", color: "#9CA3AF", marginTop: 2 }}>{data.tech}</div>
            )}
        </div>
    );
};

const nodeTypes = { default: CustomNode };

const IdeationPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const newRepo = location.state?.newRepo || null;

    // ??$$$ — State: chat
    const [messages, setMessages] = useState([
        { role: "ai", content: "I'm your CTO. Give me your idea — raw, unpolished. I'll shape it into a hackathon winner." }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    // ??$$$ — State: live blueprint (populated per-turn by AI)
    const [blueprint, setBlueprint] = useState({
        techStack: [],
        folderStructure: "",
        hostingInstructions: "",
        codeMePreview: "",
    });

    // ??$$$ — State: ReactFlow graph
    const [nodes, setNodes] = useState([]);
    const [edges, setEdges] = useState([]);

    // ??$$$ — State: compile to repo
    const [compiling, setCompiling] = useState(false);
    const [compileError, setCompileError] = useState("");

    // ??$$$ — State: active left panel tab
    const [activeTab, setActiveTab] = useState("techStack");

    const chatEndRef = useRef(null);
    const scrollToBottom = () => chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    useEffect(() => { scrollToBottom(); }, [messages]);

    // ??$$$ — Auto-switch to graph tab when graph arrives
    useEffect(() => {
        if (nodes.length > 0) setActiveTab("graph");
    }, [nodes]);

    const handleSendMessage = async () => {
        if (!input.trim()) return;

        const newMsg = { role: "user", content: input };
        const newHistory = [...messages, newMsg];
        setMessages(newHistory);
        setInput("");
        setLoading(true);

        try {
            const res = await axios.post("http://localhost:5000/api/hackathon/chat", { messages: newHistory });
            const data = res.data;

            // ??$$$ — Extract chat reply (handle both new structured and legacy plain formats)
            const replyText = typeof data.reply === "string" ? data.reply : JSON.stringify(data.reply);

            // ??$$$ — Update live blueprint panels from the AI's structured response
            if (data.blueprint) {
                const bp = data.blueprint;
                setBlueprint(prev => ({
                    techStack:           Array.isArray(bp.techStack) && bp.techStack.length > 0 ? bp.techStack : prev.techStack,
                    folderStructure:     bp.folderStructure  || prev.folderStructure,
                    hostingInstructions: bp.hostingInstructions || prev.hostingInstructions,
                    codeMePreview:       bp.codeMePreview    || prev.codeMePreview,
                }));

                // ??$$$ — Render ReactFlow graph if AI returned nodes+edges
                if (bp.graph && Array.isArray(bp.graph.nodes) && bp.graph.nodes.length > 0) {
                    // Tag each node so our custom renderer fires
                    setNodes(bp.graph.nodes.map(n => ({ ...n, type: "default" })));
                    setEdges(bp.graph.edges || []);
                }
            }

            setMessages([...newHistory, { role: "ai", content: replyText }]);
        } catch (e) {
            setMessages([...newHistory, { role: "ai", content: "Error connecting to AI. Check GEMINI_API_KEY in backend .env." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleCompileAndCreate = async () => {
        if (!newRepo) {
            setCompileError("No repository metadata found. Please start from the 'Create Repo' modal.");
            return;
        }
        try {
            setCompiling(true);
            setCompileError("");
            await axios.post("http://localhost:5000/api/hackathon/compile-and-push", {
                messages,
                nodes,
                edges,
                newRepo
            });
            alert("Repository created & CodeME.md pushed! 🚀");
            navigate("/home");
        } catch (e) {
            setCompileError(e?.response?.data?.error || "Failed to compile CodeME.md.");
        } finally {
            setCompiling(false);
        }
    };

    // ??$$$ — LEFT PANEL CONTENT RENDERERS
    const renderTabContent = () => {
        if (activeTab === "graph") {
            return nodes.length > 0 ? (
                <div className="w-full h-full">
                    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} nodesConnectable={false} fitView>
                        <Background color="#2A2A2A" gap={20} />
                        <Controls />
                        <MiniMap style={{ background: "#111" }} nodeColor="#4F46E5" />
                    </ReactFlow>
                </div>
            ) : (
                <EmptyState icon={<Network size={40} className="opacity-30" />} label="Graph will appear here once the AI generates it." hint='Say "generate the architecture graph" to build it.' />
            );
        }

        if (activeTab === "techStack") {
            return blueprint.techStack.length > 0 ? (
                <div className="p-6 space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Tech Stack</h3>
                    {blueprint.techStack.map((t, i) => (
                        <div key={i} className="flex items-center gap-3 bg-[#1A1A2A] border border-indigo-500/20 rounded-xl px-4 py-3">
                            <div className="w-2 h-2 rounded-full bg-indigo-400 shrink-0" />
                            <span className="text-sm font-semibold text-indigo-200">{t}</span>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState icon={<Cpu size={40} className="opacity-30" />} label="Tech stack is being determined." hint="Keep chatting with the CTO." />
            );
        }

        if (activeTab === "folderStructure") {
            return blueprint.folderStructure ? (
                <div className="p-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Folder Structure</h3>
                    <pre className="text-xs text-emerald-300 bg-[#0A1A0A] border border-emerald-500/20 rounded-xl p-4 overflow-auto leading-relaxed font-mono whitespace-pre">
                        {blueprint.folderStructure.replace(/\\n/g, "\n")}
                    </pre>
                </div>
            ) : (
                <EmptyState icon={<FolderTree size={40} className="opacity-30" />} label="Folder scaffold not yet designed." hint="Finalize your idea to generate this." />
            );
        }

        if (activeTab === "hostingInstructions") {
            return blueprint.hostingInstructions ? (
                <div className="p-6 space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Hosting Plan</h3>
                    {blueprint.hostingInstructions.split(". ").filter(Boolean).map((line, i) => (
                        <div key={i} className="flex items-start gap-3 bg-[#1A1A1A] border border-white/5 rounded-xl px-4 py-3">
                            <Cloud size={14} className="text-sky-400 mt-0.5 shrink-0" />
                            <span className="text-sm text-gray-200">{line.trim()}.</span>
                        </div>
                    ))}
                </div>
            ) : (
                <EmptyState icon={<Cloud size={40} className="opacity-30" />} label="Hosting plan not yet defined." hint="Ask the CTO: 'How should we host this?'" />
            );
        }

        if (activeTab === "codeMePreview") {
            return blueprint.codeMePreview ? (
                <div className="p-6 h-full flex flex-col">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">CodeME.md Preview</h3>
                    <pre className="flex-1 text-xs text-gray-300 bg-[#0C0C0C] border border-white/5 rounded-xl p-4 overflow-auto leading-relaxed font-mono whitespace-pre-wrap">
                        {blueprint.codeMePreview}
                    </pre>
                    {newRepo && (
                        <div className="mt-4">
                            {compileError && (
                                <div className="mb-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                    {compileError}
                                </div>
                            )}
                            <button
                                onClick={handleCompileAndCreate}
                                disabled={compiling}
                                className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                {compiling ? <Loader className="animate-spin" size={16} /> : <Code2 size={16} />}
                                {compiling ? "Compiling & Creating Repo..." : "Compile & Create Repository"}
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <EmptyState icon={<FileText size={40} className="opacity-30" />} label="CodeME.md preview will appear here." hint="Once the architecture is defined, this will auto-fill." />
            );
        }

        return null;
    };

    // ??$$$ — Compute which tabs have data (for dot indicators)
    const hasData = {
        techStack:           blueprint.techStack.length > 0,
        folderStructure:     !!blueprint.folderStructure,
        hostingInstructions: !!blueprint.hostingInstructions,
        codeMePreview:       !!blueprint.codeMePreview,
        graph:               nodes.length > 0,
    };

    return (
        <div className="h-screen flex bg-[#0C0C0C] text-white overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>

            {/* ======= LEFT PANEL: BLUEPRINT ======= */}
            <div className="flex-1 flex flex-col border-r border-white/10 h-full overflow-hidden">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 border-b border-white/10 bg-[#111] shrink-0">
                    <button
                        onClick={() => navigate("/home")}
                        className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition"
                    >
                        <ArrowLeft size={16} />
                    </button>
                    <Sparkles size={16} className="text-purple-400" />
                    <span className="font-bold text-sm text-white">Live Blueprint</span>
                    {newRepo && (
                        <span className="ml-auto text-xs text-gray-500 bg-white/5 border border-white/10 rounded px-2 py-0.5">
                            → {newRepo.name}
                        </span>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10 bg-[#0F0F0F] px-2 shrink-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        const filled = hasData[tab.id];
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all
                                    ${active
                                        ? "text-white border-b-2 border-purple-500"
                                        : "text-gray-500 hover:text-gray-300 border-b-2 border-transparent"}
                                `}
                            >
                                <Icon size={13} />
                                {tab.label}
                                {filled && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 absolute top-2 right-1.5" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto bg-[#0C0C0C]">
                    {renderTabContent()}
                </div>
            </div>

            {/* ======= RIGHT PANEL: CHAT ======= */}
            <div className="w-[380px] flex flex-col h-full bg-[#111] shrink-0">

                {/* Chat Header */}
                <div className="px-5 py-4 border-b border-white/10 bg-[#151515] shrink-0">
                    <div className="flex items-center gap-2">
                        <Bot size={18} className="text-emerald-400" />
                        <span className="font-bold">AI Co-Founder</span>
                        <span className="ml-auto text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-2 py-0.5">
                            LIVE
                        </span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">Validates idea → Locks stack → Renders graph</p>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((m, idx) => (
                        <div key={idx} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                                {m.role === "ai"
                                    ? <Bot size={12} className="text-emerald-400" />
                                    : <UserIcon size={12} className="text-blue-400" />
                                }
                                <span className="text-[10px] text-gray-600 uppercase font-bold tracking-wider">{m.role}</span>
                            </div>
                            <div className={`
                                text-sm max-w-[90%] whitespace-pre-wrap leading-relaxed rounded-2xl px-4 py-2.5
                                ${m.role === "user"
                                    ? "bg-blue-600 text-white rounded-br-sm"
                                    : "bg-[#1C1C1C] border border-white/8 text-gray-200 rounded-bl-sm"}
                            `}>
                                {m.content}
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex items-start">
                            <div className="bg-[#1C1C1C] border border-white/8 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-2">
                                <Loader size={12} className="animate-spin text-emerald-400" />
                                <span className="text-xs text-gray-400">Thinking...</span>
                            </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input */}
                <div className="p-4 border-t border-white/10 bg-[#151515] shrink-0">
                    <div className="flex gap-2 items-end">
                        <textarea
                            rows={1}
                            className="flex-1 bg-[#0C0C0C] border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-purple-500 resize-none leading-relaxed placeholder-gray-600 transition"
                            placeholder="Describe your idea..."
                            value={input}
                            onChange={e => {
                                setInput(e.target.value);
                                e.target.style.height = "auto";
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
                            }}
                            onKeyDown={e => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            disabled={loading}
                            style={{ minHeight: "40px" }}
                        />
                        <button
                            onClick={handleSendMessage}
                            disabled={loading || !input.trim()}
                            className="p-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl disabled:opacity-40 transition shrink-0"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-2 text-center">Enter to send · Shift+Enter for new line</p>
                </div>
            </div>
        </div>
    );
};

// ??$$$ — EMPTY STATE HELPER
const EmptyState = ({ icon, label, hint }) => (
    <div className="flex flex-col items-center justify-center h-full text-gray-600 p-10 text-center gap-3">
        {icon}
        <p className="text-sm font-semibold text-gray-500">{label}</p>
        <p className="text-xs text-gray-600">{hint}</p>
    </div>
);

export default IdeationPage;
