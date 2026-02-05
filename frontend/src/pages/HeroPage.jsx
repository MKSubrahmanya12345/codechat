import { useState } from "react";
import { Github, Terminal, Zap, Shield, Globe, Menu, X, ArrowRight, UserPlus, Users, CheckCheck, Code2, Paperclip, Activity } from "lucide-react";

const HeroPage = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleLogin = () => {
        // VS Code / Web Login Logic
        if (window.parent !== window) {
            window.parent.postMessage({ 
                command: 'loginGithub', 
                url: "http://localhost:5000/api/auth/github" 
            }, "*");
        } else {
            window.location.href = "http://localhost:5000/api/auth/github";
        }
    };

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-white font-sans selection:bg-emerald-500/30">
            
            {/* Navbar */}
            <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#0C0C0C]/80 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    {/* Logo */}
                    <div className="flex items-center gap-2 font-mono text-emerald-400">
                        <Terminal size={20} />
                        <span className="font-bold tracking-tight">CodeChat</span>
                    </div>

                    {/* Desktop Menu */}
                    <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
                        <a href="#features" className="hover:text-white transition-colors">Features</a>
                        <a href="#security" className="hover:text-white transition-colors">Security</a>
                        <button 
                            onClick={handleLogin}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-md font-medium transition-all flex items-center gap-2"
                        >
                            <Github size={16} /> Sign In
                        </button>
                    </div>

                    {/* Mobile Hamburger */}
                    <button 
                        className="md:hidden text-gray-400"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>

                {/* Mobile Menu Dropdown */}
                {isMenuOpen && (
                    <div className="md:hidden absolute top-16 w-full bg-[#0C0C0C] border-b border-white/10 p-6 flex flex-col gap-4">
                        <a href="#features" className="text-gray-400 hover:text-white">Features</a>
                        <a href="#security" className="text-gray-400 hover:text-white">Security</a>
                        <button 
                            onClick={handleLogin}
                            className="bg-white/10 text-white py-3 rounded-md flex justify-center items-center gap-2"
                        >
                            <Github size={18} /> Sign In
                        </button>
                    </div>
                )}
            </nav>

            {/* Hero Section */}
            <main className="pt-32 pb-16 px-6 max-w-6xl mx-auto flex flex-col items-center text-center">
                
                {/* Badge */}
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-emerald-400 mb-8 animate-fade-in-up">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    v1.0 Web App Live
                </div>

                {/* Headline */}
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter mb-6">
                    Chat with your <br className="hidden md:block" />
                    <span className="bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent"> codebase.</span>
                </h1>

                {/* Subtext */}
                <p className="text-lg md:text-xl text-gray-500 max-w-2xl mb-10 leading-relaxed">
                    A GitHub-native team chat built for engineers. 
                    Invite anyone instantly, see who is online, and keep code context right inside the conversation.
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
                    <button 
                        onClick={handleLogin}
                        className="px-8 py-3 bg-white text-black rounded-lg font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                    >
                        <Github size={20} /> Start for Free
                    </button>
                    <button className="px-8 py-3 bg-white/5 border border-white/10 text-white rounded-lg font-bold hover:bg-white/10 transition-all flex items-center justify-center gap-2 group">
                        View Documentation <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>

                {/* Code Snippet Visual */}
                <div className="mt-20 w-full max-w-4xl mx-auto rounded-xl border border-white/10 bg-[#000] shadow-2xl shadow-emerald-900/20 overflow-hidden relative group">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#151515]">
                        <div className="w-3 h-3 rounded-full bg-red-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500/50"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500/50"></div>
                        <span className="ml-4 text-xs text-gray-600 font-mono">extension.ts</span>
                    </div>
                    <div className="p-6 text-left font-mono text-sm md:text-base overflow-x-auto">
                        <div className="text-gray-500">// Initialize VS Code Chat</div>
                        <div className="text-purple-400">const <span className="text-blue-400">chat</span> = <span className="text-yellow-400">new</span> <span className="text-emerald-400">CodeChat</span>();</div>
                        <div className="text-purple-400">await <span className="text-blue-400">chat</span>.<span className="text-blue-300">connect</span>(<span className="text-orange-400">"repo-id"</span>);</div>
                        <br />
                        <div className="text-gray-500">// Real-time collaboration</div>
                        <div className="text-purple-400">socket.<span className="text-blue-300">on</span>(<span className="text-orange-400">"message"</span>, (<span className="text-red-300">msg</span>) <span className="text-purple-400">=&gt;</span> &#123;</div>
                        <div className="pl-4 text-emerald-300">console.log(<span className="text-orange-400">"New message:"</span>, msg);</div>
                        <div className="text-purple-400">&#125;);</div>
                    </div>
                    {/* Glow Effect */}
                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent pointer-events-none"></div>
                </div>

            </main>

            {/* Features Grid */}
            <section id="features" className="py-24 border-t border-white/5 bg-[#0C0C0C]">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-emerald-500/30 transition-colors">
                            <UserPlus className="w-10 h-10 text-emerald-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Viral Invites</h3>
                            <p className="text-gray-500">Invite any GitHub user and share a link instantly. No account required to receive it.</p>
                        </div>
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-blue-500/30 transition-colors">
                            <Users className="w-10 h-10 text-blue-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Roster Presence</h3>
                            <p className="text-gray-500">See who is online with last-seen timestamps so you know who is available.</p>
                        </div>
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-purple-500/30 transition-colors">
                            <CheckCheck className="w-10 h-10 text-purple-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Group Read Receipts</h3>
                            <p className="text-gray-500">Know exactly who read critical messages with per-user read tracking.</p>
                        </div>
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-amber-500/30 transition-colors">
                            <Code2 className="w-10 h-10 text-amber-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Code Anchor</h3>
                            <p className="text-gray-500">Paste GitHub links with line ranges and auto-expand code snippets.</p>
                        </div>
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-emerald-500/30 transition-colors">
                            <Paperclip className="w-10 h-10 text-emerald-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">File Sharing</h3>
                            <p className="text-gray-500">Share images and files in chat with clean previews and quick open.</p>
                        </div>
                        <div className="p-6 rounded-xl border border-white/5 bg-[#111] hover:border-cyan-500/30 transition-colors">
                            <Activity className="w-10 h-10 text-cyan-400 mb-4" />
                            <h3 className="text-xl font-bold mb-2">Real-Time Flow</h3>
                            <p className="text-gray-500">Typing indicators, reactions, and live updates keep teams in sync.</p>
                        </div>
                    </div>
                </div>
            </section>

        </div>
    );
};

export default HeroPage;
