import { useEffect, useState } from 'react';
import ReactFlow, { 
    Controls, Background, useNodesState, useEdgesState, Handle, Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArrowLeft, Loader } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

// --- DEFINE NODE TYPES OUTSIDE COMPONENT ---
const CodeNode = ({ data }) => (
    <div className="bg-[#1e1e1e] border border-emerald-500/50 rounded-lg overflow-hidden shadow-2xl min-w-[300px] max-w-[500px]">
        <Handle type="target" position={Position.Top} className="!bg-emerald-500" />
        <div className="bg-[#252526] px-3 py-2 border-b border-white/10 flex justify-between items-center">
            <span className="text-emerald-400 font-mono text-xs font-bold">ƒ {data.label}</span>
        </div>
        <div className="p-0 text-[10px] max-h-[200px] overflow-y-auto custom-scrollbar">
            <SyntaxHighlighter language="javascript" style={vscDarkPlus} customStyle={{ margin: 0, padding: '10px' }}>{data.code}</SyntaxHighlighter>
        </div>
    </div>
);

const RouteNode = ({ data }) => (
    <div className="bg-[#111] border border-blue-500/50 px-4 py-2 rounded-full shadow-lg text-white font-mono text-xs font-bold">
        <Handle type="target" position={Position.Top} className="!bg-gray-500" />
        <Handle type="source" position={Position.Bottom} className="!bg-emerald-500" />
        {data.label}
    </div>
);

const FunctionNode = ({ data }) => (
    <div className="bg-[#111] border border-purple-500/50 px-4 py-2 rounded-xl shadow-lg text-white font-mono text-xs font-bold">
        <Handle type="target" position={Position.Top} className="!bg-gray-500" />
        <Handle type="source" position={Position.Bottom} className="!bg-emerald-500" />
        {data.label}
    </div>
);

const nodeTypes = { code: CodeNode, route: RouteNode, function: FunctionNode };

// --- LAYOUT ENGINE ---
const getLayoutedElements = (nodes, edges) => {
    if (!nodes || nodes.length === 0) return { nodes: [], edges: [] };

    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'BT' }); // Bottom to Top

    nodes.forEach((node) => {
        const width = Number(node?.style?.width) || 180;
        const height = Number(node?.style?.height) || 50;
        dagreGraph.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    return {
        nodes: nodes.map((node) => {
            const nodeWithPosition = dagreGraph.node(node.id);
            return {
                ...node,
                position: {
                    x: nodeWithPosition.x - 90,
                    y: nodeWithPosition.y - 25,
                },
            };
        }),
        edges,
    };
};

const ArchitecturePage = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [stats, setStats] = useState(null);
    const navigate = useNavigate();

    const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate("/home");
    };

    useEffect(() => {
        const fetchGraph = async () => {
            setLoading(true);
            setError(null);
            try {
                // Get query params
                const owner = searchParams.get("owner");
                const repoName = searchParams.get("repo"); // Map 'repo' from URL
                const path = searchParams.get("path");

                // API Endpoint Selection (Dependency vs Full Structure)
                let endpoint = "http://localhost:5000/api/repos/visualize/structure";
                let params = {};

                if (owner && repoName && path) {
                    // Dependency Mode
                    endpoint = "http://localhost:5000/api/repos/visualize/dependencies";
                    params = { owner, repoName, path };
                } else if (owner && repoName) {
                    // ✅ FIX: repo-wide visualization must still pass owner/repoName
                    params = { owner, repoName };
                }

                console.log("Fetching:", endpoint, params);

                const res = await axios.get(endpoint, { params });
                setStats(res.data?.stats || null);

                if (res.data.nodes.length === 0) {
                    setError("No structure found.");
                } else {
                    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(res.data.nodes, res.data.edges);
                    setNodes(layoutedNodes);
                    setEdges(layoutedEdges);
                }
            } catch (err) {
                console.error(err);
                setError(err.response?.data?.error || "Failed to load graph");
            } finally {
                setLoading(false);
            }
        };
        fetchGraph();
    }, [searchParams]);

    return (
        <div className="h-screen w-screen bg-[#0C0C0C] text-white flex flex-col">
            <div className="p-4 border-b border-white/10 flex items-center gap-4 bg-[#111] z-10">
                <button onClick={handleBack} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white">
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h1 className="font-bold text-lg">
                        {searchParams.get("path") ? "Dependency Graph" : "System Architecture"}
                    </h1>
                    <p className="text-xs text-gray-500 font-mono">
                        {searchParams.get("path") || "Global View"}
                    </p>
                    {stats && !searchParams.get("path") && (
                        <div className="mt-1 text-[11px] text-gray-500 font-mono">
                            <span className="text-gray-400">files:</span> {stats.totalFiles ?? "-"} 
                            <span className="mx-2">|</span>
                            <span className="text-gray-400">dirs:</span> {stats.totalDirs ?? "-"}
                            {typeof stats.totalLines === "number" && (
                                <>
                                    <span className="mx-2">|</span>
                                    <span className="text-gray-400">loc:</span> {stats.totalLines}
                                </>
                            )}
                            {stats.truncated && (
                                <>
                                    <span className="mx-2">|</span>
                                    <span className="text-yellow-400">truncated</span>
                                </>
                            )}
                        </div>
                    )}
                    {stats?.note && !searchParams.get("path") && (
                        <div className="mt-1 text-[11px] text-gray-600 font-mono">
                            {stats.note}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex-1 relative">
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#0C0C0C]/80 z-20">
                        <Loader className="animate-spin text-emerald-500" size={40} />
                    </div>
                )}

                {error && !loading && (
                    <div className="absolute inset-0 flex items-center justify-center z-20">
                        <div className="bg-[#1e1e1e] p-6 rounded-xl border border-red-500/20 text-center">
                            <p className="text-red-400 font-bold mb-2">Error</p>
                            <p className="text-gray-400 text-sm">{error}</p>
                            <button onClick={handleBack} className="mt-4 inline-block text-xs bg-white/10 px-3 py-2 rounded hover:bg-white/20">Go Back</button>
                        </div>
                    </div>
                )}

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    fitView
                    minZoom={0.1}
                    className="bg-[#0C0C0C]"
                >
                    <Background color="#333" gap={20} />
                    <Controls className="!bg-[#111] !border-white/10 !fill-white" />
                </ReactFlow>
            </div>
        </div>
    );
};

export default ArchitecturePage;
