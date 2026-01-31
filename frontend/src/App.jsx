import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authUser";
import HeroPage from "./pages/HeroPage";
import HomePage from "./pages/HomePage";

function App() {
    const { authUser, checkAuth, isCheckingAuth } = useAuthStore();

    useEffect(() => {
        checkAuth();
    }, [checkAuth]);

    if (isCheckingAuth) {
        return <div className="h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>;
    }

    return (
        <Routes>
            <Route 
                path="/" 
                element={!authUser ? <HeroPage /> : <Navigate to="/home" />} 
            />
            <Route 
                path="/home" 
                element={authUser ? <HomePage /> : <Navigate to="/" />} 
            />
        </Routes>
    );
}

export default App;