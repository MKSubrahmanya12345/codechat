import mongoose from "mongoose";

/**
 * PROJECT CACHE MODEL
 * Purpose: This acts as a "Library" of already-solves problems.
 * Scaling logic: Instead of hitting Gemini ($$$) for every user, 
 * we check if someone else has already built something similar.
 */
const projectCacheSchema = new mongoose.Schema({
    // A simplified version of the project idea (e.g. "mern-ecommerce-realtime")
    ideaFingerprint: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    // The original raw prompt that triggered this cache entry
    originalPrompt: String,
    // The high-quality "God Prompt" output we want to reuse
    generatedCodeMe: {
        type: String,
        required: true
    },
    // The tech stack tags that go with this blueprint
    techStack: [String],
    // The proposed folder structure
    folderStructure: String,
    // Statistical tracking
    usageCount: {
        type: Number,
        default: 1
    },
    lastUsed: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Optimize for fast lookup
projectCacheSchema.index({ ideaFingerprint: 1 });

const ProjectCache = mongoose.model("ProjectCache", projectCacheSchema);
export default ProjectCache;
