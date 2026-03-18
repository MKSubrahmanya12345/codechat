import mongoose from "mongoose";

const ideationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    repoName: {
        type: String,
        default: "latest", // "latest" for the global resume, or the actual repo name
    },
    messages: {
        type: Array,
        default: [],
    },
    blueprint: {
        type: Object,
        default: {},
    },
    nodes: {
        type: Array,
        default: [],
    },
    edges: {
        type: Array,
        default: [],
    },
    teamSize: {
        type: Number,
        default: 2,
    },
    hackHours: {
        type: Number,
        default: 24,
    },
    // ??$$$ — Builder data
    fileDrafts: {
        type: Object,
        default: {},
    },
    uiPreview: {
        type: String,
        default: "",
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    }
}, { timestamps: true });

// Create a unique index for (userId, repoName) so we can easily find/update specific sessions
ideationSchema.index({ userId: 1, repoName: 1 }, { unique: true });

const Ideation = mongoose.model("Ideation", ideationSchema);
export default Ideation;
