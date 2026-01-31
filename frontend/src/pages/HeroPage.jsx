import { Github, Terminal } from "lucide-react";

const HeroPage = () => {
    const handleLogin = () => {
        // Send a message "UP" to the parent window (VS Code Extension)
        window.parent.postMessage({ 
            command: 'loginGithub', 
            url: "http://localhost:5000/api/auth/github" 
        }, "*");
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8 font-mono">
            {/* ... (Keep your existing UI design here) ... */}
            
            <button 
                onClick={handleLogin}
                className="flex items-center gap-3 px-6 py-3 bg-gray-100 text-gray-900 rounded-full font-bold hover:bg-white transition-all mx-auto"
            >
                <Github className="w-5 h-5" />
                Login with GitHub
            </button>
            
            {/* ... */}
        </div>
    );
};

export default HeroPage;