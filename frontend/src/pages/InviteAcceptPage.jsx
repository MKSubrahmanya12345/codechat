import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authUser";
import axios from "axios";

const InviteAcceptPage = () => {
    const { token } = useParams();
    const navigate = useNavigate();
    const { authUser } = useAuthStore();

    const [status, setStatus] = useState("Loading invite...");
    const [invite, setInvite] = useState(null);
    const [accepting, setAccepting] = useState(false);

    useEffect(() => {
        if (!token) return;

        if (!authUser) {
            localStorage.setItem("pendingInviteToken", token);
            setStatus("Please log in to view and accept this invite.");
            return;
        }

        const loadInvite = async () => {
            try {
                const res = await axios.get(`http://localhost:5000/api/invites/token/${token}`);
                const nextInvite = res.data?.invite || null;

                if (!nextInvite) {
                    setInvite(null);
                    setStatus("Invite invalid or already used.");
                    return;
                }

                setInvite(nextInvite);
                setStatus("");
            } catch (e) {
                setInvite(null);
                setStatus("Invite invalid or already used.");
            }
        };

        loadInvite();
    }, [token, authUser]);

    const handleAccept = async () => {
        if (!token) return;
        try {
            setAccepting(true);
            const res = await axios.get(`http://localhost:5000/api/invites/accept/${token}`);

            const repoId = res.data?.repoId;
            if (repoId) localStorage.setItem("lastSelectedRepoId", String(repoId));

            localStorage.removeItem("pendingInviteToken");
            navigate("/home");
        } catch (e) {
            setStatus("Invite invalid or already used.");
        } finally {
            setAccepting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0C0C0C] text-white flex items-center justify-center p-6">
            <div className="bg-[#151515] border border-white/10 rounded-xl p-6 text-center max-w-md w-full">
                <h1 className="text-xl font-bold mb-2">Invite</h1>

                {status ? (
                    <p className="text-sm text-gray-400">{status}</p>
                ) : (
                    <>
                        <div className="text-sm text-gray-300 space-y-1 mb-4">
                            <div><span className="text-gray-500">From:</span> {invite?.sender}</div>
                            <div><span className="text-gray-500">Repo:</span> {invite?.repoOwner}/{invite?.repoName}</div>
                        </div>

                        <button
                            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50"
                            disabled={accepting}
                            onClick={handleAccept}
                        >
                            {accepting ? "Accepting..." : "Accept and join"}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default InviteAcceptPage;
