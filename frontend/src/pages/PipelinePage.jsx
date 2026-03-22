import React, { useState, useEffect } from "react";
import { ArrowLeft, ArrowRight, Loader, Zap, FolderTree, Code2, Network, FileText, CheckCircle2 } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import ReactFlow, { Background, Controls, useNodesState, useEdgesState, Handle, Position, MarkerType } from "reactflow";
import "reactflow/dist/style.css";
import axios from "axios";

// Node Styling shared for Phase 2 Architecture & Phase 4 Code Graph
const kindColors = {
    entity:     { bg: "rgba(20, 20, 20, 0.9)", border: "#10B981", badge: "#34D399" }, // Emerald for DB Entities
    controller: { bg: "rgba(20, 20, 20, 0.9)", border: "#3B82F6", badge: "#60A5FA" }, // Blue for Logic
    route:      { bg: "rgba(20, 20, 20, 0.9)", border: "#F59E0B", badge: "#FBBF24" }, // Orange for API Routes
    default:    { bg: "rgba(10, 10, 10, 0.8)", border: "rgba(255, 255, 255, 0.1)", badge: "#9CA3AF" },
};

const CustomNode = ({ data }) => {
    const c = kindColors[data.kind] || kindColors.default;
    return (
        <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 12, padding: "16px", minWidth: 200, backdropFilter: "blur(12px)", boxShadow: `0 8px 32px -8px ${c.border}40` }}>
            <Handle type="target" position={Position.Left} style={{ background: c.border, width: 8, height: 8, border: "none" }} />
            <div className="flex justify-between items-center mb-2">
                <div style={{ fontSize: 10, color: c.badge, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>
                    {data.kind || "NODE"}
                </div>
                {data.status === "implemented" && <CheckCircle2 size={12} className="text-emerald-500" />}
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{data.label}</div>
            {data.tech && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {data.tech}
            </div>}
            <Handle type="source" position={Position.Right} style={{ background: c.border, width: 8, height: 8, border: "none" }} />
        </div>
    );
};
const nodeTypes = { custom: CustomNode };

const PipelinePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const newRepo = location.state?.newRepo || null;
    const repoSlug = newRepo?.name || "global";

    // Phases: 1 (Wizard), 2 (Topology Graph), 3 (Generating File Tree), 4 (Detailed Code API Graph)
    const [phase, setPhase] = useState(1);
    
    // Phase 1 Wizard State
    const defaultMessages = [
        { role: "ai", content: "What are we building today? Describe your project vision in detail." }
    ];
    const [messages, setMessages] = useState(defaultMessages);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);

    // Phase 2 State (Topology)
    const [specJson, setSpecJson] = useState({ nodes: [], edges: [] });
    const [specSummary, setSpecSummary] = useState(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Phase 4 State (Code Graph)
    const [codeNodes, setCodeNodes, onCodeNodesChange] = useNodesState([]);
    const [codeEdges, setCodeEdges, onCodeEdgesChange] = useEdgesState([]);
    const [selectedFunction, setSelectedFunction] = useState(null);
    const [generatedFilesPath, setGeneratedFilesPath] = useState("");
    const [generatingCode, setGeneratingCode] = useState(false);

    const lastAiMessage = messages.filter(m => m.role === "ai").pop()?.content || "";
    // Clean up "[Question X/Y]" prefix for cleaner UI display
    const hideStepPrefix = (text) => text.replace(/\[Question \d+\/\d+\]\s*/i, "");

    const handleWizardSubmit = async () => {
        if (!input.trim() || loading) return;
        const newHistory = [...messages, { role: "user", content: input }];
        setMessages(newHistory);
        setInput("");
        setLoading(true);

        try {
            const res = await axios.post("http://localhost:5000/api/pipeline/chat", { messages: newHistory });

            if (res.data.isSpecLocked) {
                setSpecJson(res.data.specJson);
                setSpecSummary(res.data.specSummary);
                setNodes(res.data.specJson.nodes.map(n => ({ ...n, type: "custom" })) || []);
                setEdges(res.data.specJson.edges || []);
                setPhase(2);
            } else {
                setMessages([...newHistory, { role: "ai", content: res.data.reply }]);
            }
        } catch (e) {
            setMessages([...newHistory, { role: "ai", content: "Error communicating with architecture engine." }]);
        } finally {
            setLoading(false);
        }
    };

    const handleTopologyAmend = async () => {
        if (!input.trim() || loading) return;
        const changeRequest = `[HUMAN CHANGE REQUEST to Graph]: ${input}\n\nCurrent Graph state: ${JSON.stringify({ nodes, edges })}`;
        const newHistory = [...messages, { role: "user", content: changeRequest }];
        setMessages(newHistory);
        setInput("");
        setPhase(1); // Go back to gap finding mode
        setLoading(true);

        axios.post("http://localhost:5000/api/pipeline/chat", { messages: newHistory })
            .then(res => {
                if (res.data.isSpecLocked) {
                    setSpecJson(res.data.specJson);
                    setSpecSummary(res.data.specSummary);
                    setNodes(res.data.specJson.nodes.map(n => ({ ...n, type: "custom" })) || []);
                    setEdges(res.data.specJson.edges || []);
                    setPhase(2);
                } else {
                    setMessages([...newHistory, { role: "ai", content: res.data.reply }]);
                }
            })
            .catch(e => setMessages([...newHistory, { role: "ai", content: "Error communicating." }]))
            .finally(() => setLoading(false));
    };

    const generateCodeScaffold = async () => {
        setPhase(3);
        setLoading(true);
        try {
            // Trigger deterministic backend generation
            const res = await axios.post("http://localhost:5000/api/pipeline/generate-skeleton", { 
                repoSlug, 
                specJson 
            });

            // The backend returns a detailed API Graph mapping the code it generated
            const apiGraph = res.data.apiGraph;
            setGeneratedFilesPath(res.data.projectPath);
            
            setCodeNodes(apiGraph.nodes.map(n => ({ ...n, type: "custom" })) || []);
            setCodeEdges(apiGraph.edges.map(e => ({ ...e, animated: true })) || []);
            
            setPhase(4);
        } catch (e) {
            console.error(e);
            alert("Error generating code scaffold");
            setPhase(2); // Revert
        } finally {
            setLoading(false);
        }
    };

    const onNodeClick = (event, node) => {
        if (phase === 4) {
            setSelectedFunction(node);
        }
    };

    const handleGenerateFunction = async () => {
        if (!selectedFunction || !selectedFunction.data.fileName) return;
        setGeneratingCode(true);
        try {
            const res = await axios.post("http://localhost:5000/api/pipeline/generate-function", {
                repoSlug,
                specJson,
                nodeData: selectedFunction.data
            });
            if (res.data.success) {
                // Update graph visually to show it is implemented
                setCodeNodes(nds => nds.map(n => {
                    if (n.id === selectedFunction.id) {
                        return { ...n, data: { ...n.data, status: "implemented" } };
                    }
                    return n;
                }));
                alert(`Successfully generated and saved ${res.data.fileName}`);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to generate function code.");
        } finally {
            setGeneratingCode(false);
        }
    };

    return (
        <div className="h-screen flex bg-[#050505] text-white font-sans overflow-hidden selection:bg-white/20">
            {/* Global Header */}
            <div className="absolute top-0 inset-x-0 h-20 px-8 flex items-center justify-between z-50 pointer-events-none">
                <button onClick={() => navigate("/home")} className="pointer-events-auto group px-4 py-2 hover:bg-white/5 rounded-full flex items-center gap-3 transition-all backdrop-blur-md border border-transparent hover:border-white/10">
                    <ArrowLeft size={16} className="text-gray-400 group-hover:-translate-x-1 transition-transform" />
                    <span className="font-semibold text-sm tracking-wider uppercase text-gray-300">Hub</span>
                </button>
                <div className="flex items-center gap-2">
                    {phase === 1 && <div className="px-3 py-1 bg-white/10 rounded-full text-[10px] tracking-widest uppercase font-bold text-white border border-white/10 backdrop-blur-md">1. Ideation</div>}
                    {phase === 2 && <div className="px-3 py-1 bg-emerald-500/20 rounded-full text-[10px] tracking-widest uppercase font-bold text-emerald-400 border border-emerald-500/30 backdrop-blur-md">2. Topology</div>}
                    {phase === 4 && <div className="px-3 py-1 bg-blue-500/20 rounded-full text-[10px] tracking-widest uppercase font-bold text-blue-400 border border-blue-500/30 backdrop-blur-md">3. Code Graph</div>}
                </div>
            </div>

            {/* PHASE 1: Codex Modal Wizard */}
            {phase === 1 && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
                    <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 30%, rgba(255, 255, 255, 0.1), transparent 60%)' }} />
                    
                    <div className="w-full max-w-3xl z-10 flex flex-col items-center text-center">
                        <Zap size={32} className="text-white/20 mb-8" />
                        
                        {/* Animated Question Display */}
                        <div className="min-h-[120px] mb-12 flex flex-col items-center justify-end">
                            <h1 className="text-3xl md:text-4xl font-medium tracking-tight leading-tight text-white/90 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                {hideStepPrefix(lastAiMessage)}
                            </h1>
                        </div>

                        {/* Centered Sleek Input */}
                        <div className="w-full relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-white/0 via-white/10 to-white/0 rounded-[24px] blur-xl opacity-0 group-hover:opacity-100 transition duration-1000 group-focus-within:opacity-100"></div>
                            <div className="relative flex items-center bg-[#0d0d0d] border border-white/10 focus-within:border-white/30 rounded-3xl p-3 shadow-2xl transition-all h-[72px]">
                                <textarea 
                                    className="flex-1 bg-transparent px-6 text-lg outline-none resize-none placeholder-gray-600 custom-scrollbar text-white self-center h-[30px]"
                                    placeholder="Type your response..."
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleWizardSubmit(); } }}
                                    autoFocus
                                />
                                <button 
                                    disabled={!input.trim() || loading}
                                    onClick={handleWizardSubmit}
                                    className="shrink-0 w-12 h-12 rounded-full bg-white hover:bg-gray-200 text-black shadow-lg disabled:opacity-20 disabled:hover:bg-white flex items-center justify-center transition-all disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader size={20} className="animate-spin" /> : <ArrowRight size={20} />}
                                </button>
                            </div>
                        </div>
                        
                        <div className="mt-8 text-xs text-gray-500 uppercase tracking-widest font-semibold">
                            Press Enter to submit
                        </div>
                    </div>
                </div>
            )}

            {/* PHASE 2: Topology Architecture Graph */}
            {phase === 2 && (
                <div className="flex-1 relative w-full h-full">
                    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView>
                        <Background color="rgba(255,255,255,0.03)" gap={24} size={1.5} />
                        <Controls className="!bg-[#111] !border-white/10 fill-white !rounded-xl overflow-hidden shadow-2xl" />
                    </ReactFlow>

                    {/* Floating Command Bar at Bottom */}
                    <div className="absolute bottom-12 inset-x-0 flex justify-center z-50 pointer-events-none">
                        <div className="pointer-events-auto flex items-center gap-3 bg-[#0d0d0d]/80 backdrop-blur-2xl border border-white/10 rounded-full p-2 pr-3 shadow-2xl">
                            <input 
                                type="text"
                                className="w-[350px] bg-transparent outline-none px-5 py-3 text-sm placeholder-gray-500"
                                placeholder="E.g., Change goals to have priority levels..."
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter") handleTopologyAmend(); }}
                            />
                            <button 
                                onClick={handleTopologyAmend}
                                className="bg-white/10 hover:bg-white/20 p-3 rounded-full transition text-gray-300"
                            >
                                <Zap size={16} />
                            </button>
                            <div className="w-px h-8 bg-white/10 mx-2" />
                            <button 
                                onClick={generateCodeScaffold}
                                className="bg-emerald-500 hover:bg-emerald-400 text-black px-6 py-3 rounded-full font-bold text-sm tracking-wide transition flex items-center gap-2"
                            >
                                <FolderTree size={16} /> Finalize & Scaffold
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* PHASE 3: Loading / Scaffold Generation */}
            {phase === 3 && (
                <div className="flex-1 flex flex-col items-center justify-center">
                    <div className="w-24 h-24 mb-8 relative">
                        <div className="absolute inset-0 border-t-2 border-emerald-500 rounded-full animate-spin"></div>
                        <div className="absolute inset-2 border-r-2 border-blue-500 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
                        <div className="absolute inset-0 flex items-center justify-center"><Code2 size={24} className="text-white/50" /></div>
                    </div>
                    <h2 className="text-2xl font-medium tracking-tight">Deterministically Scaffolding Boilerplate...</h2>
                    <p className="mt-4 text-gray-500 font-mono text-sm max-w-md text-center">Creating `routes/`, `controllers/`, and `models/` without AI guessing.</p>
                </div>
            )}

            {/* PHASE 4: Detailed API Function Graph (Graph-To-Code) */}
            {phase === 4 && (
                <div className="flex-1 relative w-full h-full flex">
                    <div className="flex-1 relative">
                        <ReactFlow nodes={codeNodes} edges={codeEdges} onNodesChange={onCodeNodesChange} onEdgesChange={onCodeEdgesChange} onNodeClick={onNodeClick} nodeTypes={nodeTypes} fitView>
                            <Background color="rgba(59,130,246,0.05)" gap={24} size={1.5} />
                            <Controls className="!bg-[#111] !border-white/10 fill-white !rounded-xl" />
                        </ReactFlow>
                    </div>

                    {/* Right Panel: Graph to Code AI Context Modal (Sliding in) */}
                    {selectedFunction && (
                        <div className="w-[500px] border-l border-white/10 bg-[#0A0A0A] flex flex-col h-full shadow-2xl animate-in slide-in-from-right h-full border-r border-transparent">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] uppercase tracking-widest text-blue-400 font-bold mb-1">{selectedFunction.data.kind} Node Selected</div>
                                    <h3 className="font-semibold text-lg">{selectedFunction.data.label}</h3>
                                    <div className="text-xs text-gray-500 mt-1">{selectedFunction.data.description || "Select to write implementation."}</div>
                                </div>
                                <button onClick={() => setSelectedFunction(null)} className="p-2 hover:bg-white/10 rounded-full text-gray-400">
                                    <Zap size={16} className="rotate-45" /> {/* Use Zap as a cross icon for now */}
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-center items-center text-center opacity-60">
                                <Network size={48} className="text-gray-600 mb-6" />
                                <p className="text-sm max-w-xs mb-6">You've selected the <strong>{selectedFunction.data.label}</strong> node. The physical file exists in `<span className="font-mono text-emerald-400 pr-0.5">backend/src/generated/</span>`.</p>
                                
                                {selectedFunction.data.fileName ? (
                                    <button 
                                        onClick={handleGenerateFunction}
                                        disabled={generatingCode}
                                        className="px-6 py-3 bg-white text-black hover:bg-gray-200 disabled:opacity-50 rounded-xl font-bold flex items-center gap-2 shadow-xl transition-all"
                                    >
                                        {generatingCode ? <Loader size={16} className="animate-spin" /> : <Zap size={16} />} 
                                        {generatingCode ? "Writing Code..." : "Use AI to Write Implementation"}
                                    </button>
                                ) : (
                                    <div className="text-xs text-yellow-500 bg-yellow-500/10 px-4 py-2 rounded-lg border border-yellow-500/20">
                                        This node does not map to a specific physical file.
                                    </div>
                                )}
                                
                                <p className="text-[11px] text-gray-500 mt-4 leading-relaxed max-w-xs">
                                    This will intelligently populate the function block, handle DB queries, and automatically update corresponding frontend hooks.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Left overlay badge indicating success */}
                    <div className="absolute top-24 left-8 pointer-events-none">
                        <div className="bg-[#111]/80 backdrop-blur-md border border-white/10 rounded-xl p-4 shadow-2xl flex items-start gap-3 w-72">
                            <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-sm font-bold text-white mb-1">Boilerplate Scaffolded</h4>
                                <p className="text-xs text-gray-400 leading-relaxed font-mono truncate hover:text-clip hover:whitespace-normal">
                                    {generatedFilesPath}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PipelinePage;
