import { useEffect, useMemo, useState } from "react";
import ReactFlow, { Background, Controls, MiniMap, useEdgesState, useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import dagre from "dagre";
import axios from "axios";
import { ArrowLeft, Loader, Play, Pause, RotateCcw, FlaskConical, ExternalLink } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

const FLOW_COLORS = {
    contains: "#64748b",
    imports: "#10b981",
    calls: "#8b5cf6",
    extends: "#f59e0b"
};

const KIND_COLORS = {
    module: "#60a5fa",
    directory: "#94a3b8",
    file: "#34d399",
    symbol: "#c084fc"
};

const getLayoutedElements = (nodes, edges) => {
    if (!nodes?.length) return { nodes: [], edges: [] };

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: "LR", ranksep: 90, nodesep: 40 });

    nodes.forEach((node) => {
        const width = Number(node?.style?.width) || 240;
        const height = Number(node?.style?.height) || 64;
        g.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => g.setEdge(edge.source, edge.target));
    dagre.layout(g);

    return {
        nodes: nodes.map((node) => {
            const p = g.node(node.id) || { x: 0, y: 0 };
            const width = Number(node?.style?.width) || 240;
            const height = Number(node?.style?.height) || 64;
            return {
                ...node,
                position: { x: p.x - width / 2, y: p.y - height / 2 }
            };
        }),
        edges
    };
};

const parseJsonSafe = (input, fallback) => {
    if (!input || !String(input).trim()) return fallback;
    try {
        return JSON.parse(input);
    } catch {
        return fallback;
    }
};

const postOpenFileMessage = (docs) => {
    const targetPath = docs?.absolutePath || docs?.filePath;
    if (!targetPath) return;

    const lineStart = Number.isFinite(Number(docs?.lineStart)) ? Number(docs.lineStart) : undefined;
    const lineEndRaw = Number.isFinite(Number(docs?.lineEnd)) ? Number(docs.lineEnd) : undefined;
    const lineEnd = lineEndRaw || lineStart;

    const payload = { command: "openFile", path: targetPath, lineStart, lineEnd };
    if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, "*");
    }
    window.postMessage(payload, "*");
};

const DataFlowPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const owner = searchParams.get("owner");
    const repoName = searchParams.get("repo");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [rawGraph, setRawGraph] = useState({ nodes: [], edges: [], flows: [], routes: [], stats: null });
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [selectedFlowId, setSelectedFlowId] = useState(null);
    const [playing, setPlaying] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [speedMs, setSpeedMs] = useState(900);

    const [testMethod, setTestMethod] = useState("GET");
    const [testPath, setTestPath] = useState("/");
    const [testBaseUrl, setTestBaseUrl] = useState("http://localhost:5000");
    const [testHeaders, setTestHeaders] = useState('{\n  "Content-Type": "application/json"\n}');
    const [testBody, setTestBody] = useState("{}");
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState(null);

    const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate("/home");
    };

    useEffect(() => {
        const fetchDataFlow = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await axios.get("http://localhost:5000/api/repos/visualize/data-flow", {
                    params: { owner, repoName }
                });

                const payload = {
                    nodes: res.data?.nodes || [],
                    edges: res.data?.edges || [],
                    flows: res.data?.flows || [],
                    routes: res.data?.routes || [],
                    stats: res.data?.stats || null
                };

                setRawGraph(payload);
                const firstFlow = payload.flows[0] || null;
                setSelectedFlowId(firstFlow?.id || null);
                setSelectedNodeId(payload.nodes[0]?.id || null);

                if (payload.routes[0]) {
                    setTestMethod(payload.routes[0].method || "GET");
                    setTestPath(payload.routes[0].path || "/");
                }
            } catch (err) {
                setError(err.response?.data?.error || "Failed to load data flow graph");
            } finally {
                setLoading(false);
            }
        };

        fetchDataFlow();
    }, [owner, repoName]);

    const selectedFlow = useMemo(() => {
        return rawGraph.flows.find((f) => f.id === selectedFlowId) || null;
    }, [rawGraph.flows, selectedFlowId]);

    const selectedNode = useMemo(() => {
        return rawGraph.nodes.find((n) => n.id === selectedNodeId) || null;
    }, [rawGraph.nodes, selectedNodeId]);

    const selectedDocs = selectedNode?.docs || selectedNode?.data?.docs || {};

    useEffect(() => {
        if (!playing || !selectedFlow || !Array.isArray(selectedFlow.nodePath) || selectedFlow.nodePath.length < 2) return;

        const maxEdgeStep = selectedFlow.nodePath.length - 2;
        const timer = setInterval(() => {
            setStepIndex((prev) => {
                if (prev >= maxEdgeStep) return 0;
                return prev + 1;
            });
        }, speedMs);

        return () => clearInterval(timer);
    }, [playing, selectedFlow, speedMs]);

    useEffect(() => {
        setStepIndex(0);
        setPlaying(false);
    }, [selectedFlowId]);

    const highlightedEdgeIds = useMemo(() => {
        if (!selectedFlow || !Array.isArray(selectedFlow.nodePath)) return new Set();
        const ids = new Set();
        for (let i = 0; i <= stepIndex; i++) {
            const source = selectedFlow.nodePath[i];
            const target = selectedFlow.nodePath[i + 1];
            if (!source || !target) continue;
            ids.add(`calls:${source}->${target}`);
            ids.add(`imports:${source}->${target}`);
            ids.add(`contains:${source}->${target}`);
            ids.add(`extends:${source}->${target}`);
        }
        return ids;
    }, [selectedFlow, stepIndex]);

    const highlightedNodeIds = useMemo(() => {
        if (!selectedFlow || !Array.isArray(selectedFlow.nodePath)) return new Set();
        const ids = new Set();
        for (let i = 0; i <= stepIndex + 1; i++) {
            const id = selectedFlow.nodePath[i];
            if (id) ids.add(id);
        }
        return ids;
    }, [selectedFlow, stepIndex]);

    useEffect(() => {
        const displayNodes = (rawGraph.nodes || []).map((node) => {
            const active = highlightedNodeIds.has(node.id);
            const selected = selectedNodeId === node.id;
            return {
                ...node,
                style: {
                    ...node.style,
                    background: '#1f2937',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '8px',
                    opacity: selectedFlow ? (active ? 1 : 0.25) : 1,
                    border: selected
                        ? "2px solid rgba(255,255,255,0.95)"
                        : active
                            ? "2px solid rgba(56,189,248,0.8)"
                            : `2px solid ${KIND_COLORS[node.kind] || '#64748b'}`,
                    boxShadow: active ? "0 0 0 4px rgba(56,189,248,0.2)" : "0 4px 6px rgba(0,0,0,0.3)"
                }
            };
        });

        const displayEdges = (rawGraph.edges || []).map((edge) => {
            const active = highlightedEdgeIds.has(edge.id);
            return {
                ...edge,
                type: 'smoothstep',
                style: {
                    ...edge.style,
                    opacity: selectedFlow ? (active ? 1 : 0.12) : 1,
                    strokeWidth: active ? 3 : (edge.style?.strokeWidth || 1.6),
                    stroke: active ? "#22d3ee" : (edge.style?.stroke || FLOW_COLORS[edge.relation] || "#64748b")
                },
                animated: active ? true : edge.animated
            };
        });

        const layouted = getLayoutedElements(displayNodes, displayEdges);
        setNodes(layouted.nodes);
        setEdges(layouted.edges);
    }, [rawGraph, selectedFlow, highlightedNodeIds, highlightedEdgeIds, selectedNodeId, setNodes, setEdges]);

    const handleFlowSelect = (flowId) => {
        setSelectedFlowId(flowId);
        const route = rawGraph.routes.find((r) => r.id === flowId);
        if (route) {
            setTestMethod(route.method || "GET");
            setTestPath(route.path || "/");
        }
    };

    const handleRunTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const res = await axios.post("http://localhost:5000/api/repos/visualize/data-flow/test", {
                baseUrl: testBaseUrl,
                method: testMethod,
                path: testPath,
                headers: parseJsonSafe(testHeaders, {}),
                body: parseJsonSafe(testBody, {})
            });
            setTestResult({ ok: true, ...res.data });
        } catch (err) {
            setTestResult({
                ok: false,
                status: err.response?.status || 500,
                error: err.response?.data || err.message
            });
        } finally {
            setTesting(false);
        }
    };

    return (
        <div className="h-screen w-screen bg-[#0b1017] text-white flex flex-col">
            <div className="h-16 border-b border-white/10 px-4 bg-[#111827] flex items-center gap-3">
                <button onClick={handleBack} className="p-2 rounded-md hover:bg-white/10 text-gray-300">
                    <ArrowLeft size={18} />
                </button>
                <div>
                    <h1 className="text-sm md:text-base font-semibold">Vizualize Data Flow</h1>
                    <p className="text-[11px] text-gray-400">{owner || "-"} / {repoName || "-"}</p>
                </div>
                <div className="ml-auto flex items-center gap-2 text-xs">
                    <button
                        onClick={() => setPlaying((p) => !p)}
                        disabled={!selectedFlow}
                        className="px-3 py-1.5 rounded-md border border-white/15 hover:bg-white/10 disabled:opacity-40 inline-flex items-center gap-2"
                    >
                        {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : "Play"}
                    </button>
                    <button
                        onClick={() => { setStepIndex(0); setPlaying(false); }}
                        disabled={!selectedFlow}
                        className="px-3 py-1.5 rounded-md border border-white/15 hover:bg-white/10 disabled:opacity-40 inline-flex items-center gap-2"
                    >
                        <RotateCcw size={14} /> Reset
                    </button>
                    <select
                        value={String(speedMs)}
                        onChange={(e) => setSpeedMs(Number(e.target.value))}
                        className="bg-[#0b1017] border border-white/15 rounded-md px-2 py-1.5"
                    >
                        <option value="500">Fast</option>
                        <option value="900">Normal</option>
                        <option value="1400">Slow</option>
                    </select>
                </div>
            </div>

            <div className="flex-1 min-h-0 flex">
                <aside className="w-[290px] border-r border-white/10 bg-[#0f172a] overflow-y-auto p-3 space-y-3">
                    <div className="text-xs text-gray-300 font-semibold">Flows</div>
                    {(rawGraph.flows || []).length === 0 ? (
                        <div className="text-xs text-gray-400">No API routes detected.</div>
                    ) : (
                        <div className="space-y-1">
                            {rawGraph.flows.map((flow) => (
                                <button
                                    key={flow.id}
                                    onClick={() => handleFlowSelect(flow.id)}
                                    className={`w-full text-left px-2 py-2 rounded-md border text-xs ${selectedFlowId === flow.id ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/10 text-gray-300 hover:bg-white/5"}`}
                                >
                                    {flow.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {rawGraph.stats && (
                        <div className="text-[11px] text-gray-400 border-t border-white/10 pt-3 space-y-1">
                            <div>routes: {rawGraph.stats.totalRoutes ?? "-"}</div>
                            <div>controllers: {rawGraph.stats.totalControllers ?? "-"}</div>
                            <div>models: {rawGraph.stats.totalModels ?? "-"}</div>
                            <div>nodes: {rawGraph.stats.graphNodes ?? "-"}</div>
                            <div>edges: {rawGraph.stats.graphEdges ?? "-"}</div>
                        </div>
                    )}
                </aside>

                <div className="flex-1 relative border-r border-white/10">
                    {loading && (
                        <div className="absolute inset-0 bg-[#0b1017]/80 flex items-center justify-center z-20">
                            <Loader className="animate-spin text-cyan-300" size={34} />
                        </div>
                    )}
                    {error && !loading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center">
                            <div className="bg-[#1d2430] border border-red-500/20 rounded-xl p-4 text-sm text-red-200">{error}</div>
                        </div>
                    )}

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={(_, n) => setSelectedNodeId(n.id)}
                        fitView
                        minZoom={0.2}
                        className="bg-[#0b1017]"
                    >
                        <Background color="#1f2937" gap={20} />
                        <MiniMap
                            pannable
                            zoomable
                            nodeColor={(n) => KIND_COLORS[n.kind] || "#64748b"}
                            className="!bg-[#111827] !border !border-white/10"
                            maskColor="rgba(2,6,23,0.55)"
                        />
                        <Controls className="!bg-[#111827] !border !border-white/10 !fill-white" />
                    </ReactFlow>
                </div>

                <aside className="w-[430px] max-w-[46vw] bg-[#111827] overflow-y-auto p-4 space-y-4">
                    <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                        <div className="text-sm font-semibold mb-2">Selected Node</div>
                        {!selectedNode ? (
                            <div className="text-xs text-gray-400">Click a node to inspect details.</div>
                        ) : (
                            <div className="space-y-2">
                                <div className="text-xs text-gray-300"><span className="text-gray-500">name:</span> {selectedNode.data?.label}</div>
                                <div className="text-xs text-gray-300"><span className="text-gray-500">kind:</span> {selectedNode.kind}</div>
                                {selectedDocs.filePath && <div className="text-xs text-gray-300 break-all"><span className="text-gray-500">file:</span> {selectedDocs.filePath}</div>}
                                {selectedDocs.summary && <div className="text-xs text-gray-300">{selectedDocs.summary}</div>}
                                {selectedDocs.snippetPreview && (
                                    <pre className="text-[11px] text-gray-200 bg-[#0b1017] border border-white/10 rounded p-2 overflow-auto max-h-36 whitespace-pre-wrap">{selectedDocs.snippetPreview}</pre>
                                )}
                                <button
                                    onClick={() => postOpenFileMessage(selectedDocs)}
                                    disabled={!selectedDocs.absolutePath}
                                    className="text-xs px-3 py-1.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 disabled:opacity-40 inline-flex items-center gap-2"
                                >
                                    <ExternalLink size={13} /> Open in Editor
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="border border-white/10 rounded-lg p-3 bg-black/20 space-y-3">
                        <div className="text-sm font-semibold flex items-center gap-2"><FlaskConical size={16} /> API Test</div>

                        <div className="grid grid-cols-3 gap-2">
                            <select value={testMethod} onChange={(e) => setTestMethod(e.target.value)} className="bg-[#0b1017] border border-white/10 rounded px-2 py-1.5 text-xs">
                                <option>GET</option>
                                <option>POST</option>
                                <option>PUT</option>
                                <option>PATCH</option>
                                <option>DELETE</option>
                            </select>
                            <input value={testBaseUrl} onChange={(e) => setTestBaseUrl(e.target.value)} className="col-span-2 bg-[#0b1017] border border-white/10 rounded px-2 py-1.5 text-xs" />
                        </div>

                        <input
                            value={testPath}
                            onChange={(e) => setTestPath(e.target.value)}
                            className="w-full bg-[#0b1017] border border-white/10 rounded px-2 py-1.5 text-xs"
                            placeholder="/api/path"
                        />

                        <div>
                            <div className="text-[11px] text-gray-400 mb-1">Headers (JSON)</div>
                            <textarea value={testHeaders} onChange={(e) => setTestHeaders(e.target.value)} className="w-full h-20 bg-[#0b1017] border border-white/10 rounded px-2 py-1.5 text-xs font-mono" />
                        </div>

                        <div>
                            <div className="text-[11px] text-gray-400 mb-1">Body (JSON)</div>
                            <textarea value={testBody} onChange={(e) => setTestBody(e.target.value)} className="w-full h-24 bg-[#0b1017] border border-white/10 rounded px-2 py-1.5 text-xs font-mono" />
                        </div>

                        <button onClick={handleRunTest} disabled={testing} className="text-xs px-3 py-2 rounded-md bg-cyan-500/20 border border-cyan-500/30 text-cyan-200 disabled:opacity-40">
                            {testing ? "Testing..." : "Test API"}
                        </button>

                        {testResult && (
                            <div className="border border-white/10 rounded p-2 bg-[#0b1017] text-xs">
                                <div className={`font-semibold ${testResult.ok ? "text-emerald-300" : "text-red-300"}`}>
                                    {testResult.ok ? "Success" : "Failed"} {testResult.status ? `(status ${testResult.status})` : ""}
                                </div>
                                {testResult.durationMs !== undefined && (
                                    <div className="text-gray-400 mt-1">duration: {testResult.durationMs} ms</div>
                                )}
                                <pre className="mt-2 text-[11px] text-gray-200 whitespace-pre-wrap overflow-auto max-h-56">{JSON.stringify(testResult.data || testResult.error || testResult, null, 2)}</pre>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default DataFlowPage;
