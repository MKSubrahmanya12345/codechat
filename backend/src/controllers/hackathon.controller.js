import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";
import { User } from "../models/user.model.js";

dotenv.config();

let currentKeyIndex = 0;

const getValidKeys = () => {
    const keys = [];
    if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
    for (let i = 1; i <= 20; i++) {
        const key = process.env[`GEMINI_API_KEY_${i}`];
        if (key) keys.push(key);
    }
    return keys;
};

const executeWithKeyRotation = async (promptText) => {
    const keys = getValidKeys();
    if (keys.length === 0) throw new Error("GEMINI_API_KEY is missing in .env");

    let attempts = 0;
    while (attempts < keys.length) {
        try {
            const ai = new GoogleGenAI({ apiKey: keys[currentKeyIndex] });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: promptText,
                config: { temperature: 0.7 }
            });
            return response.text;
        } catch (e) {
            console.error(`Gemini API Error with key index ${currentKeyIndex}:`, e?.message);
            currentKeyIndex = (currentKeyIndex + 1) % keys.length;
            attempts++;
        }
    }
    throw new Error("All Gemini API keys exhausted or rate-limited.");
};

export const chatWithAi = async (req, res) => {
    try {
        const { messages } = req.body;
        
        if (!process.env.GEMINI_API_KEY && getValidKeys().length === 0) {
            return res.status(500).json({ error: "GEMINI_API_KEY is missing in .env" });
        }

        const systemInstruction = `You are a visionary Principal Architect and Hackathon CTO.
        Your job is to help the user refine their hackathon idea step-by-step and produce a live architecture specification.
        
        CONVERSATIONAL FLOW:
        1. **Validate & Elevate:** When the user pitches an idea, respond with 2-3 sentences MAX. Suggest ONE killer feature that makes it win. Ask: "Do you like this direction, or should we twist it?"
        2. **Lock Tech Stack:** Once the idea is agreed upon, propose a short, concrete MERN/Fullstack tech stack. List it briefly and ask: "Are we good to generate the architecture graph?"
        3. **Generate Graph:** When the user agrees or says "generate graph", output the ReactFlow JSON graph.
        
        CRITICAL: Every single response MUST be a valid JSON object in this EXACT format. No markdown outside the JSON:
        \`\`\`json
        {
          "reply": "Your short chat response here.",
          "blueprint": {
            "techStack": ["React + Vite", "Node.js + Express", "MongoDB Atlas", "Socket.io", "Redis"],
            "folderStructure": "frontend/\\n  src/\\n    pages/\\n    components/\\nbackend/\\n  src/\\n    routes/\\n    controllers/\\n    models/",
            "hostingInstructions": "Frontend: Vercel. Backend: Railway. DB: MongoDB Atlas free tier. WebSockets: Railway keeps persistent connections.",
            "codeMePreview": "Build a MERN stack app for real-time logistics fraud detection. Use Socket.io for live driver tracking...",
            "graph": null
          }
        }
        \`\`\`
        
        RULES:
        - "reply": Short, punchy chat response ONLY. No essays.
        - "blueprint": Update ALL fields progressively as the conversation develops. Always fill in what you know so far. Leave fields as null or empty array if not yet discussed.
        - "graph": Set to null UNLESS the user asks to generate the graph. When generating: set to { "nodes": [...], "edges": [...] } with nodes logically positioned (x/y spaced 200px apart). Node format: { "id": "1", "data": { "label": "Driver App", "kind": "client", "tech": "React Native" }, "position": { "x": 0, "y": 0 } }. Edge format: { "id": "e1-2", "source": "1", "target": "2", "label": "GPS ping" }
        - Return ONLY valid JSON in the code block. No text before or after.`;

        // Format history for the GenAI SDK
        let promptText = systemInstruction + "\n\n--- User Conversation ---\n";
        messages.forEach(m => {
            promptText += `${m.role.toUpperCase()}: ${m.content}\n`;
        });

        const rawReply = await executeWithKeyRotation(promptText);

        // Extract JSON from markdown code block
        const jsonMatch = rawReply.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                return res.status(200).json(parsed);
            } catch (parseErr) {
                // If JSON parse fails, fall back to raw text
                console.error("JSON parse failed, falling back:", parseErr.message);
            }
        }

        // Fallback: wrap raw text in expected format
        res.status(200).json({ reply: rawReply, blueprint: null });

    } catch (e) {
        console.error("AI Chat Error:", e);
        res.status(500).json({ error: "AI Generation failed: " + e.message });
    }
};


export const compileAndPushRepo = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token. Please login again." });
        }

        const { messages, nodes, edges, newRepo } = req.body;
        if (!newRepo || !newRepo.name) return res.status(400).json({ error: "Repository configuration missing." });
        if (!nodes || nodes.length === 0) return res.status(400).json({ error: "Graph is empty." });

        const systemInstruction = `You are a legendary Principal Engineer compiling a hackathon architecture.
        The user has provided a chat history and a structured JSON graph containing Nodes (Services/UI/DBs) and Edges (Data Flow).
        Your ONLY job is to compile a massive, highly specific 'CodeME.md' Markdown file.
        This markdown file acts as an absolute instruction manual for an AI Coding Agent (like Devin or Cursor) to build the app perfectly in one shot.
        You must include:
        1. Context & Business Goal
        2. Exact tech stack based on nodes
        3. Database schemas to implement
        4. API endpoint definitions based on edges
        5. Folder scaffolding structure.
        Return ONLY valid Markdown. No conversational text.`;

        let promptText = systemInstruction + "\n\n--- Graph JSON ---\n" + JSON.stringify({ nodes, edges }, null, 2) + "\n\n--- User Conversation ---\n";
        messages.forEach(m => { promptText += `${m.role.toUpperCase()}: ${m.content}\n`; });

        // 1. Generate Markdown
        const codeMeContent = await executeWithKeyRotation(promptText);

        // 2. Create the Repo on GitHub
        const githubHeaders = {
            Authorization: `Bearer ${user.githubToken}`,
            Accept: "application/vnd.github+json"
        };
        
        const ownerType = newRepo.ownerType || "user";
        const repoName = String(newRepo.name || "").trim();
        const urlCreate = ownerType === "org" ? `https://api.github.com/orgs/${String(newRepo.org).trim()}/repos` : "https://api.github.com/user/repos";
        
        const payloadCreate = {
            name: repoName,
            description: newRepo.description,
            private: newRepo.visibility === "private" || newRepo.visibility === "internal",
            auto_init: true
        };

        const createRes = await axios.post(urlCreate, payloadCreate, { headers: githubHeaders });
        const repoOwnerLogin = createRes.data.owner.login;

        // 3. Push CodeME.md to the newly created repo
        const urlPut = `https://api.github.com/repos/${repoOwnerLogin}/${repoName}/contents/CodeME.md`;
        await axios.put(urlPut, {
            message: "Initial commit: Ideation Graph to CodeME",
            content: Buffer.from(codeMeContent).toString("base64")
        }, { headers: githubHeaders });

        res.status(200).json({ message: "Repository successfully generated and initialized with CodeME specification.", repo: createRes.data });
    } catch (e) {
        console.error("Compile & Push Error:", e?.response?.data || e);
        res.status(500).json({ error: e?.response?.data?.message || e.message || "Compilation sequence failed." });
    }
};
