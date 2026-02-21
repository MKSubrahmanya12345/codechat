import { create } from "zustand";
import axios from "axios";

// Axios configuration to always send cookies
axios.defaults.withCredentials = true; 

export const useAuthStore = create((set) => ({
    authUser: null,
    isCheckingAuth: true,

    checkAuth: async () => {
        try {
            const res = await axios.get("http://localhost:5000/api/auth/check");
            set({ authUser: res.data });
        } catch (error) {
            set({ authUser: null });
        } finally {
            set({ isCheckingAuth: false });
        }
    },

    logout: async () => {
        try {
            // Best-effort server logout (clears cookie)
            await axios.post("http://localhost:5000/api/auth/logout");
        } catch (error) {
            // Ignore server failures; we still clear client state
            console.log(error);
        } finally {
            // ✅ Critical: clear local auth so refresh doesn't auto-login
            localStorage.removeItem("jwt");
            localStorage.removeItem("lastSelectedRepoId");
            localStorage.removeItem("pendingInviteToken");

            delete axios.defaults.headers.common['Authorization'];
            set({ authUser: null });
        }
    }
}));
