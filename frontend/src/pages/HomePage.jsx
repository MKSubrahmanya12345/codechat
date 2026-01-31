import { useEffect, useState, useRef } from "react";
import { useAuthStore } from "../store/authUser";
import { 
    LogOut, Star, GitFork, MessageSquare, ArrowLeft, Send, Search, 
    Folder, FileCode, Users, Hash, ChevronLeft, Bell, Plus, Check, 
    Paperclip, X, MoreVertical 
} from "lucide-react";
import axios from "axios";
import io from "socket.io-client";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const socket = io("http://localhost:5000");

// ================= 1. FILE EXPLORER COMPONENT =================
// Moved OUTSIDE HomePage to prevent re-renders
const FileExplorer = ({ repo }) => {
    const [files, setFiles] = useState([]);
    const [currentPath, setCurrentPath] = useState("");
    const [loading, setLoading] = useState(false);
    const [viewingFile, setViewingFile] = useState(null);
    const [fileContent, setFileContent] = useState("");

    const fetchFiles = async (path = "") => {
        setLoading(true);
        try {
            const owner = typeof repo.owner === 'object' ? repo.owner.login : repo.owner;
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
                const owner = typeof repo.owner === "object" ? repo.owner.login : repo.owner;
                const res = await axios.get("http://localhost:5000/api/repos/content", {
                    params: { owner, repoName: repo.name, path: file.path }
                });
                setFileContent(res.data.content);
            } catch (error) {
                setFileContent("Error loading file content.");
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0C0C0C] relative">
            <div className="flex items-center gap-2 p-3 border-b border-white/5 text-sm text-gray-400 font-mono">
                <button onClick={handleGoBack} disabled={!currentPath} className="p-1 hover:text-white disabled:opacity-30">
                    <ChevronLeft size={16} />
                </button>
                <span className="text-emerald-500">root</span>
                {currentPath && <span className="text-gray-600">/</span>}
                <span>{currentPath}</span>
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
                        <span className="text-sm font-mono text-emerald-400 flex items-center gap-2"><FileCode size={14} /> {viewingFile}</span>
                        <button onClick={() => setViewingFile(null)} className="text-gray-400 hover:text-white"><X size={18} /></button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 bg-[#1e1e1e]">
                        <SyntaxHighlighter style={vscDarkPlus} language="javascript" customStyle={{ margin: 0, padding: 0, background: 'transparent' }}>
                            {fileContent}
                        </SyntaxHighlighter>
                    </div>
                </div>
            )}
        </div>
    );
};

// ================= 2. CHAT COMPONENT =================
// Moved OUTSIDE HomePage to prevent re-renders
const ChatComponent = ({ repo }) => {
    const { authUser } = useAuthStore(); // Access store directly
    const [messages, setMessages] = useState([]);
    const [text, setText] = useState("");
    const [typingUsers, setTypingUsers] = useState(new Set());
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const bottomRef = useRef(null);
    const fileInputRef = useRef(null);
    const typingTimeoutRef = useRef(null);

    useEffect(() => {
        socket.emit("joinRepo", repo.id);
        axios.get(`http://localhost:5000/api/repos/${repo.id}/messages`)
            .then((res) => setMessages(res.data))
            .catch(console.error);

        const handleMsg = (msg) => setMessages(prev => [...prev, msg]);
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
            socket.off("receiveMessage"); socket.off("messageUpdated");
            socket.off("messageDeleted"); socket.off("userTyping"); socket.off("userStoppedTyping");
        };
    }, [repo.id]);

    useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [messages, typingUsers]);

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
                // 👇 FIX: Removed confirm() because VS Code blocks it.
                // It will now delete immediately when clicked.
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
                                        <ReactMarkdown components={{ code({node, inline, className, children, ...props}) { return <code className={`${inline ? "bg-black/20 px-1 rounded" : "block bg-black/30 p-2 rounded text-xs"} font-mono text-emerald-300`} {...props}>{children}</code> }}}>
                                            {m.text}
                                        </ReactMarkdown>
                                    )}
                                </div>

                                <div className="absolute bottom-1 right-2 flex items-end gap-1 select-none">
                                    {m.isEdited && <span className="text-[10px] text-gray-400 italic">edited</span>}
                                    <span className="text-[10px] text-gray-400">{formatTime(m.createdAt)}</span>
                                    {isMe && <span className={m.status === 'read' ? "text-[#53bdeb]" : "text-gray-400"}>✓✓</span>}
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
// Moved OUTSIDE HomePage to prevent re-renders
const RepoTabs = ({ repo }) => {
    const [activeTab, setActiveTab] = useState("MAIN");
    const [members, setMembers] = useState([]);

    useEffect(() => {
        if (activeTab === "GROUPS") {
            axios.get(`http://localhost:5000/api/repos/${repo.id}/members`)
                .then(res => setMembers(res.data))
                .catch(console.error);
        }
    }, [activeTab, repo.id]);

    return (
        <>
            <div className="flex px-4 gap-6 bg-[#151515] border-b border-white/5">
                {["MAIN", "GROUPS", "FILES"].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`text-xs font-bold py-3 border-b-2 transition-colors ${activeTab === tab ? "border-emerald-500 text-emerald-400" : "border-transparent text-gray-500"}`}>{tab}</button>
                ))}
            </div>
            <div className="flex-1 overflow-hidden relative">
                {/* Now using direct components, not props */}
                {activeTab === "MAIN" && <ChatComponent repo={repo} />}
                {activeTab === "FILES" && <FileExplorer repo={repo} />}
                {activeTab === "GROUPS" && (
                    <div className="p-6">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-4">Repository Members</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between bg-[#1A1A1A] p-3 rounded-lg border border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-emerald-900/50 flex items-center justify-center text-emerald-400 font-bold border border-emerald-500/20">
                                        {(typeof repo.owner === 'object' ? repo.owner.login : repo.owner)[0].toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-bold text-sm text-white">{typeof repo.owner === 'object' ? repo.owner.login : repo.owner}</p>
                                        <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">OWNER</span>
                                    </div>
                                </div>
                            </div>
                            {members.map(member => (
                                <div key={member._id} className="flex items-center justify-between bg-[#1A1A1A] p-3 rounded-lg border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <img src={member.avatarUrl} className="w-8 h-8 rounded-full bg-black" />
                                        <div>
                                            <p className="font-bold text-sm text-white">{member.username}</p>
                                            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">MEMBER</span>
                                        </div>
                                    </div>
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
    
    // Invite States
    const [invites, setInvites] = useState([]);
    const [showInvites, setShowInvites] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteUsername, setInviteUsername] = useState("");

    // 1. Fetch Repos & Invites
    const fetchData = async () => {
        try {
            const [repoRes, inviteRes] = await Promise.all([
                axios.get("http://localhost:5000/api/repos"),
                axios.get("http://localhost:5000/api/invites/mine")
            ]);
            setRepos(repoRes.data);
            setInvites(inviteRes.data);
        } catch (error) { console.error(error); }
    };

    useEffect(() => { fetchData(); }, []);

    const handleAcceptInvite = async (inviteId) => {
        try {
            await axios.post("http://localhost:5000/api/invites/accept", { inviteId });
            fetchData(); // Refresh repos
            setShowInvites(false);
        } catch (error) { console.error("Accept failed"); }
    };

    const handleSendInvite = async () => {
        try {
            await axios.post("http://localhost:5000/api/invites/send", {
                receiverUsername: inviteUsername,
                repoId: selectedRepo.id,
                repoName: selectedRepo.name,
                repoOwner: typeof selectedRepo.owner === 'object' ? selectedRepo.owner.login : selectedRepo.owner
            });
            setShowInviteModal(false);
            setInviteUsername("");
            alert("Invite sent!");
        } catch (error) { alert("User not found or already invited"); }
    };

    const filteredRepos = repos.filter(repo => repo.name.toLowerCase().includes(searchQuery.toLowerCase()));

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
                        <button onClick={logout} className="text-gray-500 hover:text-red-400"><LogOut size={20} /></button>
                    </div>
                </div>

                {/* Workspace / Grid Switcher */}
                {selectedRepo ? (
                    <div className="flex flex-col h-[calc(100vh-8rem)] bg-[#111] border border-white/10 rounded-xl overflow-hidden shadow-2xl relative">
                        <div className="border-b border-white/5 bg-[#151515] p-4 flex justify-between items-center">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setSelectedRepo(null)} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ArrowLeft size={18} /></button>
                                <h2 className="font-bold text-lg">{selectedRepo.name}</h2>
                            </div>
                            <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full border border-white/5"><Plus size={12} /> Invite</button>
                        </div>
                        {showInviteModal && (
                            <div className="absolute inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                                <div className="bg-[#1A1A1A] p-6 rounded-xl border border-white/10 w-full max-w-sm">
                                    <h3 className="text-lg font-bold mb-4">Invite to {selectedRepo.name}</h3>
                                    <input autoFocus type="text" placeholder="Enter username..." className="w-full bg-[#0C0C0C] border border-white/10 rounded-lg p-3 text-sm text-white mb-4 focus:border-emerald-500 outline-none" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} />
                                    <div className="flex gap-2"><button onClick={() => setShowInviteModal(false)} className="flex-1 py-2 bg-gray-800 rounded-lg text-sm">Cancel</button><button onClick={handleSendInvite} className="flex-1 py-2 bg-emerald-600 rounded-lg text-sm font-bold">Send</button></div>
                                </div>
                            </div>
                        )}
                        <div className="flex-1 flex flex-col">
                            {/* Updated Usage: No props needed for sub-components, just the repo */}
                            <RepoTabs repo={selectedRepo} />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {filteredRepos.map((repo) => (
                            <div key={repo.id} onClick={() => setSelectedRepo(repo)} className={`group bg-[#111]/50 border hover:border-emerald-500/30 p-5 rounded-xl cursor-pointer ${repo.isShared ? 'border-purple-500/30' : 'border-white/5'}`}>
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
        </div>
    );
};

export default HomePage;