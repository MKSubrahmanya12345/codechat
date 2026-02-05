import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    githubId: { type: String, unique: true, sparse: true },
    username: { type: String, required: true },
    status: { type: String, enum: ["active", "shadow"], default: "active" },
    repoBasePath: { type: String },
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
