import { create } from "zustand";
import axios from "axios";

// Axios configuration to always send cookies
axios.defaults.withCredentials = true; 

export const useAuthStore = create((set) => ({
    authUser: null,
    isCheckingAuth: true,

    checkAuth: async () => {
        try {
            // You need to add this route to backend!
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
            await axios.post("http://localhost:5000/api/auth/logout");
            set({ authUser: null });
        } catch (error) {
            console.log(error);
        }
    }
}));