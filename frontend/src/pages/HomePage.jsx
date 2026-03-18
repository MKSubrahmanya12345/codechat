import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../store/authUser";
import { 
    LogOut, Star, GitFork, MessageSquare, ArrowLeft, Send, Search, 
    Folder, FileCode, Users, Hash, ChevronLeft, Bell, Plus, Check, 
    Paperclip, X, MoreVertical, Share2, Network, Copy, FolderSync, Upload, Settings, Code2, Github, Sparkles
} from "lucide-react";
import axios from "axios";
import io from "socket.io-client";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Link } from "react-router-dom"; // Import Link

const socket = io("http://localhost:5000");
const DEFAULT_REPO_BASE_PATH = "C:\\Users\\User\\Repo";

const getRepoOwnerLogin = (repo) => {
    const owner = repo?.owner;
    if (owner && typeof owner === "object") return owner.login || "";
    if (typeof owner === "string") return owner;
    return "";
};

const getRepoNameSafe = (repo) => {
    return typeof repo?.name === "string" ? repo.name : "";
};

// ================= 1. FILE EXPLORER COMPONENT =================
// ================= 1. FILE EXPLORER COMPONENT =================
const FileExplorer = ({ repo, onPullRepo, onOpenFile }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState("");
    const [loading, setLoading] = useState(false);
    const [viewingFile, setViewingFile] = useState(null);
    const [fileContent, setFileContent] = useState("");
    const [fileDirty, setFileDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    // Helper to get owner string safely
    const getOwner = () => getRepoOwnerLogin(repo);
    const fetchFiles = async (path = "") => {
        setLoading(true);
        try {
            const owner = getOwner();
            const repoName = repo.name;
            const res = await axios.get(`http://localhost:5000/api/repos/files`, {
                params: { owner, repoName, path }
            });
            setFiles(res.data);
            setCurrentPath(path);
        } catch (error) { console.error("Failed to load files", error); } 
        finally { setLoading(false); }
    };

    useEffect(() => { fetchFiles(""); }, [repo]);

    const handleGoBack = () => {
        if (!currentPath) return;
        const parentPath = currentPath.split("/").slice(0, -1).join("/");
        fetchFiles(parentPath);
    };

    const handleFileClick = async (file) => {
        if (file.type === "dir") {
            fetchFiles(file.path);
        } else {
            try {
                setViewingFile(file.name);
                setFileContent("Loading...");
                setFileDirty(false);
                const owner = getOwner();
                const res = await axios.get("http://localhost:5000/api/repos/local-content", {
                    params: { owner, repoName: repo.name, filePath: file.path }
                });
                setFileContent(res.data.content);
                if (onOpenFile) {
                    onOpenFile(owner, repo.name, file.path);
                }
            } catch (error) {
                setFileContent("Error loading file content.");
            }
        }
    };

    const handleSaveFile = async () => {
        try {
            setSaving(true);
            const owner = getOwner();
            const filePath = currentPath ? `${currentPath}/${viewingFile}` : viewingFile;
            await axios.put("http://localhost:5000/api/repos/local-content", {
                owner,
                repoName: repo.name,
                filePath,
                content: fileContent
            });
            setFileDirty(false);
        } catch (error) {
            alert("Failed to save file.");
        } finally {
            setSaving(false);
        }
    };

    const isGraphSupported = (name) => {
        if (!name) return false;
        const ext = name.toLowerCase().split(".").pop();
        return ["js", "jsx", "ts", "tsx"].includes(ext);
    };

    // Construct Visualization URL safely
    const vizUrl = viewingFile 
        ? `/architecture?owner=${encodeURIComponent(getOwner())}&repo=${encodeURIComponent(repo.name)}&path=${encodeURIComponent(currentPath ? currentPath + '/' + viewingFile : viewingFile)}`
        : "#";

    return (
        <div className="flex flex-col h-full bg-[#0C0C0C] relative">
            <div className="flex items-center gap-2 p-3 border-b border-white/5 text-sm text-gray-400 font-mono">
                <button onClick={handleGoBack} disabled={!currentPath} className="p-1 hover:text-white disabled:opacity-30">
                    <ChevronLeft size={16} />
                </button>
                <span className="text-emerald-500">root</span>
                {currentPath && <span className="text-gray-600">/</span>}
                <span>{currentPath}</span>
                <div className="ml-auto">
                    <button onClick={onPullRepo} className="text-[10px] px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/20 hover:bg-emerald-500/30">
                        Pull Repo
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {loading ? <div className="text-gray-500 text-sm animate-pulse">Pulling files...</div> : (
                    <div className="grid grid-cols-1 gap-1">
                        {files.map((file) => (
                            <div key={file.path} onClick={() => handleFileClick(file)} className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors border border-transparent ${file.type === "dir" ? "hover:bg-blue-500/10 text-blue-100" : "hover:bg-emerald-500/10 text-gray-300"}`}>
                                {file.type === "dir" ? <Folder size={16} className="text-blue-400" /> : <FileCode size={16} className="text-gray-500" />}
                                <span className="text-sm font-mono truncate">{file.name}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {viewingFile && (
                <div className="absolute inset-0 z-50 bg-[#1e1e1e] flex flex-col animate-in slide-in-from-bottom-5">
                    <div className="flex justify-between items-center p-3 border-b border-white/10 bg-[#252526]">
                        <span className="text-sm font-mono text-emerald-400 flex items-center gap-2">
                            <FileCode size={14} /> {viewingFile}
                        </span>
                        
                        <div className="flex items-center gap-2">
                            {/* 👇 FIXED BUTTON: Uses pre-calculated safe URL */}
                            {isGraphSupported(viewingFile) ? (
                                <Link 
                                    to={vizUrl}
                                    className="flex items-center gap-2 text-[10px] bg-purple-500/20 text-purple-400 px-2 py-1 rounded hover:bg-purple-500/30 transition-colors"
                                >
                                    <Network size={12} /> Graph
                                </Link>
                            ) : (
                                <span className="text-[10px] text-gray-500 px-2 py-1 rounded border border-white/10">
                                    Graph (JS/TS only)
                                </span>
                            )}

                            <button
                                onClick={handleSaveFile}
                                disabled={!fileDirty || saving}
                                className="flex items-center gap-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded hover:bg-emerald-500/30 transition-colors disabled:opacity-40"
                            >
                                {saving ? "Saving..." : "Save"}
                            </button>

                            <button onClick={() => setViewingFile(null)} className="text-gray-400 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto p-4 bg-[#1e1e1e]">
                        <textarea
                            value={fileContent}
                            onChange={(e) => { setFileContent(e.target.value); setFileDirty(true); }}
                            className="w-full h-full bg-transparent text-gray-200 font-mono text-xs outline-none resize-none"
                            spellCheck={false}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

// ================= 2. CHAT COMPONENT =================
const ChatComponent = ({ repo }) => {
    const { authUser } = useAuthStore();
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [codeAnchors, setCodeAnchors] = useState({});
    const [codeSelection, setCodeSelection] = useState(null);
    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    useEffect(() => {
        axios.get(`http://localhost:5000/api/repos/${repo.id}/messages`)
            .then((res) => setMessages(res.data))
            .catch(console.error);

        const handleMsg = (msg) => setMessages(prev => {
            if (prev.some(m => m._id === msg._id)) return prev;
            return [...prev, msg];
        });
        const handleUpdate = (updatedMsg) => setMessages(prev => prev.map(m => m._id === updatedMsg._id ? updatedMsg : m));
        const handleDelete = (id) => setMessages(prev => prev.filter(m => m._id !== id));
        const handleTyping = (user) => setTypingUsers(prev => new Set(prev).add(user));
        const handleStopTyping = (user) => setTypingUsers(prev => { const s = new Set(prev); s.delete(user); return s; });

        socket.on("receiveMessage", handleMsg);
        socket.on("messageUpdated", handleUpdate);
        socket.on("messageDeleted", handleDelete);
        socket.on("userTyping", handleTyping);
        socket.on("userStoppedTyping", handleStopTyping);

        return () => {
            socket.off("receiveMessage", handleMsg); 
            socket.off("messageUpdated", handleUpdate);
            socket.off("messageDeleted", handleDelete); 
            socket.off("userTyping", handleTyping); 
            socket.off("userStoppedTyping", handleStopTyping);
        };
    }, [repo.id]);

    useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, typingUsers]);

    const findCodeAnchorUrl = (text) => {
        if (!text) return null;
        const match = text.match(/https?:\/\/github\.com\/[^\s]+\/blob\/[^\s#]+#L\d+(?:-L\d+)?/);
        return match ? match[0] : null;
    };

    useEffect(() => {
        const urls = messages
            .map(m => (m.type === "text" ? findCodeAnchorUrl(m.text) : null))
            .filter(Boolean);

        urls.forEach((url) => {
            if (codeAnchors[url]) return;
            axios.post("http://localhost:5000/api/repos/code-anchor", { url })
                .then(res => {
                    setCodeAnchors(prev => ({ ...prev, [url]: res.data }));
                })
                .catch(() => {});
        });
    }, [messages, codeAnchors]);

    useEffect(() => {
        if (!authUser?.username) return;
        messages.forEach((m) => {
            if (!m._id) return;
            if (m.sender === authUser.username) return;
            const hasRead = m.readBy?.some(r => r.username === authUser.username);
            if (!hasRead) {
                socket.emit("read_message", { messageId: m._id, repoId: repo.id, username: authUser.username });
            }
        });
    }, [messages, repo.id, authUser?.username]);

    useEffect(() => {
        const handleMessage = (event) => {
            if (event?.data?.command === "selectionChanged") {
                setCodeSelection({
                    filePath: event.data.filePath,
                    lineStart: event.data.lineStart,
                    lineEnd: event.data.lineEnd,
                    code: event.data.text
                });
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const handleSend = (e) => {
        e.preventDefault();
        if (!text.trim()) return;

        if (editingId) {
            socket.emit("messageAction", { action: "edit", messageId: editingId, repoId: repo.id, payload: { text } });
            setEditingId(null);
        } else {
            socket.emit("sendMessage", {
                repoId: repo.id,
                text,
                sender: authUser.username,
                replyTo: replyingTo ? { id: replyingTo._id, text: replyingTo.text, sender: replyingTo.sender } : null
            });
        }
        socket.emit("stopTyping", { repoId: repo.id, username: authUser.username });
        setText("");
        setReplyingTo(null);
    };

    const handleSendSelection = () => {
        if (!codeSelection) return;
        socket.emit("sendMessage", {
            repoId: repo.id,
            text: text.trim() || "Shared a code selection",
            sender: authUser.username,
            codeSelection
        });
        socket.emit("stopTyping", { repoId: repo.id, username: authUser.username });
        setText("");
        setCodeSelection(null);
        setReplyingTo(null);
    };

    const handleTypingInput = (e) => {
        setText(e.target.value);
        socket.emit("typing", { repoId: repo.id, username: authUser.username });
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            socket.emit("stopTyping", { repoId: repo.id, username: authUser.username });
        }, 2000);
    };

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploading(true);
        const formData = new FormData();
        formData.append("file", file);
        try {
            const res = await axios.post("http://localhost:5000/api/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
            const type = file.type.startsWith("image/") ? "image" : "file";
            socket.emit("sendMessage", { repoId: repo.id, text: res.data.url, sender: authUser.username, type: type });
        } catch (error) { alert("Upload failed"); } 
        finally { setIsUploading(false); }
    };

    const handleAction = (action, msg) => {
            if (action === "reply") { 
                setReplyingTo(msg); 
                setText(""); 
            }
            else if (action === "edit") { 
                setText(msg.text); 
                setEditingId(msg._id); 
                setReplyingTo(null); 
            }
            else if (action === "delete") { 
                socket.emit("messageAction", { action: "delete", messageId: msg._id, repoId: repo.id }); 
            }
            else if (action.startsWith("react:")) {
                const emoji = action.split(":")[1];
                socket.emit("messageAction", { action: "react", messageId: msg._id, repoId: repo.id, payload: { emoji, user: authUser.username } });
            }
        };

    const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="flex flex-col h-full bg-[#0b0b0b] relative">
            <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {messages.map((m) => {
                    const isMe = m.sender === authUser.username;
                    const codeUrl = m.type === "text" ? findCodeAnchorUrl(m.text) : null;
                    const anchor = codeUrl ? codeAnchors[codeUrl] : null;
                    const readByNames = m.readBy?.map(r => r.username).filter(Boolean) || [];
                    return (
                        <div key={m._id || Math.random()} className={`flex flex-col ${isMe ? "items-end" : "items-start"} mb-2 group`}>
                            {m.replyTo && (
                                <div className={`mb-1 px-3 py-1 rounded-lg text-xs border-l-4 opacity-75 cursor-pointer ${isMe ? "bg-[#005c4b] border-[#00a884]" : "bg-[#202c33] border-[#aebac1]"} max-w-[80%]`}>
                                    <div className="font-bold text-emerald-400">{m.replyTo.sender}</div>
                                    <div className="truncate">{m.replyTo.text}</div>
                                </div>
                            )}
                            <div className={`relative px-2 py-1.5 rounded-lg max-w-[85%] md:max-w-[65%] text-sm shadow-md flex flex-col ${isMe ? "bg-[#005c4b] text-[#e9edef] rounded-tr-none" : "bg-[#202c33] text-[#e9edef] rounded-tl-none"}`}>
                                {!isMe && <span className="text-[10px] font-bold text-[#d863f7] mb-0.5">{m.sender}</span>}
                                
                                <div className="pr-16 break-words leading-relaxed whitespace-pre-wrap">
                                    {m.type === "image" ? (
                                        <img src={m.text} alt="img" className="max-w-full max-h-64 object-cover rounded-lg cursor-pointer" onClick={() => window.open(m.text, "_blank")} />
                                    ) : m.type === "file" ? (
                                        <div className="flex items-center gap-3 bg-black/20 p-2 rounded border border-white/10 cursor-pointer" onClick={() => window.open(m.text, "_blank")}>
                                            <FileCode size={24} className="text-emerald-400" />
                                            <span className="truncate text-xs text-emerald-400 underline">{m.text.split('/').pop()}</span>
                                        </div>
                                    ) : (
                                        <>
                                            {m.codeSelection && (
                                                <div className="mb-2 border border-emerald-500/20 rounded-lg overflow-hidden bg-black/30">
                                                    <div className="px-3 py-2 text-[11px] text-emerald-300 border-b border-white/10 font-mono flex items-center gap-2">
                                                        <Code2 size={12} />
                                                        {m.codeSelection.filePath} (L{m.codeSelection.lineStart}-L{m.codeSelection.lineEnd})
                                                    </div>
                                                    <div className="p-3">
                                                        <SyntaxHighlighter style={vscDarkPlus} language="javascript" customStyle={{ margin: 0, padding: 0, background: 'transparent' }}>
                                                            {m.codeSelection.code}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                </div>
                                            )}
                                            <ReactMarkdown components={{ code({node, inline, className, children, ...props}) { return <code className={`${inline ? "bg-black/20 px-1 rounded" : "block bg-black/30 p-2 rounded text-xs"} font-mono text-emerald-300`} {...props}>{children}</code> }}}>
                                                {m.text}
                                            </ReactMarkdown>
                                            {anchor && (
                                                <div className="mt-2 border border-white/10 rounded-lg overflow-hidden bg-black/30">
                                                    <div className="px-3 py-2 text-[11px] text-emerald-300 border-b border-white/10 font-mono">
                                                        {anchor.filename} (L{anchor.startLine}-L{anchor.endLine})
                                                    </div>
                                                    <div className="p-3">
                                                        <SyntaxHighlighter style={vscDarkPlus} language={anchor.language} customStyle={{ margin: 0, padding: 0, background: 'transparent' }}>
                                                            {anchor.code}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                <div className="absolute bottom-1 right-2 flex items-end gap-1 select-none">
                                    {m.isEdited && <span className="text-[10px] text-gray-400 italic">edited</span>}
                                    <span className="text-[10px] text-gray-400">{formatTime(m.createdAt)}</span>
                                    {isMe && (
                                        <span
                                            className={(readByNames.length > 0 || m.status === "read") ? "text-[#53bdeb]" : "text-gray-400"}
                                            title={readByNames.length > 0 ? `Read by: ${readByNames.join(", ")}` : "Delivered"}
                                        >
                                            {m.status === "sent" ? "✓" : "✓✓"}
                                        </span>
                                    )}
                                </div>

                                <div className="absolute -top-3 right-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[#202c33] border border-white/10 rounded-md shadow-lg flex items-center overflow-hidden scale-90">
                                    <button onClick={() => handleAction("react:👍", m)} className="p-1.5 hover:bg-white/10 text-xs">👍</button>
                                    <button onClick={() => handleAction("react:❤️", m)} className="p-1.5 hover:bg-white/10 text-xs">❤️</button>
                                    <button onClick={() => handleAction("reply", m)} className="p-1.5 hover:bg-white/10 text-gray-400"><MessageSquare size={12}/></button>
                                    {isMe && <button onClick={() => handleAction("edit", m)} className="p-1.5 hover:bg-white/10 text-gray-400">✎</button>}
                                    {isMe && <button onClick={() => handleAction("delete", m)} className="p-1.5 hover:bg-red-500/20 text-red-400">🗑</button>}
                                </div>
                                {m.reactions?.length > 0 && (
                                    <div className="absolute -bottom-3 left-2 bg-[#202c33] border border-black/30 rounded-full px-1.5 py-0.5 text-[10px] flex gap-0.5 shadow-sm z-10">
                                        {m.reactions.slice(0, 3).map((r, i) => <span key={i}>{r.emoji}</span>)}
                                        {m.reactions.length > 3 && <span className="text-gray-400">+{m.reactions.length - 3}</span>}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {typingUsers.size > 0 && <div className="text-xs text-emerald-400 ml-4 animate-pulse">{[...typingUsers].join(", ")} is typing...</div>}
                <div ref={bottomRef} />
            </div>

            <div className="p-2 bg-[#202c33] flex flex-col gap-2">
                {codeSelection && (
                    <div className="flex items-center justify-between bg-[#1c2b33] p-2 rounded-lg border border-emerald-500/20">
                        <div className="text-xs text-emerald-300 font-mono truncate">
                            Selected: {codeSelection.filePath} (L{codeSelection.lineStart}-L{codeSelection.lineEnd})
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setCodeSelection(null)} className="text-xs text-gray-400 hover:text-white">Clear</button>
                            <button onClick={handleSendSelection} className="text-xs bg-emerald-600 px-2 py-1 rounded font-bold">Send Selection</button>
                        </div>
                    </div>
                )}
                {replyingTo && (
                        <div className="flex justify-between items-center bg-[#182229] p-2 rounded-lg border-l-4 border-[#00a884]">
                        <div className="text-xs text-gray-300">
                            <span className="text-[#00a884] font-bold">Replying to {replyingTo.sender}</span>
                            <div className="truncate opacity-75">{replyingTo.text}</div>
                        </div>
                        <button onClick={() => setReplyingTo(null)} className="text-gray-400 hover:text-white"><X size={16}/></button>
                        </div>
                )}
                <div className="flex gap-2 items-center">
                    <button onClick={() => fileInputRef.current.click()} className="p-2 text-gray-400 hover:text-white"><Paperclip size={20} /></button>
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                    <form onSubmit={handleSend} className="flex-1 flex gap-2 items-center">
                        <input value={text} onChange={handleTypingInput} placeholder={isUploading ? "Uploading..." : "Type a message"} className="flex-1 bg-[#2a3942] text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none placeholder-gray-500" />
                        <button type="submit" className="p-2.5 bg-[#00a884] rounded-full text-white hover:bg-[#008f6f]">
                            {editingId ? <Check size={18} /> : <Send size={18} />}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

// ================= 3. REPO TABS COMPONENT =================
const RepoTabs = ({ repo, setShowInviteModal, presenceRoster, onPullRepo, onOpenFile }) => {
    const [activeTab, setActiveTab] = useState("MAIN");

    const formatLastSeen = (iso) => {
        if (!iso) return "unknown";
        return new Date(iso).toLocaleString();
    };

    return (
        <>
            <div className="flex px-4 gap-6 bg-[#151515] border-b border-white/5">
                {["MAIN", "GROUPS", "FILES"].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`text-xs font-bold py-3 border-b-2 transition-colors ${activeTab === tab ? "border-emerald-500 text-emerald-400" : "border-transparent text-gray-500"}`}>{tab}</button>
                ))}
            </div>
            <div className="flex-1 overflow-hidden relative">
                {activeTab === "MAIN" && <ChatComponent repo={repo} />}
                {activeTab === "FILES" && <FileExplorer repo={repo} onPullRepo={onPullRepo} onOpenFile={onOpenFile} />}
                {activeTab === "GROUPS" && (
                    <div className="p-6">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-4">Repository Members</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between bg-[#1A1A1A] p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/20">
                                        {(getRepoOwnerLogin(repo)?.[0] || "?").toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-white">{getRepoOwnerLogin(repo) || "unknown"}</p>
                                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">OWNER</span>
                                    </div>
                                </div>
                            </div>
                            {presenceRoster.map(member => (
                                <div key={member.username} className="flex items-center justify-between bg-[#1A1A1A] p-3 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-full ${member.status === "online" ? "bg-emerald-400" : "bg-gray-600"}`} />
                                        <div>
                                            <p className="font-bold text-sm text-white">{member.username}</p>
                                            <span className="text-[10px] text-gray-400">Last seen: {formatLastSeen(member.lastSeen)}</span>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${member.status === "online" ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
                                        {member.status === "online" ? "ONLINE" : "OFFLINE"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

// ================= 4. HOMEPAGE MAIN =================
const HomePage = () => {
    const { authUser, logout } = useAuthStore();
    const [repos, setRepos] = useState([]);
    const [selectedRepo, setSelectedRepo] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [presenceRoster, setPresenceRoster] = useState([]);
    const [showRepoPathModal, setShowRepoPathModal] = useState(false);
    const [repoBasePath, setRepoBasePath] = useState(DEFAULT_REPO_BASE_PATH);
    const [gitLoading, setGitLoading] = useState(false);
    
    // Invite States
    const [invites, setInvites] = useState([]);
    const [showInvites, setShowInvites] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteUsername, setInviteUsername] = useState("");
    const [inviteResults, setInviteResults] = useState([]);
    const [inviteLink, setInviteLink] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [showCommitModal, setShowCommitModal] = useState(false);
    const [commitMessage, setCommitMessage] = useState("");

    const [dataError, setDataError] = useState("");

    // Create Repo States
    const [showCreateRepoModal, setShowCreateRepoModal] = useState(false);
    const [createRepoLoading, setCreateRepoLoading] = useState(false);
    const [createRepoAdvanced, setCreateRepoAdvanced] = useState(false);
    const [createRepoError, setCreateRepoError] = useState("");
    const [newRepo, setNewRepo] = useState({
        ownerType: "user", // 'user' | 'org'
        org: "",
        name: "",
        description: "",
        homepage: "",
        visibility: "public", // 'public' | 'private' | 'internal'

        auto_init: true,
        gitignore_template: "",
        license_template: "",
        is_template: false,

        has_issues: true,
        has_projects: true,
        has_wiki: false,
        has_discussions: false,

        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true,
        delete_branch_on_merge: false,

        // Optional template repo generation
        template_owner: "",
        template_repo: "",
        include_all_branches: false
    });

    // 1. Fetch Repos & Invites
    // ✅ Important: do not let one failing request blank out everything.
    const fetchData = async () => {
        setDataError("");

        let nextRepos = [];
        let nextInvites = [];

        try {
            const repoRes = await axios.get("http://localhost:5000/api/repos");
            const raw = repoRes.data || [];

            // Dedupe by id (protects UI even if backend returns duplicates)
            const seen = new Set();
            nextRepos = [];
            for (const r of raw) {
                const key = r?.id !== undefined ? String(r.id) : "";
                if (!key) continue;
                if (seen.has(key)) continue;
                seen.add(key);
                nextRepos.push(r);
            }
        } catch (error) {
            console.error("Repo fetch failed", error);
            setDataError(prev => prev || (error?.response?.data?.error || "Failed to fetch repositories"));
            nextRepos = [];
        }

        try {
            const inviteRes = await axios.get("http://localhost:5000/api/invites/mine");
            nextInvites = inviteRes.data || [];
        } catch (error) {
            console.error("Invite fetch failed", error);
            setDataError(prev => prev || (error?.response?.data?.error || "Failed to fetch invites"));
            nextInvites = [];
        }

        setRepos(nextRepos);
        setInvites(nextInvites);
        return { repos: nextRepos, invites: nextInvites };
    };

    useEffect(() => { fetchData(); }, []);

    useEffect(() => {
        if (selectedRepo || repos.length === 0) return;
        const lastRepoId = localStorage.getItem("lastSelectedRepoId");
        if (!lastRepoId) return;
        const found = repos.find(r => String(r.id) === String(lastRepoId));
        if (found) setSelectedRepo(found);
    }, [repos, selectedRepo]);

    useEffect(() => {
        if (authUser?.repoBasePath) setRepoBasePath(authUser.repoBasePath);
    }, [authUser?.repoBasePath]);

    useEffect(() => {
        if (!authUser) return;
        const pendingToken = localStorage.getItem("pendingInviteToken");
        if (!pendingToken) return;

        axios.get(`http://localhost:5000/api/invites/accept/${pendingToken}`)
            .then((res) => {
                const repoId = res.data?.repoId;
                if (repoId) localStorage.setItem("lastSelectedRepoId", String(repoId));

                localStorage.removeItem("pendingInviteToken");
                return fetchData();
            })
            .then(({ repos }) => {
                const repoId = localStorage.getItem("lastSelectedRepoId");
                if (!repoId) return;
                const found = repos.find(r => String(r.id) === String(repoId));
                if (found) setSelectedRepo(found);
            })
            .catch(() => {});
    }, [authUser]);

    useEffect(() => {
        if (!selectedRepo || !authUser?.username) return;

        setPresenceRoster([]);
        socket.emit("joinRepo", { repoId: selectedRepo.id, username: authUser.username });

        const handleState = (roster) => setPresenceRoster(roster);
        const handleDelta = (delta) => {
            setPresenceRoster(prev => {
                const map = new Map(prev.map(p => [p.username, p]));
                map.set(delta.username, { ...map.get(delta.username), ...delta });
                return Array.from(map.values());
            });
        };

        socket.on("presence_state", handleState);
        socket.on("presence_delta", handleDelta);

        return () => {
            socket.off("presence_state", handleState);
            socket.off("presence_delta", handleDelta);
        };
    }, [selectedRepo, authUser?.username]);

    useEffect(() => {
        if (!showInviteModal) return;
        const q = inviteUsername.trim();
        if (!q) { setInviteResults([]); return; }

        setIsSearching(true);
        const t = setTimeout(() => {
            axios.get("http://localhost:5000/api/invites/search-users", { params: { q } })
                .then(res => setInviteResults(res.data || []))
                .catch(() => setInviteResults([]))
                .finally(() => setIsSearching(false));
        }, 300);

        return () => clearTimeout(t);
    }, [inviteUsername, showInviteModal]);

    const handleAcceptInvite = async (inviteId) => {
        try {
            const res = await axios.post("http://localhost:5000/api/invites/accept", { inviteId });

            const repoId = res.data?.repoId;
            if (repoId) localStorage.setItem("lastSelectedRepoId", String(repoId));

            const { repos } = await fetchData(); // Refresh repos
            setShowInvites(false);

            if (repoId) {
                const found = repos.find(r => String(r.id) === String(repoId));
                if (found) setSelectedRepo(found);
            }
        } catch (error) {
            console.error("Accept failed");
        }
    };

    const handleSendInvite = async () => {
        try {
            const ownerLogin = getRepoOwnerLogin(selectedRepo);
            const repoName = getRepoNameSafe(selectedRepo);
            if (!ownerLogin || !repoName) {
                alert("Repo metadata missing (owner/name). Try refreshing repos.");
                return;
            }

            const res = await axios.post("http://localhost:5000/api/invites/send", {
                receiverUsername: inviteUsername,
                repoId: selectedRepo.id,
                repoName,
                repoOwner: ownerLogin
            });
            setInviteLink(res.data?.inviteLink || "");
            alert("Invite sent! Copy the invite link below.");
        } catch (error) { alert("User not found or already invited"); }
    };

    const handleSaveRepoPath = async () => {
        try {
            await axios.post("http://localhost:5000/api/user/repo-path", { repoBasePath });
            setShowRepoPathModal(false);
        } catch (e) {
            alert("Failed to save repo path");
        }
    };

    const handlePullRepo = async () => {
        if (!selectedRepo) return;
        const basePathToUse = repoBasePath || DEFAULT_REPO_BASE_PATH;
        try {
            setGitLoading(true);
            if (!repoBasePath) {
                await axios.post("http://localhost:5000/api/user/repo-path", { repoBasePath: basePathToUse });
                setRepoBasePath(basePathToUse);
            }
            const ownerLogin = getRepoOwnerLogin(selectedRepo);
            const repoName = getRepoNameSafe(selectedRepo);
            if (!ownerLogin || !repoName) {
                alert("Repo metadata missing (owner/name). Try refreshing repos.");
                return;
            }
            await axios.post("http://localhost:5000/api/repos/pull", {
                owner: ownerLogin,
                repoName
            });
            alert("Repo pulled!");
        } catch (e) {
            alert("Pull failed. Check repo path and permissions.");
        } finally {
            setGitLoading(false);
        }
    };

    const handlePushRepo = async () => {
        if (!selectedRepo) return;
        const basePathToUse = repoBasePath || DEFAULT_REPO_BASE_PATH;
        try {
            setGitLoading(true);
            if (!repoBasePath) {
                await axios.post("http://localhost:5000/api/user/repo-path", { repoBasePath: basePathToUse });
                setRepoBasePath(basePathToUse);
            }
            const message = commitMessage || "";
            const ownerLogin = getRepoOwnerLogin(selectedRepo);
            const repoName = getRepoNameSafe(selectedRepo);
            if (!ownerLogin || !repoName) {
                alert("Repo metadata missing (owner/name). Try refreshing repos.");
                return;
            }
            await axios.post("http://localhost:5000/api/repos/push", {
                owner: ownerLogin,
                repoName,
                commitMessage: message
            });
            alert("Push complete.");
        } catch (e) {
            alert("Push failed. Ensure you have commits to push.");
        } finally {
            setGitLoading(false);
        }
    };

    const handleCreateRepo = async () => {
        const repoName = String(newRepo.name || "").trim();
        const org = String(newRepo.org || "").trim();

        setCreateRepoError("");

        if (!repoName) {
            setCreateRepoError("Repository name is required");
            return;
        }
        if (repoName.length > 100) {
            setCreateRepoError("Repository name is too long (max 100 chars)");
            return;
        }
        if (!/^[A-Za-z0-9_.-]+$/.test(repoName)) {
            setCreateRepoError("Invalid repository name (no spaces). Use letters, numbers, '.', '_' or '-'.");
            return;
        }
        if (newRepo.ownerType === "org" && !org) {
            setCreateRepoError("Organization name is required");
            return;
        }
        if (newRepo.visibility === "internal" && newRepo.ownerType !== "org") {
            setCreateRepoError("Internal visibility is only available for organization repos");
            return;
        }

        try {
            setCreateRepoLoading(true);

            const payload = {
                ...newRepo,
                name: repoName,
                org
            };

            const res = await axios.post("http://localhost:5000/api/repos/create", payload);
            const created = res.data?.repo;

            setShowCreateRepoModal(false);
            setCreateRepoAdvanced(false);
            setCreateRepoError("");

            // Refresh repos and auto-select the created one
            const { repos } = await fetchData();
            const found = created?.id
                ? repos.find(r => String(r.id) === String(created.id))
                : repos.find(r => r.name === repoName);

            if (found) {
                localStorage.setItem("lastSelectedRepoId", String(found.id));
                setSelectedRepo(found);
            }

        } catch (e) {
            const msg = e?.response?.data?.error || "Failed to create repository";
            setCreateRepoError(msg);
        } finally {
            setCreateRepoLoading(false);
        }
    };

    const sendToExtension = (message) => {
        if (window.parent !== window) {
            window.parent.postMessage(message, "*");
        }
    };

    const startGithubLogin = ({ promptLogin = false } = {}) => {
        const promptParam = promptLogin ? "prompt=login" : "";

        if (window.parent !== window) {
            // VS Code: include source=vscode so backend deep-links back into VS Code
            const qs = ["source=vscode", promptParam].filter(Boolean).join("&");
            const url = `http://localhost:5000/api/auth/github?${qs}`;
            sendToExtension({ command: 'loginGithub', url });
        } else {
            // Web: normal OAuth redirect back to the SPA
            const qs = [promptParam].filter(Boolean).join("&");
            window.location.href = `http://localhost:5000/api/auth/github${qs ? `?${qs}` : ""}`;
        }
    };

    const handleOpenFile = async (owner, repoName, filePath) => {
        try {
            const res = await axios.get("http://localhost:5000/api/repos/local-path", {
                params: { owner, repoName, filePath }
            });
            const fullPath = res.data.path;
            const vscodeUri = `vscode://file/${fullPath.replace(/\\/g, "/")}`;
            sendToExtension({ command: "openFile", path: fullPath, vscodeUri });
            window.open(vscodeUri, "_blank");
        } catch (e) {
            alert("File not found locally. Pull repo first.");
        }
    };

    const handleCopyInvite = async () => {
        if (!inviteLink) return;
        try {
            await navigator.clipboard.writeText(inviteLink);
        } catch (e) {}
    };

    const filteredRepos = repos.filter(repo => getRepoNameSafe(repo).toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-white p-4 md:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8 gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-emerald-500 to-blue-500 p-[1px]">
                            <img src={authUser?.avatarUrl} className="w-full h-full rounded-full bg-black object-cover" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold">Welcome, {authUser?.username}</h1>
                            <p className="text-sm text-gray-500 font-mono">Select a workspace</p>
                        </div>
                    </div>
                    {/* ??$$$ — Resume AI Brainstorm: shows when localStorage has an active session */}
                    {(() => {
                        try {
                            const s = JSON.parse(localStorage.getItem("hackbot_session_v2") || "{}");
                            if (s.messages && s.messages.length > 1) return (
                                <Link
                                    to="/ideation"
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 rounded-xl text-sm font-bold text-purple-300 hover:text-white transition relative"
                                >
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse" />
                                    <Sparkles size={15} />
                                    Resume AI Brainstorm
                                </Link>
                            );
                        } catch {}
                        return null;
                    })()}
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <button onClick={() => setShowInvites(!showInvites)} className="p-2 hover:bg-white/10 rounded-full relative">
                                <Bell size={20} className="text-gray-400" />
                                {invites.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>}
                            </button>
                            {showInvites && (
                                <div className="absolute right-0 top-12 w-64 bg-[#151515] border border-white/10 rounded-xl shadow-2xl z-50 p-2">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase px-2 py-1 mb-2">Pending Invites</h3>
                                    {invites.length === 0 ? <p className="text-sm text-gray-500 px-2 pb-2">No pending invites.</p> : invites.map(invite => (
                                        <div key={invite._id} className="p-2 hover:bg-white/5 rounded-lg flex justify-between items-center">
                                            <div><p className="text-sm font-bold text-white">{invite.repoName}</p><p className="text-xs text-emerald-400">from {invite.sender}</p></div>
                                            <button onClick={() => handleAcceptInvite(invite._id)} className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-full hover:bg-emerald-500"><Check size={14} /></button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={() => setShowRepoPathModal(true)} className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white">
                            <Settings size={18} />
                        </button>
                        <button
                            onClick={() => {
                                setNewRepo({
                                    ownerType: "user",
                                    org: "",
                                    name: "",
                                    description: "",
                                    homepage: "",
                                    visibility: "public",

                                    auto_init: true,
                                    gitignore_template: "",
                                    license_template: "",
                                    is_template: false,

                                    has_issues: true,
                                    has_projects: true,
                                    has_wiki: false,
                                    has_discussions: false,

                                    allow_squash_merge: true,
                                    allow_merge_commit: true,
                                    allow_rebase_merge: true,
                                    delete_branch_on_merge: false,

                                    template_owner: "",
                                    template_repo: "",
                                    include_all_branches: false
                                });
                                setCreateRepoError("");
                                setCreateRepoAdvanced(false);
                                setShowCreateRepoModal(true);
                            }}
                            className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white"
                            title="Create a new GitHub repository"
                        >
                            <Plus size={18} />
                        </button>
                        <button
                            onClick={async () => {
                                await logout();
                                // force GitHub to show account picker / login screen
                                startGithubLogin({ promptLogin: true });
                            }}
                            className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white"
                            title="Switch GitHub account"
                        >
                            <Github size={18} />
                        </button>
                        <button onClick={logout} className="text-gray-500 hover:text-red-400" title="Log out"><LogOut size={20} /></button>
                    </div>
                </div>

                {showCreateRepoModal && (
                    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                        <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/10 w-full max-w-lg">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold">Create a new repository</h3>
                                <button
                                    onClick={() => { setShowCreateRepoModal(false); setCreateRepoError(""); }}
                                    className="text-gray-400 hover:text-white"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {createRepoError && (
                                <div className="mb-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-2">
                                    {createRepoError}
                                </div>
                            )}

                            <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <div className="text-[11px] text-gray-400 mb-1">Owner</div>
                                        <select
                                            value={newRepo.ownerType}
                                            onChange={(e) => {
                                                const ownerType = e.target.value;
                                                setNewRepo(prev => ({ ...prev, ownerType, org: ownerType === "org" ? prev.org : "" }));
                                            }}
                                            className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                        >
                                            <option value="user">Personal ({authUser?.username})</option>
                                            <option value="org">Organization</option>
                                        </select>
                                    </div>

                                    {newRepo.ownerType === "org" ? (
                                        <div>
                                            <div className="text-[11px] text-gray-400 mb-1">Organization name</div>
                                            <input
                                                type="text"
                                                placeholder="my-org"
                                                className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                value={newRepo.org}
                                                onChange={(e) => setNewRepo(prev => ({ ...prev, org: e.target.value }))}
                                            />
                                        </div>
                                    ) : (
                                        <div />
                                    )}
                                </div>

                                <div>
                                    <div className="text-[11px] text-gray-400 mb-1">Repository name</div>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="my-new-repo"
                                        className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white outline-none"
                                        value={newRepo.name}
                                        onChange={(e) => setNewRepo(prev => ({ ...prev, name: e.target.value }))}
                                    />
                                    <div className="text-[10px] text-gray-500 mt-1">Allowed: letters, numbers, '.', '_' and '-'</div>
                                </div>

                                <div>
                                    <div className="text-[11px] text-gray-400 mb-1">Description (optional)</div>
                                    <input
                                        type="text"
                                        placeholder="What is this repo for?"
                                        className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white outline-none"
                                        value={newRepo.description}
                                        onChange={(e) => setNewRepo(prev => ({ ...prev, description: e.target.value }))}
                                    />
                                </div>

                                <div>
                                    <div className="text-[11px] text-gray-400 mb-2">Visibility</div>
                                    <div className="flex flex-wrap gap-3">
                                        <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="repoVisibility"
                                                checked={newRepo.visibility === "public"}
                                                onChange={() => setNewRepo(prev => ({ ...prev, visibility: "public" }))}
                                            />
                                            Public
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="repoVisibility"
                                                checked={newRepo.visibility === "private"}
                                                onChange={() => setNewRepo(prev => ({ ...prev, visibility: "private" }))}
                                            />
                                            Private
                                        </label>
                                        {newRepo.ownerType === "org" && (
                                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="repoVisibility"
                                                    checked={newRepo.visibility === "internal"}
                                                    onChange={() => setNewRepo(prev => ({ ...prev, visibility: "internal" }))}
                                                />
                                                Internal
                                            </label>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4">
                                    <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={newRepo.auto_init === true}
                                            onChange={(e) => setNewRepo(prev => ({ ...prev, auto_init: e.target.checked }))}
                                        />
                                        Initialize with README
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => setCreateRepoAdvanced(v => !v)}
                                        className="text-xs text-emerald-400 hover:text-emerald-300 underline"
                                    >
                                        {createRepoAdvanced ? "Hide advanced" : "Show advanced"}
                                    </button>
                                </div>

                                {createRepoAdvanced && (
                                    <div className="mt-2 border border-white/10 rounded-lg p-3 space-y-3 bg-black/20">
                                        <div>
                                            <div className="text-[11px] text-gray-400 mb-1">Homepage (optional)</div>
                                            <input
                                                type="text"
                                                placeholder="https://example.com"
                                                className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                value={newRepo.homepage}
                                                onChange={(e) => setNewRepo(prev => ({ ...prev, homepage: e.target.value }))}
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div>
                                                <div className="text-[11px] text-gray-400 mb-1">.gitignore template (optional)</div>
                                                <input
                                                    type="text"
                                                    placeholder="Node"
                                                    className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                    value={newRepo.gitignore_template}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, gitignore_template: e.target.value }))}
                                                />
                                            </div>
                                            <div>
                                                <div className="text-[11px] text-gray-400 mb-1">License template (optional)</div>
                                                <input
                                                    type="text"
                                                    placeholder="mit"
                                                    className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                    value={newRepo.license_template}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, license_template: e.target.value }))}
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newRepo.has_issues === true}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, has_issues: e.target.checked }))}
                                                />
                                                Issues
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newRepo.has_projects === true}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, has_projects: e.target.checked }))}
                                                />
                                                Projects
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newRepo.has_wiki === true}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, has_wiki: e.target.checked }))}
                                                />
                                                Wiki
                                            </label>
                                            <label className="flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newRepo.has_discussions === true}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, has_discussions: e.target.checked }))}
                                                />
                                                Discussions
                                            </label>
                                        </div>

                                        <div className="border-t border-white/10 pt-3">
                                            <div className="text-[11px] text-gray-400 mb-2">Create from template (optional)</div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <input
                                                    type="text"
                                                    placeholder="template owner"
                                                    className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                    value={newRepo.template_owner}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, template_owner: e.target.value }))}
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="template repo"
                                                    className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-sm text-white outline-none"
                                                    value={newRepo.template_repo}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, template_repo: e.target.value }))}
                                                />
                                            </div>
                                            <label className="mt-2 flex items-center gap-2 text-sm text-gray-200 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={newRepo.include_all_branches === true}
                                                    onChange={(e) => setNewRepo(prev => ({ ...prev, include_all_branches: e.target.checked }))}
                                                />
                                                Include all branches
                                            </label>
                                            <div className="text-[10px] text-gray-500 mt-1">
                                                If both template fields are set, the repo will be generated from that template.
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-2 mt-5">
                                <Link
                                    to="/ideation"
                                    state={{ newRepo }}
                                    className="flex-[1.5] py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold flex flex-row items-center justify-center gap-2"
                                >
                                    <Sparkles size={16} /> AI Brainstorm
                                </Link>
                                <button
                                    onClick={() => { setShowCreateRepoModal(false); setCreateRepoError(""); }}
                                    className="flex-1 py-2 bg-gray-800 rounded-lg text-sm"
                                    disabled={createRepoLoading}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleCreateRepo}
                                    className="flex-1 py-2 bg-emerald-600 rounded-lg text-sm font-bold disabled:opacity-60"
                                    disabled={createRepoLoading}
                                >
                                    {createRepoLoading ? "Creating..." : "Create"}
                                </button>
                            </div>

                            <div className="text-[10px] text-gray-500 mt-2">
                                Note: Creating private repos requires the OAuth token to have the <span className="text-gray-300">repo</span> scope.
                            </div>
                        </div>
                    </div>
                )}

                {dataError && (
                    <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-300 text-xs rounded-lg p-3">
                        {dataError}
                    </div>
                )}

                {/* Workspace / Grid Switcher */}
                        {selectedRepo ? (
                            <div className="flex flex-col h-[calc(100vh-8rem)] bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                                <div className="border-b border-white/5 bg-[#151515] p-4 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <button
                                            onClick={() => {
                                                localStorage.removeItem("lastSelectedRepoId");
                                                setSelectedRepo(null);
                                            }}
                                            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"
                                        >
                                            <ArrowLeft size={18} />
                                        </button>
                                        <h2 className="font-bold text-lg">{selectedRepo.name}</h2>
                                    </div>
                            <div className="flex gap-2">
                                <button onClick={handlePullRepo} disabled={gitLoading} className="flex items-center gap-2 text-xs bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 px-3 py-1.5 rounded-full border border-emerald-500/20">
                                    <FolderSync size={12} /> {gitLoading ? "Working..." : "Pull"}
                                </button>
                                <button
                                    onClick={() => { setCommitMessage(""); setShowCommitModal(true); }}
                                    disabled={gitLoading}
                                    className="flex items-center gap-2 text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 px-3 py-1.5 rounded-full border border-blue-500/20"
                                >
                                    <Upload size={12} /> Push
                                </button>
                                {/* 👇 FIX: Pass owner and repo params */}
                                <Link 
                                    to={`/architecture?owner=${encodeURIComponent(getRepoOwnerLogin(selectedRepo) || "")}&repo=${encodeURIComponent(getRepoNameSafe(selectedRepo) || "")}`}
                                    className="flex items-center gap-2 text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1.5 rounded-full border border-purple-500/20"
                                >
                                    <Network size={12} /> Visualize
                                </Link>
                                <Link
                                    to={`/data-flow?owner=${encodeURIComponent(getRepoOwnerLogin(selectedRepo) || "")}&repo=${encodeURIComponent(getRepoNameSafe(selectedRepo) || "")}`}
                                    className="flex items-center gap-2 text-xs bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 px-3 py-1.5 rounded-full border border-cyan-500/20"
                                >
                                    <Network size={12} /> Vizualize data flow
                                </Link>
                                <Link
                                    to="/ideation"
                                    state={{ newRepo: selectedRepo }}
                                    className="flex items-center gap-2 text-xs bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 px-3 py-1.5 rounded-full border border-purple-500/20"
                                >
                                    <Sparkles size={12} /> AI Brainstorm
                                </Link>
                                <button
                                    onClick={() => { setInviteUsername(""); setInviteResults([]); setInviteLink(""); setShowInviteModal(true); }}
                                    className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5"
                                >
                                    <Plus size={12} /> Invite
                                </button>
                            </div>
                        </div>
                        {showCommitModal && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/10 w-full max-w-sm">
                                    <h3 className="text-lg font-bold mb-4">Commit and Push</h3>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="Commit message (optional)"
                                        className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white mb-4 focus:border-emerald-500 outline-none"
                                        value={commitMessage}
                                        onChange={(e) => setCommitMessage(e.target.value)}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowCommitModal(false); setCommitMessage(""); }} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
                                        <button
                                            onClick={() => { setShowCommitModal(false); handlePushRepo(); }}
                                            className="flex-1 py-2 bg-emerald-600 rounded-lg text-sm font-bold"
                                        >
                                            Push
                                        </button>
                                    </div>
                                    <div className="text-[11px] text-gray-500 mt-2">Leave empty to push existing commits only.</div>
                                </div>
                            </div>
                        )}

                        {showInviteModal && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/10 w-full max-w-sm">
                                    <h3 className="text-lg font-bold mb-4">Invite to {selectedRepo.name}</h3>
                                    <input autoFocus type="text" placeholder="Search GitHub username..." className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white mb-2 focus:border-emerald-500 outline-none" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} />

                                    {isSearching && <div className="text-xs text-gray-500 mb-2">Searching...</div>}
                                    {inviteResults.length > 0 && (
                                        <div className="max-h-40 overflow-auto mb-3 bg-[#0C0C0C] border border-white/10 rounded-lg">
                                            {inviteResults.map(u => (
                                                <button key={u.id} onClick={() => setInviteUsername(u.login)} className="w-full flex items-center gap-2 p-2 hover:bg-white/5 text-left">
                                                    <img src={u.avatar_url} className="w-6 h-6 rounded-full" />
                                                    <span className="text-sm text-white">{u.login}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {inviteLink && (
                                        <div className="mb-3">
                                            <div className="text-[11px] text-gray-400 mb-1">Invite Link</div>
                                            <div className="flex gap-2">
                                                <input readOnly value={inviteLink} className="flex-1 bg-[#0C0C0C] border border-white/10 rounded-lg p-2 text-xs text-white" />
                                                <button onClick={handleCopyInvite} className="px-3 bg-emerald-600 rounded-lg text-xs font-bold flex items-center gap-1"><Copy size={12} /> Copy</button>
                                            </div>
                                            <div className="text-[10px] text-gray-500 mt-1">Share this in GitHub issues/PRs or DM.</div>
                                        </div>
                                    )}

                                    <div className="flex gap-2">
                                        <button onClick={() => { setShowInviteModal(false); setInviteUsername(""); setInviteResults([]); setInviteLink(""); }} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
                                        <button onClick={handleSendInvite} className="flex-1 py-2 bg-emerald-600 rounded-lg text-sm font-bold">Send</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {showRepoPathModal && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/10 w-full max-w-sm">
                                    <h3 className="text-lg font-bold mb-4">Local Repo Path</h3>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="C:\\Users\\User\\Repos"
                                        className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white mb-4 focus:border-emerald-500 outline-none"
                                        value={repoBasePath}
                                        onChange={(e) => setRepoBasePath(e.target.value)}
                                    />
                                    <div className="flex gap-2">
                                        <button onClick={() => setShowRepoPathModal(false)} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button>
                                        <button onClick={handleSaveRepoPath} className="flex-1 py-2 bg-emerald-600 rounded-lg text-sm font-bold">Save</button>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="flex-1 flex flex-col">
                            <RepoTabs repo={selectedRepo} setShowInviteModal={setShowInviteModal} presenceRoster={presenceRoster} onPullRepo={handlePullRepo} onOpenFile={handleOpenFile} />
                        </div>
                    </div>
                ) : (
                    <div>
                        {filteredRepos.length === 0 ? (
                            <div className="bg-[#111]/50 border border-white/10 rounded-xl p-8 text-center">
                                <div className="text-sm font-bold text-gray-200 mb-2">No repositories found</div>
                                <div className="text-xs text-gray-500 mb-4">
                                    If you just accepted an invite, try refreshing. Otherwise create a new repo using the + button.
                                </div>
                                <button
                                    onClick={() => fetchData()}
                                    className="text-xs bg-white/10 hover:bg-white/15 px-3 py-2 rounded"
                                >
                                    Refresh
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {filteredRepos.map((repo) => (
                            <div
                                key={repo.id}
                                onClick={() => {
                                    localStorage.setItem("lastSelectedRepoId", String(repo.id));
                                    setSelectedRepo(repo);
                                }}
                                className={`group bg-[#111]/50 border hover:border-emerald-500/30 p-5 rounded-xl cursor-pointer ${repo.isShared ? 'border-purple-500/30' : 'border-white/5'}`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <h3 className="font-semibold text-gray-200 truncate w-3/4">{repo.name}</h3>
                                    {repo.isShared && <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded">SHARED</span>}
                                </div>
                                <p className="text-gray-500 text-xs line-clamp-2 h-8">{repo.description || "No description."}</p>
                            </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default HomePage;
