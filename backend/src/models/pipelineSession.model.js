import mongoose from "mongoose";

const pipelineSessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        repoName: {
            type: String,
            default: "global",
        },
        title: {
            type: String,
            default: "New Architecture Chat",
        },
        phase: {
            type: Number,
            default: 1,
        },
        messages: [
            {
                role: { type: String, enum: ["user", "ai", "system"], required: true },
                content: { type: String, required: true },
            },
        ],
        specJson: {
            type: mongoose.Schema.Types.Mixed,
            default: { nodes: [], edges: [] },
        },
        specSummary: {
            type: String,
            default: null,
        },
    },
    { timestamps: true }
);

const PipelineSession = mongoose.model("PipelineSession", pipelineSessionSchema);

export default PipelineSession;
