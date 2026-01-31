import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authUser";
import HomePage from "./pages/HomePage";
import HeroPage from "./pages/HeroPage";
import { Loader } from "lucide-react";
import axios from "axios"; // 👈 IMPORT AXIOS

function App() {
    const { authUser, checkAuth, isCheckingAuth } = useAuthStore();

    // 1. On Load: Check if we have a saved token and Attach it
    useEffect(() => {
        const jwt = localStorage.getItem("jwt");
        if (jwt) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${jwt}`; // 👈 CRITICAL FIX
            checkAuth();
        } else {
            checkAuth(); 
        }
    }, [checkAuth]);

    // 2. On Login Success: Receive token, Save it, Attach it
    useEffect(() => {
        const handleMessage = (event) => {
            if (event?.data?.command === "authSuccess") {
                const token = event.data.token;
                if (!token) return;

                localStorage.setItem("jwt", token);
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`; // 👈 CRITICAL FIX
                checkAuth(); 
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, [checkAuth]);

    if (isCheckingAuth) {
        return (
            <div className="h-screen bg-gray-950 flex items-center justify-center text-white">
                <Loader className="animate-spin" size={32} />
            </div>
        );
    }

    return (
        <Routes>
            <Route path="/" element={!authUser ? <HeroPage /> : <Navigate to="/home" />} />
            <Route path="/home" element={authUser ? <HomePage /> : <Navigate to="/" />} />
        </Routes>
    );
}

export default App;