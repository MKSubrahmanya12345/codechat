import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import PipelineSession from "../models/pipelineSession.model.js";

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

export const pipelineChat = async (req, res) => {
    try {
        const { messages } = req.body;
        
        if (!process.env.GEMINI_API_KEY && getValidKeys().length === 0) {
            return res.status(500).json({ error: "GEMINI_API_KEY is missing in .env" });
        }

        // 1. GAP FINDER & EXTRACTOR
        const aiMessages = messages.filter(m => m.role === "ai" && !m.content.includes("SPEC_LOCKED"));
        const questionCount = Math.max(0, aiMessages.length - 1); // Ignore first intro message
        const MAX_QUESTIONS = 3;

        if (questionCount < MAX_QUESTIONS) {
            const gapPrompt = `You are the "Gap Finder" for an autonomous MERN stack project builder.
            
A user wants to build a software system. Your goal is to figure out if there is enough structured information to write a complete functional spec.
A complete spec must have:
1. Core Entities (e.g. User, Task, Goal, Post)
2. Relationships (e.g. User has many Tasks)
3. Properties per entity (e.g. Task needs title, deadline, status)
4. Constraints or Special Logic (e.g. "freezing time", "admin only")

--- CONVERSATION SO FAR ---
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
---------------------------

You have asked ${questionCount} out of ${MAX_QUESTIONS} allowed questions.
Are there any missing critical details needed to define the data models and core mechanics?
If YES (there are gaps): Ask EXACTLY ONE targeted, forced-decision question to the user to clarify the most glaring gap. E.g., "Do users have roles, or is everyone equal?". 
CRITICAL: You MUST prefix your response with "[Question ${questionCount + 1}/${MAX_QUESTIONS}] ".
If NO (everything is crystal clear, or you can safely assume reasonable defaults for the rest): Reply with exactly this phrase and nothing else: "SPEC_LOCKED"`;

            const gapResponse = await executeWithKeyRotation(gapPrompt);

            if (!gapResponse.includes("SPEC_LOCKED")) {
                // Still finding gaps, return the question
                return res.status(200).json({
                    isSpecLocked: false,
                    reply: gapResponse.trim()
                });
            }
        }

        // 2. SPEC BUILDER
        // We either hit MAX_QUESTIONS or AI replied SPEC_LOCKED. Generate the JSON Spec.
        const specPrompt = `You are the "Spec Builder" for an autonomous MERN stack project builder.
        
You must take the user's finalized idea and output BOTH a human-readable summary AND a strict JSON specification.

--- FINALIZED CONVERSATION ---
${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}
---------------------------

Output your response in the following exact format:
---SUMMARY---
[Your clean, human-readable markdown summary of the project scope, mechanics, and entities]
---JSON---
\`\`\`json
{
  "name": "Project Name",
  "nodes": [
    { "id": "User", "position": { "x": 100, "y": 100 }, "data": { "label": "User", "kind": "entity", "tech": "fields: name, email" } },
    { "id": "Goal", "position": { "x": 300, "y": 100 }, "data": { "label": "Goal", "kind": "entity", "tech": "fields: deadline" } }
  ],
  "edges": [
    { "id": "e1", "source": "User", "target": "Goal", "label": "hasMany" }
  ]
}
\`\`\`
`;

        const specResponse = await executeWithKeyRotation(specPrompt);
        
        const summaryMatch = specResponse.match(/---SUMMARY---\n([\s\S]*?)---JSON---/);
        const jsonMatch = specResponse.match(/```json\n([\s\S]*?)\n```/);

        let specSummary = summaryMatch ? summaryMatch[1].trim() : "Summary generated.";
        let specJson = { error: "Failed to parse spec JSON" };

        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.nodes && parsed.edges) specJson = parsed;
                else specJson = { nodes: [], edges: [] };
            } catch (e) {
                console.error("Failed to parse JSON Spec", e);
                specJson = { nodes: [], edges: [] };
            }
        }

        return res.status(200).json({
            isSpecLocked: true,
            specSummary,
            specJson,
            reply: "Spec is locked." // Fallback
        });

    } catch (e) {
        console.error("Pipeline Chat Error:", e);
        res.status(500).json({ error: "Pipeline generation failed: " + e.message });
    }
};

export const generateTasks = async (req, res) => {
    try {
        const { specJson } = req.body;
        
        const taskPrompt = `You are the "Builder Execution Planner". We have a locked specification for a MERN stack application.
Generate a deterministic, sequential list of developer tasks to build this app.

--- SPECIFICATION ---
${JSON.stringify(specJson, null, 2)}
---------------------

Output ONLY valid JSON in this exact format (no markdown code blocks):
[
  { "id": 1, "action": "setup_folder", "description": "Initialize backend and frontend folders" },
  { "id": 2, "action": "create_models", "description": "Create Mongoose models" }
]
`;

        const responseText = await executeWithKeyRotation(taskPrompt);
        
        // clean up
        const cleanJson = responseText.replace(/```(?:json)?\n?([\s\S]*?)\n?```/, "$1").trim();
        const tasks = JSON.parse(cleanJson);

        res.status(200).json({ tasks });
    } catch (e) {
        console.error("Task Gen Error:", e);
        res.status(500).json({ error: "Task generation failed: " + e.message });
    }
};

// ----------------------------------------------------
// scaffold generator (DETERMINISTIC NO-AI FILE WRITING)
// ----------------------------------------------------
export const generateSkeleton = async (req, res) => {
    try {
        const { repoSlug, specJson } = req.body;
        const projectDir = path.join(process.cwd(), "src", "generated", repoSlug || "project_default");

        // 1. Create Folder Structure Safely
        const dirs = ["models", "controllers", "routes"];
        dirs.forEach(d => fs.mkdirSync(path.join(projectDir, d), { recursive: true }));

        // We will build the "API Graph" nodes dynamically to send back to the UI (Phase 4)
        const apiNodes = [];
        const apiEdges = [];
        let yOffset = 0;

        // Ensure we have an array of entities safely
        const entities = specJson?.nodes?.filter(n => n?.kind?.toLowerCase() === "entity") || [];

        let indexImportCode = `import express from "express";\nconst app = express();\napp.use(express.json());\n\n`;
        let indexMountCode = `\n// Start Server\napp.listen(3000, () => console.log('Server running on port 3000'));\n`;

        entities.forEach((entity, index) => {
            const name = entity.label;
            if (!name) return; // Skip invalid nodes
            const lowerName = name.toLowerCase();
            const upperName = name.charAt(0).toUpperCase() + name.slice(1);

            // Create Model Boilerplate
            const modelContent = `import mongoose from "mongoose";\n\nconst ${lowerName}Schema = new mongoose.Schema({\n    // TODO: Define schema based on properties\n}, { timestamps: true });\n\nexport default mongoose.model("${upperName}", ${lowerName}Schema);\n`;
            fs.writeFileSync(path.join(projectDir, "models", `${lowerName}.model.js`), modelContent);

            // Create Controller Boilerplate
            const ctrlContent = `import ${upperName} from "../models/${lowerName}.model.js";\n\n// Create\nexport const create${upperName} = async (req, res) => {\n   res.status(501).json({ message: "Not Implemented" });\n};\n\n// Get All\nexport const get${upperName}s = async (req, res) => {\n   res.status(501).json({ message: "Not Implemented" });\n};\n\n// Get One\nexport const get${upperName} = async (req, res) => {\n   res.status(501).json({ message: "Not Implemented" });\n};\n\n// Update\nexport const update${upperName} = async (req, res) => {\n   res.status(501).json({ message: "Not Implemented" });\n};\n\n// Delete\nexport const delete${upperName} = async (req, res) => {\n   res.status(501).json({ message: "Not Implemented" });\n};\n`;
            fs.writeFileSync(path.join(projectDir, "controllers", `${lowerName}.controller.js`), ctrlContent);

            // Create Route Boilerplate
            const routeContent = `import express from "express";\nimport { create${upperName}, get${upperName}s, get${upperName}, update${upperName}, delete${upperName} } from "../controllers/${lowerName}.controller.js";\n\nconst router = express.Router();\n\nrouter.post("/", create${upperName});\nrouter.get("/", get${upperName}s);\nrouter.get("/:id", get${upperName});\nrouter.put("/:id", update${upperName});\nrouter.delete("/:id", delete${upperName});\n\nexport default router;\n`;
            fs.writeFileSync(path.join(projectDir, "routes", `${lowerName}.route.js`), routeContent);

            indexImportCode += `import ${lowerName}Routes from "./routes/${lowerName}.route.js";\n`;
            indexMountCode = `app.use("/api/${lowerName}s", ${lowerName}Routes);\n` + indexMountCode;

            // Generate API Graph Nodes Mapping
            const rNode = `r_${lowerName}`;
            const cNode = `c_${lowerName}`;
            const mNode = `m_${lowerName}`;

            apiNodes.push({ id: rNode, position: { x: 100, y: yOffset }, data: { label: `/api/${lowerName}s`, kind: "route", tech: "Express Router" }});
            apiNodes.push({ id: cNode, position: { x: 400, y: yOffset }, data: { label: `${upperName}Controller`, kind: "controller", tech: "Logic / Empty Functions", fileName: `controllers/${lowerName}.controller.js` }});
            apiNodes.push({ id: mNode, position: { x: 700, y: yOffset }, data: { label: `${upperName}Model`, kind: "entity", tech: "Mongoose Schema" }});

            apiEdges.push({ id: `e_${rNode}_${cNode}`, source: rNode, target: cNode });
            apiEdges.push({ id: `e_${cNode}_${mNode}`, source: cNode, target: mNode });

            yOffset += 150;
        });

        // Write Index.js
        fs.writeFileSync(path.join(projectDir, "index.js"), indexImportCode + "\n" + indexMountCode);

        // Add index.js entry node
        apiNodes.push({ id: "entry", position: { x: -200, y: (yOffset/2) - 75 }, data: { label: "index.js", kind: "route", tech: "Express Server" }});
        entities.forEach(entity => {
            if(!entity.label) return;
            apiEdges.push({ id: `e_entry_r_${entity.label.toLowerCase()}`, source: "entry", target: `r_${entity.label.toLowerCase()}` });
        });

        res.status(200).json({
            success: true,
            projectPath: projectDir,
            apiGraph: { nodes: apiNodes, edges: apiEdges }
        });

    } catch (e) {
        console.error("Generate Skeleton Error:", e);
        res.status(500).json({ error: "Skeleton generation failed", details: e.message });
    }
};

// ----------------------------------------------------
// Graph-to-Code (AI Function Generation)
// ----------------------------------------------------
export const generateFunction = async (req, res) => {
    try {
        const { repoSlug, specJson, nodeData } = req.body;
        // nodeData has { label, kind, fileName ... }
        if (!nodeData || !nodeData.fileName) return res.status(400).json({ error: "No file specificed for generation" });

        const projectDir = path.join(process.cwd(), "src", "generated", repoSlug || "project_default");
        const filePath = path.join(projectDir, nodeData.fileName);
        
        // Read existing boilerplate
        let fileContent = "";
        try { fileContent = fs.readFileSync(filePath, "utf-8"); } catch(e) {}

        const prompt = `You are an expert MERN developer writing the exact implementation for a single file.
        
Context:
Project Spec (JSON): ${JSON.stringify(specJson)}
File to Implement: ${nodeData.fileName}
Current Boilerplate:
\`\`\`javascript
${fileContent}
\`\`\`

Task: Write the FULL, PRODUCTION-READY implementation for this specific file.
Do not wrap it in markdown block quotes (no \`\`\`javascript). Just output the raw code.
Ensure you export the functions expected by the routes. Add error handling and comments.`;

        const newCode = await executeWithKeyRotation(prompt);
        const cleanCode = newCode.replace(/^```[a-z]*\n/m, "").replace(/```$/m, "").trim();

        fs.writeFileSync(filePath, cleanCode);

        res.status(200).json({ success: true, fileName: nodeData.fileName });
    } catch (e) {
        console.error("Generate Function Error:", e);
        res.status(500).json({ error: "Function generation failed", details: e.message });
    }
};

// CRUD for Sessions
export const getSessions = async (req, res) => {
    try {
        const repoName = req.params.repoName || "global";
        const sessions = await PipelineSession.find({ userId: req.user._id, repoName }).sort({ updatedAt: -1 });
        res.status(200).json(sessions);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch sessions" });
    }
};

export const createSession = async (req, res) => {
    try {
        const { repoName } = req.body;
        const newSession = await PipelineSession.create({
            userId: req.user._id,
            repoName: repoName || "global",
            title: "New Pipeline Chat",
            phase: 1,
            messages: [{ role: "ai", content: "I am the new AI pipeline. Give me your messy idea. I will extract the structure, ask targeted questions to fill gaps, and build a deterministic spec for execution." }]
        });
        res.status(201).json(newSession);
    } catch (error) {
        res.status(500).json({ error: "Failed to create session" });
    }
};

export const updateSession = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body; // { messages, specJson, specSummary, phase, title }
        
        // Auto-generate title if it's still default and there are messages
        if (updates.messages && updates.messages.length >= 3 && (!updates.title || updates.title === "New Pipeline Chat")) {
            // Very hacky quick title generation based on first user message
            const firstUserMsg = updates.messages.find(m => m.role === "user");
            if (firstUserMsg) {
                const words = firstUserMsg.content.split(" ").slice(0, 4).join(" ").replace(/[^a-zA-Z0-9 ]/g, "");
                updates.title = words.length > 0 ? words + "..." : "Pipeline Chat";
            }
        }

        const session = await PipelineSession.findOneAndUpdate(
            { _id: id, userId: req.user._id },
            { $set: updates },
            { new: true }
        );
        res.status(200).json(session);
    } catch (error) {
        res.status(500).json({ error: "Failed to update session" });
    }
};

export const deleteSession = async (req, res) => {
    try {
        await PipelineSession.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete session" });
    }
};
