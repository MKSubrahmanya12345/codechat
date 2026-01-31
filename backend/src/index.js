import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import { connectDB } from "./lib/db.js";
import { Server } from "socket.io";
import authRoutes from "./routes/auth.route.js";
import repoRoutes from "./routes/repo.route.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "OPTIONS",
      "HEAD",
      "CONNECT",
      "TRACE",
    ],
  },
});

app.use(express.json());
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true, // Allow cookies to cross over
  }),
);

app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);




//socket io
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // 1. Join a specific Repo Room
    socket.on("joinRepo", (repoId) => {
        socket.join(repoId); // Creates a "room" with this ID
        console.log(`User ${socket.id} joined room: ${repoId}`);
    });

    // 2. Send message ONLY to that Room
    socket.on("sendMessage", ({ repoId, text, sender }) => {
        // Broadcasts to everyone in 'repoId' EXCEPT the sender (optional, or use io.to for all)
        io.to(repoId).emit("receiveMessage", { text, sender });
    });

    socket.on("disconnect", () => {
        console.log("User disconnected", socket.id);
    });
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
  connectDB();
});
