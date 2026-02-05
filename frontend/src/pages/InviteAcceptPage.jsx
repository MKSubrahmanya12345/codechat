import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authUser";
import axios from "axios";

const InviteAcceptPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { authUser } = useAuthStore();
    const [status, setStatus] = useState("Processing invite...");

    useEffect(() => {
        if (!token) return;

        if (!authUser) {
            localStorage.setItem("pendingInviteToken", token);
            setStatus("Please log in to accept this invite.");
            return;
        }

        const acceptInvite = async () => {
            try {
                await axios.get(`http://localhost:5000/api/invites/accept/${token}`);
                localStorage.removeItem("pendingInviteToken");
                setStatus("Invite accepted! Redirecting...");
                setTimeout(() => navigate("/home"), 800);
            } catch (e) {
                setStatus("Invite invalid or already used.");
            }
        };

        acceptInvite();
    }, [token, authUser, navigate]);

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-white flex items-center justify-center p-6">
            <div className="bg-[#151515] border border-white/10 rounded-xl p-6 text-center max-w-md w-full">
                <h1 className="text-xl font-bold mb-2">Invite</h1>
                <p className="text-sm text-gray-400">{status}</p>
            </div>
        </div>
    );
};

export default InviteAcceptPage;
