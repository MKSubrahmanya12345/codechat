import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authUser";
import HomePage from "./pages/HomePage";
import HeroPage from "./pages/HeroPage";
import { Loader } from "lucide-react";
import ArchitecturePage from "./pages/ArchitecturePage";
import DataFlowPage from "./pages/DataFlowPage";
import InviteAcceptPage from "./pages/InviteAcceptPage";
import IdeationPage from "./pages/IdeationPage";
import PipelinePage from "./pages/PipelinePage";
import axios from "axios";

function App() {
    const { authUser, checkAuth, isCheckingAuth } = useAuthStore();

    useEffect(() => {
        const jwt = localStorage.getItem("jwt");
        if (jwt) {
            axios.defaults.headers.common.Authorization = `Bearer ${jwt}`;
        } else {
            delete axios.defaults.headers.common.Authorization;
        }
        checkAuth();
    }, [checkAuth]);

    useEffect(() => {
        const handleMessage = (event) => {
            if (event?.data?.command === "authSuccess") {
                const token = event.data.token;
                if (!token) return;

                localStorage.setItem("jwt", token);
                axios.defaults.headers.common.Authorization = `Bearer ${token}`;
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
            <Route path="/architecture" element={authUser ? <ArchitecturePage /> : <Navigate to="/" />} />
            <Route path="/data-flow" element={authUser ? <DataFlowPage /> : <Navigate to="/" />} />
            <Route path="/ideation" element={authUser ? <IdeationPage /> : <Navigate to="/" />} />
            <Route path="/pipeline" element={authUser ? <PipelinePage /> : <Navigate to="/" />} />
            <Route path="/invite/:token" element={<InviteAcceptPage />} />
        </Routes>
    );
}

export default App;
