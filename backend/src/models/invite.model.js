import mongoose from "mongoose";

const inviteSchema = new mongoose.Schema({
    sender: { type: String, required: true }, // Username
    receiver: { type: String, required: true }, // Username
    repoId: { type: String, required: true },
    repoName: { type: String, required: true },
    repoOwner: { type: String, required: true },
    inviteToken: { type: String, required: true, unique: true },
    status: { type: String, enum: ["pending", "accepted", "rejected"], default: "pending" }
}, { timestamps: true });

export const Invite = mongoose.model("Invite", inviteSchema);
