import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./store/authUser";
import HomePage from "./pages/HomePage";
import HeroPage from "./pages/HeroPage";
import { Loader } from "lucide-react";

function App() {
    const {
        authUser,
        checkAuth,
        isCheckingAuth,
    } = useAuthStore();

    // Initial auth check (normal web flow)
    useEffect(() => {
        const jwt = localStorage.getItem("jwt");

        if (jwt) {
            checkAuth();
        } else {
            checkAuth(); // still check for cookie-based login
        }
    }, [checkAuth]);

    // Listen for token from VS Code extension
    useEffect(() => {
        const handleMessage = (event) => {
            if (event?.data?.command === "authSuccess") {
                const token = event.data.token;
                if (!token) return;

                localStorage.setItem("jwt", token);
                checkAuth(); // re-validate user after token injection
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
