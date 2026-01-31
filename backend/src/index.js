import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import { connectDB } from "./lib/db.js"; // We'll make this helper
import authRoutes from "./routes/auth.route.js";
import repoRoutes from "./routes/repo.route.js";



dotenv.config();

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_URL,
    credentials: true // Allow cookies to cross over
}));

app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);

app.listen(process.env.PORT, () => {
    console.log(`Server running on port ${process.env.PORT}`);
    connectDB();
});