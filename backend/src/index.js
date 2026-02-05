import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import multer from "multer";
import path from "path";
import fs from "fs";

import { connectDB } from "./lib/db.js";
import { Server } from "socket.io";
import { Message } from "./models/message.model.js"; // 👈 CRITICAL IMPORT

import authRoutes from "./routes/auth.route.js";
import repoRoutes from "./routes/repo.route.js";
import inviteRoutes from "./routes/invite.route.js";
import userRoutes from "./routes/user.route.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  },
});

const presenceByRepo = new Map(); // repoId -> Map<username, { status, lastSeen, connections }>
const socketMeta = new Map(); // socketId -> { repoId, username }

// File Upload Setup
const uploadDir = path.join(process.cwd(), "src/uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use("/uploads", express.static(uploadDir));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/repos", repoRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/user", userRoutes);

app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const filename = req.file.originalname.toLowerCase();
    if (filename.endsWith(".exe") || filename.endsWith(".bat") || filename.endsWith(".cmd")) {
        return res.status(400).json({ error: "File type not allowed" });
    }
    const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, type: req.file.mimetype });
});

// Socket Logic
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRepo", ({ repoId, username }) => {
        if (!repoId || !username) return;

        const existing = socketMeta.get(socket.id);
        if (existing && existing.repoId && existing.repoId !== repoId) {
            socket.leave(existing.repoId);
            const repoMap = presenceByRepo.get(existing.repoId);
            if (repoMap && repoMap.has(existing.username)) {
                const entry = repoMap.get(existing.username);
                entry.connections = Math.max(0, (entry.connections || 1) - 1);
                if (entry.connections === 0) {
                    entry.status = "offline";
                    entry.lastSeen = new Date().toISOString();
                    io.to(existing.repoId).emit("presence_delta", { username: existing.username, status: entry.status, lastSeen: entry.lastSeen });
                }
            }
        }

        socket.join(repoId);
        socketMeta.set(socket.id, { repoId, username });

        if (!presenceByRepo.has(repoId)) presenceByRepo.set(repoId, new Map());
        const repoMap = presenceByRepo.get(repoId);
        const now = new Date().toISOString();

        if (!repoMap.has(username)) {
            repoMap.set(username, { status: "online", lastSeen: now, connections: 1 });
        } else {
            const entry = repoMap.get(username);
            entry.status = "online";
            entry.lastSeen = now;
            entry.connections = (entry.connections || 0) + 1;
        }

        const roster = Array.from(repoMap.entries()).map(([u, meta]) => ({
            username: u,
            status: meta.status,
            lastSeen: meta.lastSeen
        }));

        socket.emit("presence_state", roster);
        io.to(repoId).emit("presence_delta", { username, status: "online", lastSeen: now });
    });

    socket.on("typing", ({ repoId, username }) => {
        socket.to(repoId).emit("userTyping", username);
    });

    socket.on("stopTyping", ({ repoId, username }) => {
        socket.to(repoId).emit("userStoppedTyping", username);
    });

    socket.on("sendMessage", async ({ repoId, text, sender, replyTo, type, codeSelection }) => {
        try {
            const newMessage = await Message.create({
                repoId,
                text,
                sender,
                replyTo,
                type: type || 'text',
                status: 'delivered',
                codeSelection
            });
            io.to(repoId).emit("receiveMessage", newMessage);
        } catch (error) {
            console.error("Msg Error:", error);
        }
    });

    socket.on("read_message", async ({ messageId, repoId, username }) => {
        try {
            if (!messageId || !repoId || !username) return;
            const msg = await Message.findById(messageId);
            if (!msg) return;

            const alreadyRead = msg.readBy?.some(r => r.username === username);
            if (alreadyRead) return;

            msg.readBy.push({ username, at: new Date() });
            msg.status = "read";
            const updatedMsg = await msg.save();
            io.to(repoId).emit("messageUpdated", updatedMsg);
        } catch (e) {
            console.error("Read Receipt Error:", e.message);
        }
    });

    // 👇 FIXED: Message Actions (Delete/Edit/React)
    socket.on("messageAction", async ({ action, messageId, repoId, payload }) => {
        console.log(`Action Received: ${action} for msg ${messageId}`); // DEBUG LOG

        try {
            if (action === "delete") {
                await Message.findByIdAndDelete(messageId);
                console.log("Message deleted from DB"); // DEBUG LOG
                io.to(repoId).emit("messageDeleted", messageId);
            } 
            else if (action === "edit") {
                const updatedMsg = await Message.findByIdAndUpdate(messageId, { text: payload.text, isEdited: true }, { new: true });
                io.to(repoId).emit("messageUpdated", updatedMsg);
            }
            else if (action === "react") {
                const msg = await Message.findById(messageId);
                if (msg) {
                    const existing = msg.reactions.find(r => r.user === payload.user && r.emoji === payload.emoji);
                    if (existing) {
                        msg.reactions = msg.reactions.filter(r => !(r.user === payload.user && r.emoji === payload.emoji));
                    } else {
                        msg.reactions.push({ emoji: payload.emoji, user: payload.user });
                    }
                    const updatedMsg = await msg.save();
                    io.to(repoId).emit("messageUpdated", updatedMsg);
                }
            }
        } catch (e) { 
            console.error("Action Error:", e.message); 
        }
    });

    socket.on("disconnect", () => {
        const meta = socketMeta.get(socket.id);
        if (meta) {
            const repoMap = presenceByRepo.get(meta.repoId);
            if (repoMap && repoMap.has(meta.username)) {
                const entry = repoMap.get(meta.username);
                entry.connections = Math.max(0, (entry.connections || 1) - 1);
                if (entry.connections === 0) {
                    entry.status = "offline";
                    entry.lastSeen = new Date().toISOString();
                    io.to(meta.repoId).emit("presence_delta", { username: meta.username, status: entry.status, lastSeen: entry.lastSeen });
                }
            }
        }
        socketMeta.delete(socket.id);
        console.log("User disconnected", socket.id);
    });
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
  connectDB();
});
