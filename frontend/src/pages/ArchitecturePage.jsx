import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    useEdgesState,
    useNodesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import axios from 'axios';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ArrowLeft, Loader, Search, Settings, X, ExternalLink } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const SETTINGS_KEY = 'codechat.visualizer.settings.v2';

const DEFAULT_SETTINGS = {
    view: 'overview',
    langProfile: 'js-ts-deep',
    maxNodes: 6000,
    expandDepth: 0,
    snippetLines: 10,
    showContains: true,
    showImports: true,
    showCalls: true,
    showExtends: true,
    focusMode: true
};

const RELATION_COLORS = {
    contains: '#64748b',
    imports: '#10b981',
    calls: '#8b5cf6',
    extends: '#f59e0b'
};

const KIND_COLORS = {
    module: '#60a5fa',
    directory: '#94a3b8',
    file: '#34d399',
    symbol: '#c084fc'
};

const getLayoutedElements = (nodes, edges) => {
    if (!nodes?.length) return { nodes: [], edges: [] };

    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 35 });

    nodes.forEach((node) => {
        const width = Number(node?.style?.width) || 250;
        const height = Number(node?.style?.height) || 60;
        g.setNode(node.id, { width, height });
    });

    edges.forEach((edge) => g.setEdge(edge.source, edge.target));
    dagre.layout(g);

    return {
        nodes: nodes.map((node) => {
            const p = g.node(node.id) || { x: 0, y: 0 };
            const width = Number(node?.style?.width) || 250;
            const height = Number(node?.style?.height) || 60;
            return {
                ...node,
                position: {
                    x: p.x - width / 2,
                    y: p.y - height / 2
                }
            };
        }),
        edges
    };
};

const safeNumber = (value, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const normalizeSettings = (input) => {
    const raw = input || {};
    return {
        view: raw.view === 'detail' ? 'detail' : 'overview',
        langProfile: ['js-ts-deep', 'balanced', 'structure-only'].includes(raw.langProfile) ? raw.langProfile : 'js-ts-deep',
        maxNodes: Math.max(50, Math.min(6000, safeNumber(raw.maxNodes, DEFAULT_SETTINGS.maxNodes))),
        expandDepth: Math.max(0, Math.min(100, safeNumber(raw.expandDepth, DEFAULT_SETTINGS.expandDepth))),
        snippetLines: Math.max(3, Math.min(40, safeNumber(raw.snippetLines, DEFAULT_SETTINGS.snippetLines))),
        showContains: raw.showContains !== false,
        showImports: raw.showImports !== false,
        showCalls: raw.showCalls !== false,
        showExtends: raw.showExtends !== false,
        focusMode: raw.focusMode !== false
    };
};

const getNodeDocs = (node) => node?.docs || node?.data?.docs || {};

const matchesSearch = (node, query) => {
    if (!query) return true;
    const q = query.toLowerCase();
    const docs = getNodeDocs(node);

    return [
        node?.data?.label,
        node?.kind,
        docs.summary,
        docs.filePath,
        ...(Array.isArray(docs.exports) ? docs.exports : []),
        ...(Array.isArray(docs.imports) ? docs.imports : []),
        ...(Array.isArray(docs.dependents) ? docs.dependents : [])
    ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
};

const relationEnabled = (relation, settings) => {
    if (relation === 'contains') return settings.showContains;
    if (relation === 'imports') return settings.showImports;
    if (relation === 'calls') return settings.showCalls;
    if (relation === 'extends') return settings.showExtends;
    return true;
};

const postOpenFileMessage = (docs) => {
    const targetPath = docs?.absolutePath || docs?.filePath;
    if (!targetPath) return;

    const lineStart = Number.isFinite(Number(docs?.lineStart)) ? Number(docs.lineStart) : undefined;
    const lineEndRaw = Number.isFinite(Number(docs?.lineEnd)) ? Number(docs.lineEnd) : undefined;
    const lineEnd = lineEndRaw || lineStart;

    const payload = {
        command: 'openFile',
        path: targetPath,
        lineStart,
        lineEnd
    };

    if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
    }
    window.postMessage(payload, '*');
};

const ArchitecturePage = () => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [graphData, setGraphData] = useState({ nodes: [], edges: [], stats: null, capabilities: null });
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [searchText, setSearchText] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [snippetExpanded, setSnippetExpanded] = useState(false);
    const [settings, setSettings] = useState(() => {
        try {
            const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
            return normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {
            return DEFAULT_SETTINGS;
        }
    });

    const owner = searchParams.get('owner');
    const repoName = searchParams.get('repo');
    const filePath = searchParams.get('path');
    const isDependencyMode = Boolean(owner && repoName && filePath);

    const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/home');
    };

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    }, [settings]);

    useEffect(() => {
        const fetchGraph = async () => {
            setLoading(true);
            setError(null);
            try {
                let endpoint = 'http://localhost:5000/api/repos/visualize/structure';
                let params = {
                    owner,
                    repoName,
                    view: settings.view,
                    langProfile: settings.langProfile,
                    maxNodes: settings.maxNodes,
                    expandDepth: settings.expandDepth === 0 ? 'all' : settings.expandDepth,
                    snippetLines: settings.snippetLines
                };

                if (isDependencyMode) {
                    endpoint = 'http://localhost:5000/api/repos/visualize/dependencies';
                    params = {
                        owner,
                        repoName,
                        path: filePath,
                        snippetLines: settings.snippetLines
                    };
                }

                const res = await axios.get(endpoint, { params });
                const payload = {
                    nodes: res.data?.nodes || [],
                    edges: res.data?.edges || [],
                    stats: res.data?.stats || null,
                    capabilities: res.data?.capabilities || null
                };

                setGraphData(payload);
                setSelectedNodeId((prev) => (
                    payload.nodes.find((n) => n.id === prev) ? prev : (payload.nodes[0]?.id || null)
                ));
            } catch (err) {
                setError(err.response?.data?.error || 'Failed to load graph');
            } finally {
                setLoading(false);
            }
        };

        fetchGraph();
    }, [
        owner,
        repoName,
        filePath,
        isDependencyMode,
        settings.view,
        settings.langProfile,
        settings.maxNodes,
        settings.expandDepth,
        settings.snippetLines
    ]);

    const { displayNodes, displayEdges } = useMemo(() => {
        const rawNodes = graphData.nodes || [];
        const rawEdges = graphData.edges || [];

        const activeEdges = rawEdges.filter((edge) => relationEnabled(edge.relation, settings));

        let nodeIdSet = new Set(rawNodes.map((n) => n.id));
        if (searchText.trim()) {
            const matches = new Set(rawNodes.filter((node) => matchesSearch(node, searchText)).map((n) => n.id));
            const expanded = new Set(matches);

            for (const edge of activeEdges) {
                if (matches.has(edge.source) || matches.has(edge.target)) {
                    expanded.add(edge.source);
                    expanded.add(edge.target);
                }
            }

            nodeIdSet = expanded;
        }

        const selected = selectedNodeId;
        const containsParent = new Map();
        for (const edge of activeEdges) {
            if (edge.relation === 'contains') {
                containsParent.set(edge.target, edge.source);
            }
        }

        const ancestorSet = new Set();
        const ancestorEdgeSet = new Set();
        if (selected && containsParent.has(selected)) {
            let current = selected;
            while (containsParent.has(current)) {
                const parent = containsParent.get(current);
                ancestorSet.add(parent);
                ancestorEdgeSet.add(`contains:${parent}->${current}`);
                current = parent;
            }
        }

        const neighborSet = new Set(selected ? [selected] : []);
        if (selected) {
            for (const edge of activeEdges) {
                if (edge.source === selected) neighborSet.add(edge.target);
                if (edge.target === selected) neighborSet.add(edge.source);
            }
        }

        const mappedNodes = rawNodes
            .filter((node) => nodeIdSet.has(node.id))
            .map((node) => {
                const isSelected = selected === node.id;
                const inPath = ancestorSet.has(node.id);
                const fade = settings.focusMode && selected && !neighborSet.has(node.id) && !inPath && !isSelected;

                return {
                    ...node,
                    style: {
                        ...node.style,
                        background: '#1f2937', 
                        color: 'white',
                        padding: '10px',
                        borderRadius: '8px',
                        opacity: fade ? 0.18 : 1,
                        border: isSelected
                            ? '2px solid rgba(255,255,255,0.95)'
                            : inPath
                                ? '2px solid rgba(251,191,36,0.9)'
                                : `2px solid ${KIND_COLORS[node.kind] || '#64748b'}`,
                        boxShadow: isSelected ? '0 0 0 4px rgba(255,255,255,0.2)' : '0 4px 6px rgba(0,0,0,0.3)'
                    }
                };
            });

        const mappedEdges = activeEdges
            .filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
            .map((edge) => {
                const connectedToSelected = selected && (edge.source === selected || edge.target === selected);
                const inPath = ancestorEdgeSet.has(edge.id);
                const fade = settings.focusMode && selected && !connectedToSelected && !inPath;

                return {
                    ...edge,
                    animated: inPath,
                    type: 'smoothstep',
                    style: {
                        ...edge.style,
                        opacity: fade ? 0.1 : 1,
                        strokeWidth: inPath ? 3 : (edge.style?.strokeWidth || 1.5),
                        stroke: inPath ? '#fbbf24' : (edge.style?.stroke || RELATION_COLORS[edge.relation] || '#64748b')
                    }
                };
            });

        const layouted = getLayoutedElements(mappedNodes, mappedEdges);
        return { displayNodes: layouted.nodes, displayEdges: layouted.edges };
    }, [graphData, searchText, selectedNodeId, settings]);

    useEffect(() => {
        setNodes(displayNodes);
        setEdges(displayEdges);
    }, [displayNodes, displayEdges, setNodes, setEdges]);

    const selectedNode = useMemo(() => {
        if (!selectedNodeId) return null;
        return (graphData.nodes || []).find((n) => n.id === selectedNodeId) || null;
    }, [graphData.nodes, selectedNodeId]);

    const selectedDocs = getNodeDocs(selectedNode);
    const snippetLines = String(selectedDocs.snippetPreview || '').split(/\r?\n/);
    const snippetForView = snippetExpanded ? selectedDocs.snippetPreview : snippetLines.slice(0, 8).join('\n');

    return (
        <div className="h-screen w-screen bg-[#0b1118] text-white flex flex-col">
            <div className="h-16 border-b border-white/10 px-4 flex items-center gap-3 bg-[#101826]">
                <button onClick={handleBack} className="p-2 rounded-md hover:bg-white/10 text-gray-300">
                    <ArrowLeft size={18} />
                </button>

                <div className="min-w-0">
                    <h1 className="text-sm md:text-base font-semibold leading-tight">
                        {isDependencyMode ? 'Dependency Documentation View' : 'Codebase Auto-Documentation'}
                    </h1>
                    <p className="text-[11px] text-gray-400 truncate">
                        {filePath || `${owner || '-'} / ${repoName || '-'}`}
                    </p>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <div className="hidden md:flex items-center gap-2 px-2 py-1 border border-white/10 rounded-md bg-black/20">
                        <Search size={14} className="text-gray-400" />
                        <input
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                            placeholder="Search nodes/docs"
                            className="bg-transparent outline-none text-xs text-white w-44"
                        />
                    </div>

                    <button
                        onClick={() => setSettingsOpen((prev) => !prev)}
                        className="px-3 py-1.5 text-xs border border-white/10 rounded-md hover:bg-white/10 flex items-center gap-2"
                    >
                        <Settings size={14} /> Settings
                    </button>
                </div>
            </div>

            <div className="flex-1 flex min-h-0">
                <div className="flex-1 relative border-r border-white/10">
                    {loading && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0b1118]/80">
                            <Loader className="animate-spin text-emerald-400" size={34} />
                        </div>
                    )}

                    {error && !loading && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center">
                            <div className="bg-[#181d26] border border-red-500/25 rounded-xl p-5 text-center max-w-md">
                                <p className="text-red-300 font-semibold mb-2">Error</p>
                                <p className="text-sm text-gray-300">{error}</p>
                            </div>
                        </div>
                    )}

                    <ReactFlow
                        nodes={nodes}
                        edges={edges}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        onNodeClick={(_, node) => {
                            setSelectedNodeId(node.id);
                            setSnippetExpanded(false);
                        }}
                        fitView
                        minZoom={0.12}
                        className="bg-[#0b1118]"
                    >
                        <Background color="#1f2a37" gap={24} />
                        <MiniMap
                            pannable
                            zoomable
                            nodeColor={(n) => KIND_COLORS[n.kind] || '#64748b'}
                            maskColor="rgba(3,8,14,0.5)"
                            className="!bg-[#0f1724] !border !border-white/10"
                        />
                        <Controls className="!bg-[#0f1724] !border !border-white/10 !fill-white" />
                    </ReactFlow>

                    <div className="absolute top-3 left-3 z-30 bg-[#0f1724]/95 border border-white/10 rounded-lg px-3 py-2 text-[11px] space-y-1">
                        <div className="text-gray-300 font-semibold">Legend</div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLORS.module }} />module</div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLORS.directory }} />directory</div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLORS.file }} />file</div>
                        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: KIND_COLORS.symbol }} />symbol</div>
                        <div className="border-t border-white/10 pt-1 mt-1">
                            <div className="flex items-center gap-2"><span className="w-3 h-[2px]" style={{ background: RELATION_COLORS.contains }} />contains</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-[2px]" style={{ background: RELATION_COLORS.imports }} />imports</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-[2px]" style={{ background: RELATION_COLORS.calls }} />calls</div>
                            <div className="flex items-center gap-2"><span className="w-3 h-[2px]" style={{ background: RELATION_COLORS.extends }} />extends</div>
                        </div>
                    </div>
                </div>

                <aside className="w-[360px] md:w-[420px] max-w-[45vw] bg-[#0f1724] overflow-y-auto">
                    <div className="p-4 border-b border-white/10">
                        <h2 className="text-sm font-semibold">Node Documentation</h2>
                        {graphData.stats && (
                            <div className="mt-2 text-[11px] text-gray-400 space-y-1">
                                <div>
                                    files: {graphData.stats.totalFiles ?? '-'} | dirs: {graphData.stats.totalDirs ?? '-'} | loc: {graphData.stats.totalLines ?? '-'}
                                </div>
                                <div>
                                    nodes: {graphData.stats.graphNodes ?? '-'} | edges: {graphData.stats.graphEdges ?? '-'}
                                </div>
                                {graphData.stats.note && <div className="text-yellow-300/80">{graphData.stats.note}</div>}
                            </div>
                        )}
                    </div>

                    {!selectedNode ? (
                        <div className="p-4 text-sm text-gray-400">Select a node to inspect generated docs.</div>
                    ) : (
                        <div className="p-4 space-y-4">
                            <div>
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-base font-semibold break-all">{selectedNode?.data?.label}</h3>
                                    <span className="text-[10px] uppercase px-2 py-1 rounded border border-white/10 text-gray-300">
                                        {selectedNode.kind || 'node'}
                                    </span>
                                </div>
                                {selectedDocs.summary && <p className="text-xs text-gray-300 mt-2">{selectedDocs.summary}</p>}
                                {selectedDocs.filePath && (
                                    <p className="text-[11px] text-gray-400 mt-2 break-all">{selectedDocs.filePath}</p>
                                )}
                                {(selectedDocs.lineStart || selectedDocs.lineEnd) && (
                                    <p className="text-[11px] text-gray-500 mt-1">
                                        L{selectedDocs.lineStart || '-'}{selectedDocs.lineEnd && selectedDocs.lineEnd !== selectedDocs.lineStart ? `-L${selectedDocs.lineEnd}` : ''}
                                    </p>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => postOpenFileMessage(selectedDocs)}
                                    disabled={!selectedDocs.absolutePath}
                                    className="text-xs px-3 py-2 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 disabled:opacity-40 inline-flex items-center gap-2"
                                >
                                    <ExternalLink size={13} /> Open in Editor
                                </button>
                            </div>

                            {selectedDocs.snippetPreview && (
                                <div className="border border-white/10 rounded-lg overflow-hidden">
                                    <div className="px-3 py-2 border-b border-white/10 bg-black/25 flex items-center justify-between">
                                        <span className="text-[11px] text-gray-300">Snippet Preview</span>
                                        <button
                                            onClick={() => setSnippetExpanded((prev) => !prev)}
                                            className="text-[11px] px-2 py-1 rounded bg-white/5 hover:bg-white/10"
                                        >
                                            {snippetExpanded ? 'Collapse' : 'Expand'}
                                        </button>
                                    </div>
                                    <div className="max-h-[320px] overflow-auto">
                                        <SyntaxHighlighter
                                            language="javascript"
                                            style={vscDarkPlus}
                                            customStyle={{ margin: 0, padding: '12px', background: '#0b1118' }}
                                        >
                                            {snippetForView}
                                        </SyntaxHighlighter>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 gap-3">
                                <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                                    <div className="text-[11px] text-gray-400 mb-2">Exports</div>
                                    <div className="text-xs text-gray-200 break-all">
                                        {(selectedDocs.exports || []).length ? selectedDocs.exports.join(', ') : 'None'}
                                    </div>
                                </div>
                                <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                                    <div className="text-[11px] text-gray-400 mb-2">Imports</div>
                                    <div className="text-xs text-gray-200 break-all">
                                        {(selectedDocs.imports || []).length ? selectedDocs.imports.join(', ') : 'None'}
                                    </div>
                                </div>
                                <div className="border border-white/10 rounded-lg p-3 bg-black/20">
                                    <div className="text-[11px] text-gray-400 mb-2">Dependents</div>
                                    <div className="text-xs text-gray-200 break-all">
                                        {(selectedDocs.dependents || []).length ? selectedDocs.dependents.join(', ') : 'None'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </aside>
            </div>

            {settingsOpen && (
                <div className="absolute right-4 top-20 z-50 w-[320px] bg-[#111a29] border border-white/15 rounded-xl shadow-2xl">
                    <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Visualizer Settings</h3>
                        <button onClick={() => setSettingsOpen(false)} className="p-1 rounded hover:bg-white/10 text-gray-300">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="p-4 space-y-4 text-xs">
                        {!isDependencyMode && (
                            <>
                                <label className="block">
                                    <span className="text-gray-300">View</span>
                                    <select
                                        value={settings.view}
                                        onChange={(e) => setSettings((prev) => normalizeSettings({ ...prev, view: e.target.value }))}
                                        className="mt-1 w-full bg-[#0b1118] border border-white/10 rounded px-2 py-1.5"
                                    >
                                        <option value="overview">overview</option>
                                        <option value="detail">detail</option>
                                    </select>
                                </label>

                                <label className="block">
                                    <span className="text-gray-300">Language Profile</span>
                                    <select
                                        value={settings.langProfile}
                                        onChange={(e) => setSettings((prev) => normalizeSettings({ ...prev, langProfile: e.target.value }))}
                                        className="mt-1 w-full bg-[#0b1118] border border-white/10 rounded px-2 py-1.5"
                                    >
                                        <option value="js-ts-deep">js-ts-deep</option>
                                        <option value="balanced">balanced</option>
                                        <option value="structure-only">structure-only</option>
                                    </select>
                                </label>
                            </>
                        )}

                        <label className="block">
                            <span className="text-gray-300">Max Nodes</span>
                            <input
                                type="number"
                                min={50}
                                max={6000}
                                value={settings.maxNodes}
                                onChange={(e) => setSettings((prev) => normalizeSettings({ ...prev, maxNodes: e.target.value }))}
                                className="mt-1 w-full bg-[#0b1118] border border-white/10 rounded px-2 py-1.5"
                            />
                        </label>

                        <label className="block">
                            <span className="text-gray-300">Expand Depth ({settings.expandDepth === 0 ? 'all layers' : settings.expandDepth})</span>
                            <div className="mt-1 flex items-center gap-2">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    value={settings.expandDepth}
                                    onChange={(e) => setSettings((prev) => normalizeSettings({ ...prev, expandDepth: e.target.value }))}
                                    className="w-full bg-[#0b1118] border border-white/10 rounded px-2 py-1.5"
                                />
                                <button
                                    type="button"
                                    onClick={() => setSettings((prev) => ({ ...prev, expandDepth: 0 }))}
                                    className="px-2 py-1.5 rounded border border-cyan-500/40 text-cyan-300 bg-cyan-500/10 whitespace-nowrap"
                                >
                                    All
                                </button>
                            </div>
                        </label>

                        <label className="block">
                            <span className="text-gray-300">Snippet Lines ({settings.snippetLines})</span>
                            <input
                                type="range"
                                min={3}
                                max={40}
                                value={settings.snippetLines}
                                onChange={(e) => setSettings((prev) => normalizeSettings({ ...prev, snippetLines: e.target.value }))}
                                className="mt-1 w-full"
                            />
                        </label>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" checked={settings.showContains} onChange={(e) => setSettings((prev) => ({ ...prev, showContains: e.target.checked }))} />
                                contains
                            </label>
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" checked={settings.showImports} onChange={(e) => setSettings((prev) => ({ ...prev, showImports: e.target.checked }))} />
                                imports
                            </label>
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" checked={settings.showCalls} onChange={(e) => setSettings((prev) => ({ ...prev, showCalls: e.target.checked }))} />
                                calls
                            </label>
                            <label className="flex items-center gap-2 text-gray-300">
                                <input type="checkbox" checked={settings.showExtends} onChange={(e) => setSettings((prev) => ({ ...prev, showExtends: e.target.checked }))} />
                                extends
                            </label>
                        </div>

                        <label className="flex items-center gap-2 text-gray-300">
                            <input type="checkbox" checked={settings.focusMode} onChange={(e) => setSettings((prev) => ({ ...prev, focusMode: e.target.checked }))} />
                            focus mode
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ArchitecturePage;
