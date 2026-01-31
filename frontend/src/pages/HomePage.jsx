import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authUser";
import { LogOut, Star, GitFork, MessageSquare } from "lucide-react";
import axios from "axios";

const HomePage = () => {
    const { authUser, logout } = useAuthStore();
    const [repos, setRepos] = useState([]);

    useEffect(() => {
        const fetchRepos = async () => {
            try {
                const res = await axios.get("http://localhost:5000/api/repos");
                setRepos(res.data);
            } catch (error) {
                console.error(error);
            }
        };
        fetchRepos();
    }, []);

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8 font-mono">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-12 p-6 glass rounded-xl">
                    <div className="flex items-center gap-4">
                        <img src={authUser?.avatarUrl} className="w-16 h-16 rounded-full border-2 border-emerald-500" />
                        <div>
                            <h1 className="text-2xl font-bold">{authUser?.username}'s Repositories</h1>
                            <p className="text-gray-400 text-sm">Select a repo to start chatting</p>
                        </div>
                    </div>
                    <button onClick={logout} className="text-red-400 hover:text-red-300 flex items-center gap-2">
                        <LogOut size={18} /> Logout
                    </button>
                </div>

                {/* Repo Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {repos.map((repo) => (
                        <div key={repo.id} className="glass p-6 rounded-xl hover:border-emerald-500/50 transition-all group">
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
                                    <Star size={14} className="text-yellow-500" /> {repo.stargazers_count}
                                </span>
                                <span className="flex items-center gap-1">
                                    <GitFork size={14} className="text-blue-500" /> {repo.forks_count}
                                </span>
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 rounded-full bg-purple-500"></span> {repo.language || "N/A"}
                                </span>
                            </div>

                            <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors">
                                <MessageSquare size={18} />
                                CHAT
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default HomePage;