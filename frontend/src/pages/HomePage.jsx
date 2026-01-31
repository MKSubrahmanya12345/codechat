import { useAuthStore } from "../store/authUser";
import { LogOut } from "lucide-react";

const HomePage = () => {
    const { authUser, logout } = useAuthStore();

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-12">
                    <h2 className="text-2xl font-bold">Dashboard</h2>
                    <button onClick={logout} className="flex items-center gap-2 text-red-500 hover:text-red-600">
                        <LogOut size={18} /> Logout
                    </button>
                </header>

                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 flex items-center gap-6">
                    <img 
                        src={authUser?.avatarUrl} 
                        alt="Profile" 
                        className="w-24 h-24 rounded-full border-4 border-emerald-100"
                    />
                    <div>
                        <h3 className="text-3xl font-bold">{authUser?.username}</h3>
                        <p className="text-gray-500">Connected via GitHub</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;