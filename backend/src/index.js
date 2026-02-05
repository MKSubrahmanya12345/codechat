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
import { Message } from "./models/message.model.js";

import authRoutes from "./routes/auth.route.js";
import repoRoutes from "./routes/repo.route.js";
import inviteRoutes from "./routes/invite.route.js";

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

app.post("/api/upload", upload.single("file"), (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const fileUrl = `http://localhost:5000/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, type: req.file.mimetype });
});

// Socket Logic
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("joinRepo", (repoId) => {
        socket.join(repoId);
    });

    socket.on("typing", ({ repoId, username }) => {
        socket.to(repoId).emit("userTyping", username);
    });

    socket.on("stopTyping", ({ repoId, username }) => {
        socket.to(repoId).emit("userStoppedTyping", username);
    });

    socket.on("sendMessage", async ({ repoId, text, sender, replyTo, type }) => {
        try {
            const newMessage = await Message.create({
                repoId,
                text,
                sender,
                replyTo,
                type: type || 'text',
                status: 'delivered'
            });
            io.to(repoId).emit("receiveMessage", newMessage);
        } catch (error) {
            console.error("Msg Error:", error);
        }
    });

 
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

    socket.on("disconnect", () => console.log("User disconnected", socket.id));
});

server.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
  connectDB();
});