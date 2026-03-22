import React, { useState, useEffect } from "react";
import { 
    Folder, File, ChevronLeft, X, Save, RefreshCw, Network, 
    Play, Search, Layout, HelpCircle, User, Settings, Terminal as TerminalIcon
} from "lucide-react";
import axios from "axios";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import "./IDELayout.css";

const ActivityBar = ({ activePanel, setActivePanel }) => (
    <div className="w-[48px] h-full bg-[#333333] flex flex-col items-center py-4 gap-4 shrink-0 z-20">
        <div 
            onClick={() => setActivePanel(activePanel === 'explorer' ? null : 'explorer')}
            className={`w-full py-3 flex items-center justify-center transition-all duration-200 cursor-pointer border-l-[3px] ${activePanel === 'explorer' ? 'border-white text-white' : 'border-transparent text-gray-500 hover:text-white'}`}
            title="Explorer"
        >
            <Folder size={24} strokeWidth={1.5} />
        </div>
        <div className="w-full py-3 flex items-center justify-center text-gray-500 hover:text-white transition cursor-pointer border-l-[3px] border-transparent" title="Search">
            <Search size={24} strokeWidth={1.5} />
        </div>
        <div className="w-full py-3 flex items-center justify-center text-gray-500 hover:text-white transition cursor-pointer border-l-[3px] border-transparent" title="Source Control">
            <Network size={24} strokeWidth={1.5} />
        </div>
        <div className="w-full py-3 flex items-center justify-center text-gray-500 hover:text-white transition cursor-pointer border-l-[3px] border-transparent" title="Run and Debug">
            <Play size={24} strokeWidth={1.5} />
        </div>
        <div className="mt-auto flex flex-col items-center gap-4 mb-4">
            <div className="p-2 text-gray-500 hover:text-white transition cursor-pointer" title="Settings">
                <Settings size={22} strokeWidth={1.5} />
            </div>
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-[10px] font-bold text-gray-300 cursor-pointer hover:ring-2 hover:ring-white/20 transition-all">
                <User size={16} />
            </div>
        </div>
    </div>
);

const IDELayout = ({ repo, onPullRepo, user, socket, inviteLink, setShowInviteModal }) => {
    // Content states
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState("");
    const [loading, setLoading] = useState(false);
    
    // Editor states
    const [viewingFile, setViewingFile] = useState(null);
    const [viewingFilePath, setViewingFilePath] = useState("");
    const [fileContent, setFileContent] = useState("");
    const [fileDirty, setFileDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    
    // UI states
    const [activePanel, setActivePanel] = useState('explorer');
    const [showPreview, setShowPreview] = useState(false);
    const [terminalOpen, setTerminalOpen] = useState(true);

    const getOwner = () => {
        const owner = repo?.owner;
        if (owner && typeof owner === "object") return owner.login || "";
        if (typeof owner === "string") return owner;
        return "";
    };

    // Presence integration
    useEffect(() => {
        if (!socket || !repo) return;
        const owner = getOwner();
        const repoId = repo.id || repo._id;
        socket.emit("joinRepo", { repoId, username: user?.username });
    }, [socket, repo, user]);

    const fetchFiles = async (path = "") => {
        setLoading(true);
        try {
            const owner = getOwner();
            const res = await axios.get(`http://localhost:5000/api/repos/files`, {
                params: { owner, repoName: repo.name, path }
            });
            setFiles(res.data);
            setCurrentPath(path);
        } catch (error) { 
            console.error("Failed to load files", error); 
        } finally { 
            setLoading(false); 
        }
    };

    useEffect(() => { 
        if (repo) fetchFiles(""); 
    }, [repo]);

    const handleFileClick = async (file) => {
        if (file.type === "dir") {
            fetchFiles(file.path);
        } else {
            try {
                setLoading(true);
                setViewingFile(file.name);
                setViewingFilePath(file.path);
                setFileContent("Loading...");
                setFileDirty(false);
                setShowPreview(false);
                const owner = getOwner();
                const res = await axios.get("http://localhost:5000/api/repos/local-content", {
                    params: { owner, repoName: repo.name, filePath: file.path }
                });
                setFileContent(res.data.content);
            } catch (error) {
                setFileContent("Error loading content.");
            } finally {
                setLoading(false);
            }
        }
    };

    const handleSaveFile = async () => {
        if (!viewingFile) return;
        try {
            setSaving(true);
            const owner = getOwner();
            await axios.put("http://localhost:5000/api/repos/local-content", {
                owner,
                repoName: repo.name,
                filePath: viewingFilePath,
                content: fileContent
            });
            setFileDirty(false);
        } catch (error) {
            alert("Save failed.");
        } finally {
            setSaving(false);
        }
    };

    const isMarkdown = (name) => name?.toLowerCase().endsWith(".md");

    return (
        <div className="h-full w-full flex flex-col bg-[#1e1e1e] text-[#cccccc] overflow-hidden select-none">
            {/* WORKSPACE FLEX CONTAINER */}
            <div className="flex-1 flex flex-row overflow-hidden min-h-0">
                {/* 1. ACTIVITY BAR */}
                <ActivityBar activePanel={activePanel} setActivePanel={setActivePanel} />

                {/* 2. EXPLORER SIDEBAR */}
                {activePanel === 'explorer' && (
                    <div className="w-[280px] shrink-0 bg-[#252526] flex flex-col border-r border-[#333333]">
                        <div className="flex justify-between items-center px-4 py-3 shrink-0">
                            <span className="text-xs tracking-wide text-gray-300 uppercase">Explorer</span>
                            <div className="flex items-center gap-2">
                                <button onClick={() => fetchFiles(currentPath)} title="Refresh" className="text-gray-400 hover:text-white transition-colors">
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                        </div>
                        {currentPath !== "" && (
                            <div className="px-4 py-2 border-b border-[#333333] flex items-center gap-1.5 cursor-pointer hover:bg-[#37373d] transition-colors shrink-0" onClick={() => {
                                const parent = currentPath.split("/").slice(0, -1).join("/");
                                fetchFiles(parent);
                            }}>
                                <ChevronLeft size={14} className="text-gray-300" />
                                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-wider truncate">
                                    BACK
                                </span>
                            </div>
                        )}
                        <div className="px-4 py-2 flex items-center gap-2 shrink-0">
                            <span className="text-[11px] font-bold text-gray-300 uppercase truncate">
                                {repo.name}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto px-1">
                            {loading && !files.length ? (
                                <div className="text-[11px] text-gray-500 italic px-4 py-2">Loading files...</div>
                            ) : (
                                files.map((file) => (
                                    <div 
                                        key={file.path} 
                                        onClick={() => handleFileClick(file)}
                                        className={`px-3 py-1 cursor-pointer flex items-center justify-between transition-colors border border-transparent ${viewingFilePath === file.path ? 'bg-[#37373d] border-[#37373d] text-white' : 'hover:bg-[#2a2d2e] text-[#cccccc]'}`}
                                    >
                                        <div className="flex items-center gap-2 truncate">
                                            {file.type === "dir" ? (
                                                <Folder size={16} className="text-[#dcb67a] shrink-0" fill="#dcb67a" fillOpacity={0.2} />
                                            ) : (
                                                <File size={16} className="text-[#519aba] shrink-0" />
                                            )}
                                            <span className="text-[13px] truncate">{file.name}</span>
                                        </div>
                                        {fileDirty && viewingFilePath === file.path && (
                                            <div className="w-2 h-2 rounded-full border border-white/20 shrink-0" />
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* 3. EDITOR & TERMINAL */}
                <div className="flex-1 flex flex-col min-w-0 bg-[#1e1e1e] relative">
                    {/* Editor Header */}
                    {viewingFile && (
                        <div className="h-[35px] shrink-0 flex items-center bg-[#252526]">
                            <div className="flex items-center gap-2 px-3 h-full bg-[#1e1e1e] border-t-[2px] border-[#007acc] min-w-[150px] max-w-[200px] border-r border-[#252526]">
                                <File size={14} className="text-[#519aba] shrink-0" />
                                <span className={`text-[12px] truncate flex-1 tracking-wide ${fileDirty ? "italic text-white" : "text-gray-200"}`}>
                                    {viewingFile}
                                </span>
                                <div 
                                    className="p-0.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); setViewingFile(null); setViewingFilePath(""); }}
                                >
                                    <X size={14} />
                                </div>
                            </div>
                            <div className="flex-1" />
                            <div className="flex items-center gap-2 px-4 shrink-0">
                                {isMarkdown(viewingFile) && (
                                    <button onClick={() => setShowPreview(!showPreview)} className="text-gray-400 hover:text-white p-1 rounded transition-colors" title="Open Preview">
                                        <Layout size={16} />
                                    </button>
                                )}
                                <button onClick={handleSaveFile} disabled={!fileDirty || saving} className="text-gray-400 hover:text-emerald-500 p-1 rounded transition-colors disabled:opacity-30" title="Save (Ctrl+S)">
                                    <Save size={16} />
                                </button>
                                <button className="text-gray-400 hover:text-white p-1 border-l border-[#333333] pl-3 ml-1 transition-colors" onClick={() => setTerminalOpen(!terminalOpen)} title="Toggle Terminal">
                                    <TerminalIcon size={16} />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Editor Canvas */}
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        {viewingFile ? (
                            showPreview ? (
                                <div className="p-12 overflow-y-auto w-full h-full markdown-preview text-gray-300">
                                    <ReactMarkdown>{fileContent}</ReactMarkdown>
                                </div>
                            ) : (
                                <div className="w-full h-full p-2 select-text">
                                    <Editor
                                        height="100%"
                                        path={viewingFilePath}
                                        language={viewingFilePath?.split('.').pop() || "javascript"}
                                        value={fileContent}
                                        theme="vs-dark"
                                        options={{
                                            fontSize: 14,
                                            minimap: { enabled: true },
                                            automaticLayout: true,
                                            padding: { top: 16 },
                                            scrollBeyondLastLine: false,
                                            tabSize: 4,
                                            insertSpaces: true,
                                            wordWrap: "on"
                                        }}
                                        onChange={v => { setFileContent(v || ""); setFileDirty(true); }}
                                        onMount={(editor, monaco) => {
                                            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handleSaveFile());
                                        }}
                                    />
                                </div>
                            )
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-center opacity-40">
                                <div className="w-24 h-24 mb-6 bg-white/5 rounded-3xl flex items-center justify-center">
                                    <File size={40} className="text-gray-600" />
                                </div>
                                <h3 className="text-2xl font-bold text-gray-300 mb-2">VS Code Editor</h3>
                                <p className="text-sm text-gray-500 max-w-sm">Select a file from the Explorer to begin editing.</p>
                            </div>
                        )}
                    </div>

                    {/* Terminal Dropdown */}
                    {terminalOpen && (
                        <div className="h-[250px] shrink-0 border-t border-[#333333] flex flex-col bg-[#1e1e1e]">
                            <div className="h-[35px] flex items-center justify-between px-4 shrink-0">
                                <div className="flex items-center gap-6 h-full">
                                    <button className="h-full border-b-[1px] border-[#007acc] text-[11px] text-gray-200 uppercase tracking-wider">
                                        Terminal
                                    </button>
                                </div>
                                <button className="text-gray-400 hover:text-white transition-colors" onClick={() => setTerminalOpen(false)}>
                                    <X size={14} />
                                </button>
                            </div>
                            <div className="flex-1 p-3 font-mono text-[13px] overflow-y-auto select-text">
                                <div className="text-gray-300">
                                    <div className="text-[#cccc55] mb-2">Microsoft Windows [Version 10.0.19045.5445]</div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[#3b8eea]">PS D:\{repo.name}&gt;</span>
                                        <input className="bg-transparent border-none outline-none flex-1 text-white font-mono" autoFocus placeholder="Type a command..." onKeyDown={e => { if(e.key==='Enter') e.target.value=''}} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* STATUS BAR */}
            <div className="h-[22px] bg-[#007acc] flex items-center justify-between px-2 text-[10px] text-white shrink-0 tracking-wide z-10">
                <div className="flex items-center h-full">
                    <button className="px-2 h-full hover:bg-white/20 flex items-center gap-1.5 transition-colors">
                        <Network size={12} /> main*
                    </button>
                    <button onClick={onPullRepo} className="px-2 h-full hover:bg-white/20 flex items-center gap-1.5 transition-colors">
                        <RefreshCw size={12} />
                    </button>
                </div>
                <div className="flex items-center h-full">
                    <button className="px-2 h-full hover:bg-white/20 transition-colors">Ln 1, Col 1</button>
                    <button className="px-2 h-full hover:bg-white/20 transition-colors">Spaces: 4</button>
                    <button className="px-2 h-full hover:bg-white/20 transition-colors">UTF-8</button>
                    <button className="px-2 h-full hover:bg-white/20 flex items-center justify-center transition-colors">
                        <HelpCircle size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default IDELayout;
