import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authUser";
import { LogOut, Star, GitFork, MessageSquare, X } from "lucide-react";
import axios from "axios";
import io from "socket.io-client";

// socket outside component (IMPORTANT)
const socket = io("http://localhost:5000");

const HomePage = () => {
    const { authUser, logout } = useAuthStore();
    const [repos, setRepos] = useState([]);

    // chat state
    const [activeRepo, setActiveRepo] = useState(null);
    const [msg, setMsg] = useState("");
    const [messages, setMessages] = useState([]);

    /* ---------------- repos ---------------- */
    useEffect(() => {
        const fetchRepos = async () => {
            try {
                const res = await axios.get("http://localhost:5000/api/repos");
                setRepos(res.data);
            } catch (err) {
                console.error(err);
            }
        };
        fetchRepos();
    }, []);

    /* ---------------- socket ---------------- */
    useEffect(() => {
        socket.on("receiveMessage", (data) => {
            setMessages((prev) => [...prev, data]);
        });

        return () => socket.off("receiveMessage");
    }, []);

    const openChat = (repo) => {
        setActiveRepo(repo);
        setMessages([]);
        socket.emit("joinRepo", { repoId: repo.id });
    };

    const sendMessage = () => {
        if (!msg.trim()) return;

        socket.emit("sendMessage", {
            text: msg,
            sender: authUser.username,
            repoId: activeRepo.id
        });

        setMsg("");
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8 font-mono">
            <div className="max-w-6xl mx-auto">
                
                {/* Header */}
                <div className="flex justify-between items-center mb-12 p-6 glass rounded-xl">
                    <div className="flex items-center gap-4">
                        <img
                            src={authUser?.avatarUrl}
                            className="w-16 h-16 rounded-full border-2 border-emerald-500"
                        />
                        <div>
                            <h1 className="text-2xl font-bold">
                                {authUser?.username}'s Repositories
                            </h1>
                            <p className="text-gray-400 text-sm">
                                Select a repo to start chatting
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={logout}
                        className="text-red-400 hover:text-red-300 flex items-center gap-2"
                    >
                        <LogOut size={18} />
                        Logout
                    </button>
                </div>

                {/* Repo Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {repos.map((repo) => (
                        <div
                            key={repo.id}
                            className="glass p-6 rounded-xl hover:border-emerald-500/50 transition-all"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="font-bold text-lg text-emerald-400 truncate w-3/4">
                                    {repo.name}
                                </h3>
                                <span className="text-xs bg-gray-800 px-2 py-1 rounded text-gray-400">
                                    {repo.private ? "Private" : "Public"}
                                </span>
                            </div>

                            <p className="text-gray-400 text-sm h-12 overflow-hidden mb-4">
                                {repo.description || "No description available"}
                            </p>

                            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                                <span className="flex items-center gap-1">
                                    <Star size={14} className="text-yellow-500" />
                                    {repo.stargazers_count}
                                </span>
                                <span className="flex items-center gap-1">
                                    <GitFork size={14} className="text-blue-500" />
                                    {repo.forks_count}
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded-full bg-purple-500" />
                                    {repo.language || "N/A"}
                                </span>
                            </div>

                            <button
                                onClick={() => openChat(repo)}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                            >
                                <MessageSquare size={18} />
                                CHAT
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ---------------- CHAT PANEL ---------------- */}
            {activeRepo && (
                <div className="fixed bottom-6 right-6 w-96 bg-gray-900 rounded-xl shadow-xl border border-gray-800 flex flex-col">
                    
                    <div className="flex justify-between items-center p-4 border-b border-gray-800">
                        <h3 className="font-bold text-emerald-400 truncate">
                            {activeRepo.name}
                        </h3>
                        <button onClick={() => setActiveRepo(null)}>
                            <X size={18} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {messages.map((m, i) => (
                            <div key={i}>
                                <span className="font-bold text-emerald-400">
                                    {m.sender}:
                                </span>{" "}
                                {m.text}
                            </div>
                        ))}
                    </div>

                    <div className="p-3 flex gap-2 border-t border-gray-800">
                        <input
                            className="flex-1 bg-gray-800 p-2 rounded"
                            value={msg}
                            onChange={(e) => setMsg(e.target.value)}
                            placeholder="Type a message..."
                        />
                        <button
                            onClick={sendMessage}
                            className="bg-emerald-600 px-4 rounded"
                        >
                            Send
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HomePage;
