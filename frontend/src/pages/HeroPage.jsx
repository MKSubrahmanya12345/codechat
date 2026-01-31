import { Github, Terminal } from "lucide-react";

const HeroPage = () => {
    const handleLogin = () => {
        // Redirects directly to backend to start OAuth flow
        window.location.href = "http://localhost:5000/api/auth/github";
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 font-mono">
            <div className="max-w-2xl text-center space-y-8">
                <div className="flex justify-center mb-6">
                    <Terminal className="w-16 h-16 text-emerald-400" />
                </div>
                
                <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent">
                    VSCode Chat Extension
                </h1>
                
                <p className="text-gray-400 text-lg">
                    Seamlessly communicate with your team directly from your editor. 
                    Repository-based channels, real-time collaboration, and zero context switching.
                </p>

                <div className="p-6 border border-gray-800 rounded-lg bg-gray-900/50 text-left">
                    <p className="text-emerald-400">$ git clone vs-chat</p>
                    <p className="text-gray-500">Cloning into 'vs-chat'...</p>
                    <p className="text-gray-500">Done.</p>
                </div>

                <button 
                    onClick={handleLogin}
                    className="flex items-center gap-3 px-6 py-3 bg-gray-100 text-gray-900 rounded-full font-bold hover:bg-white transition-all mx-auto"
                >
                    <Github className="w-5 h-5" />
                    Login with GitHub
                </button>
            </div>
        </div>
    );
};

export default HeroPage;