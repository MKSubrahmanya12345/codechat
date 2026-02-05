import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
    repoId: { type: String, required: true },
    sender: { type: String, required: true },
    text: { type: String, required: true },
    
    // 👇 NEW: WhatsApp Features
    type: { type: String, enum: ['text', 'image', 'file', 'system'], default: 'text' },
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' },
    replyTo: { 
        id: { type: String },
        text: { type: String },
        sender: { type: String }
    },
    reactions: [{
        emoji: String,
        user: String
    }],
    isEdited: { type: Boolean, default: false },
    readBy: [{
        username: String,
        at: Date
    }],
    codeSelection: {
        filePath: String,
        lineStart: Number,
        lineEnd: Number,
        code: String
    }
}, { timestamps: true });

export const Message = mongoose.model("Message", messageSchema);
