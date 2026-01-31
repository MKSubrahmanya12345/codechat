import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String },
    avatarUrl: { type: String },
    // NEW FIELD: Store the access token here
    githubToken: { type: String, required: true } 
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);