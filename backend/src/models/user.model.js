import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    githubId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String },
    avatarUrl: { type: String },
    githubToken: { type: String },
    
    // 👇 NEW: Store repos shared by others
    sharedRepos: [{
        repoId: String,
        name: String,
        owner: String,
        description: String
    }]
}, { timestamps: true });

export const User = mongoose.model("User", userSchema);