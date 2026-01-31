import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String }, // GitHub emails can be private/null
    avatarUrl: { type: String },
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);