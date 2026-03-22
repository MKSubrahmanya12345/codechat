import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import axios from "axios";
import { User } from "../models/user.model.js";
import Ideation from "../models/ideation.model.js";
import ProjectCache from "../models/projectCache.model.js";
import { generateFingerprint, checkCache, saveToCache } from "../services/cache.service.js";

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
        const { messages, isArgument } = req.body;  // ??$$$ — accept isArgument flag
        
        if (!process.env.GEMINI_API_KEY && getValidKeys().length === 0) {
            return res.status(500).json({ error: "GEMINI_API_KEY is missing in .env" });
        }

        // ??$$$ — Build a team-member context string if senders are tagged
        const teamMap = {};
        messages.forEach(m => {
            if (m.role === "user" && m.sender) teamMap[m.sender] = true;
        });
        const teamNames = Object.keys(teamMap);
        const teamContext = teamNames.length > 0
            ? `\nTEAM MEMBERS IN THIS CHAT: ${teamNames.join(", ")}. Each message is tagged [USERNAME]. Use their names when replying. Track who is building what.`
            : "";

        // ??$$$ — Detect which phase we're in by scanning conversation history
        const allUserText = messages.filter(m => m.role === "user").map(m => m.content.toLowerCase()).join(" ");
        const isDoneTriggered = /\b(done|ready|finalize|let'?s plan|start planning|move on|go ahead|proceed|lock it)\b/.test(allUserText);

        // Check if Q&A is complete (all 5 decisions made — look for AI having confirmed them)
        const allAiText = messages.filter(m => m.role === "ai").map(m => m.content.toLowerCase()).join(" ");
        const isQAComplete = isDoneTriggered && (
            allAiText.includes("perfect, let me lock") || 
            allAiText.includes("blueprint is now locked") ||
            allAiText.includes("generating your blueprint")
        );

        // ??$$$ — Roast mode: injected when two teammates are arguing and @ai was called
        const roastContext = isArgument
            ? `\n\n🔥 ARGUMENT MODE ACTIVATED: The team is in a HEATED debate right now. Someone called @ai to settle it. You are now the referee. Rules: (1) Mediate with brutal, funny wit. (2) Roast BOTH sides equally — no favorites. (3) Actually identify who's right technically and say it, but wrap it in a roast. (4) Keep it under 5 sentences. Examples of the vibe: "Bro, you're both technically correct and practically useless right now." / "X is fighting for client/server like it's 2015. Y is fighting for frontend/backend while forgetting to build the actual backend. Let me save you both." Be sharp, be funny, BE RIGHT.`
            : "";

        const systemInstruction = `You are a friendly, sharp AI Co-Founder participating in a hackathon team group chat.
Your personality: concise, direct, uses team member names, never lectures, asks one question at a time.${teamContext}${roastContext}

════════════════════════════════════════════
YOU OPERATE IN 3 STRICT PHASES:
════════════════════════════════════════════

${!isDoneTriggered ? `
▶ CURRENT PHASE: 1 — DISCUSSION (Active)
════════════════════════════════════════════
- You are in a free-flowing GROUP CHAT. Be natural. Discuss, react, ask ONE question at a time.
- Understand the idea deeply: what problem it solves, who the users are, what the killer feature is.
- DO NOT ask about tech stack, frameworks, or folder structure yet. That comes later.
- DO NOT fill in any blueprint fields. techStack = [], everything else = null or "".
- Keep going until a team member says "done", "ready", "finalize", "let's plan", or similar.
- You are HOLDING all the info to use later. Acknowledge ideas, ask targeted follow-ups.
` : isQAComplete ? `
▶ CURRENT PHASE: 3 — BLUEPRINT GENERATION (Active)
════════════════════════════════════════════
- All decisions have been made via Q&A. Now generate the complete blueprint.
- Fill ALL blueprint fields (techStack, folderStructure, hostingInstructions, codeMePreview) based on confirmed answers.
- Set graph to null unless user explicitly asks for the architecture graph.
- Reply confirming the blueprint is locked and everything is visible in the left panel.
` : `
▶ CURRENT PHASE: 2 — STRUCTURED Q&A (Active — triggered by user saying done/ready)
════════════════════════════════════════════
- Ask ONE decision-making question at a time. Wait for the answer before asking the next.
- Go in this exact order (check which have already been answered in conversation):
  Q1: "What's your tech stack? (MERN, T3, Next.js + Prisma, Django + React, FastAPI, etc.)"
  Q2: "Folder structure: 'frontend/backend', 'client/server', or monorepo (packages/apps)?"
  Q3: "Hosting: Vercel + Railway? AWS EC2? fly.io? Render? Or something else?"
  Q4: "Auth: JWT, sessions, OAuth (Google/GitHub), Clerk, or NextAuth?"
  Q5: "What's the single most important MVP feature — the one thing that must work at demo time?"
- After ALL 5 are answered, say exactly: "Perfect, let me lock in the blueprint now." and fill ALL blueprint fields.
- DO NOT fill blueprint fields until all 5 questions are answered.
`}

════════════════════════════════════════════
    "blueprint": {
      "techStack": [],
      "folderStructure": null,
      "hostingInstructions": null,
      "codeMePreview": null,
      "graph": null
    },
    "tasks": [
      { "id": "t1", "title": "Implement Login Page", "assignedTo": "UserA", "status": "pending", "branch": "feature/login-page-UserA" }
    ]
  }
}
\`\`\`

FINAL RULES:
- "reply": Max 4 sentences. Conversational. Address people by name. React to what they say.
- "tasks": This is for the LIVE TASK BOARD. Every time someone says "I'll do X" or "I'm handling Y", extract it here. 
- "tasks" format: { "id": "uniqueSlug", "title": "Short Task Name", "assignedTo": "Username", "status": "pending", "branch": "feature/task-name-username" }.
- If a task is already in history, don't duplicate it. Only return NEW or UPDATED tasks.
- Return ONLY the JSON code block. No text before or after.`;

        // ??$$$ — Format history with sender name for full team awareness
        let promptText = systemInstruction + "\n\n--- GROUP CHAT HISTORY ---\n";
        messages.forEach(m => {
            const label = m.role === "user"
                ? `[${m.sender || "Teammate"}]`
                : "[AI Co-Founder]";
            promptText += `${label}: ${m.content}\n`;
        });

        const rawReply = await executeWithKeyRotation(promptText);

        // Extract JSON from markdown code block
        const jsonMatch = rawReply.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                return res.status(200).json(parsed);
            } catch (parseErr) {
                console.error("JSON parse failed, falling back:", parseErr.message);
            }
        }

        res.status(200).json({ reply: rawReply, blueprint: null });

    } catch (e) {
        console.error("AI Chat Error:", e);
        res.status(500).json({ error: "AI Generation failed: " + e.message });
    }
};


// ??$$$ — SHARED: The actual "God Prompt" builder for CodeME.md
// ??$$$ — Now accepts blueprint so all user-collected sections feed into the prompt
const buildFullCodeMe = async (messages, nodes, edges, blueprint = {}) => {
    const graphSummary = nodes.map(n =>
        `- [${(n.data?.kind || "service").toUpperCase()}] ${n.data?.label || n.id}${n.data?.tech ? ` (${n.data.tech})` : ""}`
    ).join("\n");

    const edgeSummary = edges.map(e =>
        `- ${e.source} \u2192 ${e.target}${e.label ? `: ${e.label}` : ""}`
    ).join("\n");

    const conversation = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");

    // ??$$$ — Inject live blueprint sections the UI collected during chat
    const stackSection = Array.isArray(blueprint.techStack) && blueprint.techStack.length > 0
        ? `AGREED TECH STACK (from CTO session):\n${blueprint.techStack.join(", ")}`
        : "";
    const folderSection = blueprint.folderStructure
        ? `AGREED FOLDER STRUCTURE (from CTO session):\n${blueprint.folderStructure.replace(/\\n/g, "\n")}`
        : "";
    const hostingSection = blueprint.hostingInstructions
        ? `AGREED HOSTING PLAN (from CTO session):\n${blueprint.hostingInstructions}`
        : "";

    const prompt = `You are a world-class Principal Engineer and Technical Architect. You are writing a CODEME.MD file — a "God Prompt" so detailed and complete that an AI coding agent (like Antigravity, Devin, or Cursor) can build the ENTIRE application from it in one single pass without needing any clarification whatsoever.

Architecture graph:
NODES:
${graphSummary || "(Infer from conversation)"}

EDGES (data flow):
${edgeSummary || "(Infer from conversation)"}

${stackSection}
${folderSection}
${hostingSection}

--- CONVERSATION ---
${conversation}
--- ARCHITECTURE GRAPH (NODES & EDGES) ---
${JSON.stringify(nodes)}
${JSON.stringify(edges)}
--- VISION MOCKUP ---
${blueprint.uiPreview || "Not generated yet"}
--- TECH STACK & FOLDER STRUCTURE ---
${JSON.stringify(blueprint.techStack || [])}
${blueprint.folderStructure || ""}
--- END CONTEXT ---

You are a world-class CTO and Software Architect. Generate the ULTIMATE CodeME.md for this project. 
It MUST include ALL 12 sections below with COMPLETE, UNAMBIGUOUS detail. NEVER skip or abbreviate. 
This document serves as the "God Key" for another AI agent (Antigravity) to build the entire app.

# [App Name] — CodeME.md

## 1. Context & Business Goal
Detailed Problem Statement (the "Why"). Business Goal (the "What"). Key product value propositions. MVP scope for a 24-48h hackathon.

## 2. Exact Tech Stack (High Fidelity)
List every package, library, and tool. Frontend, Backend, Database, Auth, Real-time, Maps, CI/CD.

## 3. Project Folder Structure
A COMPLETE, directory-by-directory tree. Include comments for every file's specific responsibility. Ensure it follows a clean MVC or Feature-based architecture.

## 4. Database Schemas (Implementation Ready)
Write out the Mongoose schemas (or equivalent) in code blocks. Include every field, type, index, and relationship (refs). No "..." - write everything out.

## 5. API Endpoint Definitions (Comprehensive)
List EVERY route. Include:
- Method, Path
- Required Payload shape (JSON)
- Success & Error response shapes
- Middleware logic (e.g. "Admin only", "Token required")

## 6. Real-time Events (WebSockets / Socket.io)
Emit events, listen events, payload shapes, and the logic flow between client/server.

## 7. Frontend Pages & Components
List every page (/login, /dashboard, etc.). Describe UI components, state management (Redux/Zustand/Context), and which APIs each page interacts with.

## 8. Authentication & Authorization Flow
The exact logic: Passport/JWT/Clerk. How tokens are saved, guarded, and removed.

## 9. Environment Variables (.env)
A complete template with descriptions for every key (GEMINI_API_KEY, MONGO_URI, etc).

## 10. Hosting & Deployment Launchpad
Provide instructions for Vercel (frontend) and Render/Railway (backend/DB). Include CORS settings and environment variable syncing.

## 11. Dev Setup & Run Commands
The exact shell commands to get it running from a fresh clone.

## 12. Agent Task Checklist (The Master Plan)
A numbered, step-by-step build order. Be RUTHLESSLY granular. 
Each item should be a single, testable developer task (e.g., "Implement POST /api/v1/auth/signup with email verification").

Write in professional, dense technical language. Return ONLY the Markdown. Start directly with the # heading.`;

    return await executeWithKeyRotation(prompt);
};

// ??$$$ — Standalone endpoint: generate full CodeME.md without pushing to GitHub
export const generateCodeMe = async (req, res) => {
    try {
        const { messages, nodes, edges, blueprint } = req.body;
        if (!messages || messages.length < 2) {
            return res.status(400).json({ error: "Not enough conversation context. Chat more with the CTO first." });
        }

        // ==========================================================
        // ??$$$ — SCALING LOGIC: THE SEMANTIC CACHE CHECK
        // ==========================================================
        const fingerprint = generateFingerprint(messages);
        const cachedBlueprint = await checkCache(fingerprint);

        if (cachedBlueprint) {
            console.log(`[Cache Hit] Serving blueprint for: ${fingerprint}`);
            return res.status(200).json({ 
                content: cachedBlueprint.generatedCodeMe,
                isCached: true // Inform frontend this was instant
            });
        }

        // ==========================================================
        // [Cache Miss] Only now do we spend money/tokens on AI
        // ==========================================================
        console.log(`[Cache Miss] Generating new blueprint for: ${fingerprint}`);
        const content = await buildFullCodeMe(messages, nodes || [], edges || [], blueprint || {});

        // Save this new "Master Blueprint" for future users
        await saveToCache(fingerprint, {
            generatedCodeMe: content,
            techStack: blueprint?.techStack || [],
            originalPrompt: messages[messages.length-1].content
        });

        res.status(200).json({ content });
    } catch (e) {
        console.error("Generate CodeME Error:", e);
        res.status(500).json({ error: "CodeME generation failed: " + e.message });
    }
};

export const compileAndPushRepo = async (req, res) => {

    try {
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) {
            return res.status(401).json({ error: "No GitHub token. Please login again." });
        }

        // ??$$$ — Accept user-edited CodeME override; pass blueprint for enriched AI gen
        const { messages, nodes, edges, newRepo, customCodeMe, blueprint } = req.body;
        if (!newRepo || !newRepo.name) return res.status(400).json({ error: "Repository configuration missing." });
        if (!nodes || nodes.length === 0) return res.status(400).json({ error: "Graph is empty." });

        let codeMeContent = customCodeMe || null;

        // ??$$$ — Only call AI if user didn't provide their own CodeME content
        if (!codeMeContent) {
            codeMeContent = await buildFullCodeMe(messages, nodes, edges, blueprint || {});
        }

        // ??$$$ — Create the Repo on GitHub
        const githubHeaders = {
            Authorization: `Bearer ${user.githubToken}`,
            Accept: "application/vnd.github+json"
        };

        const ownerType = newRepo.ownerType || "user";
        const repoName = String(newRepo.name || "").trim();
        const urlCreate = ownerType === "org"
            ? `https://api.github.com/orgs/${String(newRepo.org).trim()}/repos`
            : "https://api.github.com/user/repos";

        const payloadCreate = {
            name: repoName,
            description: newRepo.description || "",
            private: newRepo.visibility === "private" || newRepo.visibility === "internal",
            auto_init: true
        };

        let repo;
        let repoOwnerLogin;

        try {
            const createRes = await axios.post(urlCreate, payloadCreate, { headers: githubHeaders });
            repo = createRes.data;
            repoOwnerLogin = repo.owner.login;
        } catch (e) {
            // ??$$$ — Handle case where repo already exists (422 error)
            if (e.response?.status === 422) {
                // If it exists, we need to find the owner login (could be user or the specific org)
                repoOwnerLogin = ownerType === "org" ? String(newRepo.org).trim() : user.username;
                try {
                    const getRes = await axios.get(`https://api.github.com/repos/${repoOwnerLogin}/${repoName}`, { headers: githubHeaders });
                    repo = getRes.data;
                } catch (getErr) {
                    throw new Error("Repository already exists but couldn't be accessed. Check permissions.");
                }
            } else {
                throw e;
            }
        }

        // ??$$$ — Push CodeME.md. If it exists, we must get the SHA to update it.
        const urlFile = `https://api.github.com/repos/${repoOwnerLogin}/${repoName}/contents/CodeME.md`;
        let existingSha = null;
        try {
            const fileRes = await axios.get(urlFile, { headers: githubHeaders });
            existingSha = fileRes.data.sha;
        } catch {}

        await axios.put(urlFile, {
            message: existingSha ? "🚀 Update Hackathon Blueprint (CodeME.md)" : "🚀 Initial commit: Hackathon Blueprint (CodeME.md)",
            content: Buffer.from(codeMeContent).toString("base64"),
            sha: existingSha || undefined
        }, { headers: githubHeaders });

        res.status(200).json({
            message: existingSha ? "Repository updated and CodeME.md refreshed!" : "Repository created and CodeME.md pushed!",
            repo
        });
    } catch (e) {
        console.error("Compile & Push Error:", e?.response?.data || e);
        res.status(500).json({ error: e?.response?.data?.message || e.message || "Compilation failed." });
    }
};

// ??$$$ — NEW: AI Scorecard endpoint — rates the hackathon idea on 4 axes
export const getScorecard = async (req, res) => {
    try {
        const { messages, blueprint } = req.body;

        const prompt = `You are a senior hackathon judge. Based on the conversation and blueprint below, rate the project on exactly these 4 axes:
        1. Feasibility (can a 2-4 person team build a working demo in 24 hours?)
        2. Originality (how unique is this idea compared to typical hackathon projects?)
        3. Technical Depth (does it use interesting technology, ML, real-time data, etc.?)
        4. Demo-ability (will this impress judges in a 3-minute demo?)
        
        Return ONLY a valid JSON object (no markdown wrapper):
        { "feasibility": 8, "originality": 7, "technicalDepth": 9, "demoability": 8, "summary": "One sentence overall verdict." }
        
        Blueprint so far: ${JSON.stringify(blueprint)}
        --- Conversation ---
        ${messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n")}`;

        const raw = await executeWithKeyRotation(prompt);
        // Strip any accidental markdown
        const clean = raw.replace(/```json\n?|```/g, "").trim();
        const scores = JSON.parse(clean);
        res.status(200).json(scores);
    } catch (e) {
        console.error("Scorecard Error:", e);
        res.status(500).json({ error: "Scorecard generation failed: " + e.message });
    }
};

// ??$$$ — NEW: AI File drafter (Lovable.dev style)
//  Generates the actual code for a specific file based on the project context.
export const draftFileCode = async (req, res) => {
    try {
        const { messages, blueprint, fileName } = req.body;

        const prompt = `You are a world-class ${blueprint.techStack?.join(", ") || "Fullstack"} engineer.
        Based on our brainstorm, write the COMPLETE, production-ready code for the file: "${fileName}".
        
        Project Goal: ${messages[messages.length-1].content}
        Agreed Stack: ${JSON.stringify(blueprint.techStack)}
        
        Return ONLY the code. No markdown formatting, no explanations. Just the raw code for ${fileName}.`;

        const code = await executeWithKeyRotation(prompt);
        // Clean up any accidental markdown wrappers
        const cleanCode = code.replace(/^```[a-z]*\n|```$/gi, "").trim();
        
        res.status(200).json({ code: cleanCode });
    } catch (e) {
        console.error("Drafting Error:", e);
        res.status(500).json({ error: "Failed to draft file: " + e.message });
    }
};

// ??$$$ — NEW: AI UI Previewer (Lovable.dev style)
//  Generates a single-file Tailwind CSS mockup of the app's main dashboard.
export const generateUiPreview = async (req, res) => {
    try {
        const { messages, blueprint } = req.body;

        const prompt = `You are a world-class UI/UX designer. Create a STUNNING, modern, high-fidelity single-file HTML/Tailwind CSS mockup of the main dashboard for this project.
        
        Project: ${messages[messages.length-1].content}
        Theme: Modern, Dark Mode, Premium, Glassmorphism.
        
        Requirements:
        1. Use ONLY Tailwind CSS (via CDN).
        2. Use Lucide Icons (via CDN).
        3. Include mock data (charts, user list, etc.).
        4. Make it fully responsive.
        5. Return ONLY the HTML code. No markdown formatting.`;

        const html = await executeWithKeyRotation(prompt);
        // Clean up markdown
        const cleanHtml = html.replace(/^```html\n|```$/gi, "").trim();
        
        res.status(200).json({ html: cleanHtml });
    } catch (e) {
        console.error("UI Preview Error:", e);
        res.status(500).json({ error: "UI generation failed." });
    }
};

// ??$$$ — Save/Update Ideation Session in MongoDB
export const saveIdeationSession = async (req, res) => {
    try {
        const { repoName, messages, blueprint, nodes, edges, teamSize, hackHours, fileDrafts, uiPreview, tasks } = req.body;
        const userId = req.user._id;

        const session = await Ideation.findOneAndUpdate(
            { userId, repoName },
            { 
                messages, 
                blueprint, 
                nodes, 
                edges, 
                teamSize, 
                hackHours, 
                fileDrafts,
                uiPreview,
                tasks,
                updatedAt: Date.now() 
            },
            { upsert: true, new: true }
        );

        res.status(200).json({ message: "Session saved to cloud", session });
    } catch (e) {
        console.error("Save Session Error:", e);
        res.status(500).json({ error: "Failed to save session" });
    }
};

// ??$$$ — Fetch Ideation Session from MongoDB
export const getIdeationSession = async (req, res) => {
    try {
        const { repoName } = req.params;
        const userId = req.user._id;

        const session = await Ideation.findOne({ userId, repoName });
        if (!session) {
            return res.status(404).json({ error: "No session found" });
        }

        res.status(200).json(session);
    } catch (e) {
        console.error("Get Session Error:", e);
        res.status(500).json({ error: "Failed to fetch session" });
    }
};

// ??$$$ — Clear Ideation Session
export const clearIdeationSession = async (req, res) => {
    try {
        const { repoName } = req.params;
        const userId = req.user._id;

        await Ideation.deleteOne({ userId, repoName });
        res.status(200).json({ message: "Session cleared" });
    } catch (e) {
        console.error("Clear Session Error:", e);
        res.status(500).json({ error: "Failed to clear session" });
    }
};

// ??$$$ — Conflict Detector: scans team conversation + blueprint for contradictions
export const detectConflicts = async (req, res) => {
    try {
        const { messages = [], blueprint = {} } = req.body;

        // Build a condensed view of the conversation for the AI to analyze
        const convoSummary = messages
            .filter(m => m.role === "user")
            .map(m => `[${m.sender || "user"}]: ${m.content}`)
            .join("\n");

        const blueprintStr = JSON.stringify(blueprint, null, 2);

        const prompt = `You are a senior software architect reviewing a team's hackathon planning conversation for technical conflicts.

CONVERSATION:
${convoSummary}

CURRENT BLUEPRINT:
${blueprintStr}

Your job: Identify REAL conflicts — things that if left unresolved will cause the project to fail or confuse team members.

Look for:
1. Folder/directory naming conflicts (e.g., one person says "frontend/backend", another says "client/server")
2. Conflicting database choices (MongoDB vs PostgreSQL for same data)
3. Conflicting frontend frameworks (React vs Vue for same UI)
4. Port conflicts (two services claiming port 3000)
5. Auth method conflicts (JWT vs Sessions)
6. Contradictory feature descriptions or tech choices between teammates

IMPORTANT: Only report conflicts that are genuinely contradictory. Do not invent conflicts that don't exist.

Return ONLY valid JSON (no markdown wrapper):
{
  "conflicts": [
    {
      "id": "c1",
      "type": "folder_naming",
      "severity": "high",
      "title": "Folder naming conflict",
      "description": "One teammate uses 'frontend/backend', another uses 'client/server'.",
      "fix": "Standardize to 'frontend/backend' everywhere in the blueprint.",
      "fixPrompt": "Please update the blueprint so all folder references use 'frontend/backend' naming consistently."
    }
  ]
}

If no conflicts found, return: { "conflicts": [] }`;

        const rawReply = await executeWithKeyRotation(prompt);

        // Try to parse as raw JSON (no code block wrapper this time)
        try {
            let jsonStr = rawReply.trim();
            // strip any accidental code block
            const match = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
            if (match) jsonStr = match[1];
            const parsed = JSON.parse(jsonStr);
            return res.status(200).json(parsed);
        } catch {
            // If parse fails, return empty (don't crash)
            console.error("Conflict parse failed:", rawReply.slice(0, 200));
            return res.status(200).json({ conflicts: [] });
        }

    } catch (e) {
        console.error("Conflict Detection Error:", e);
        res.status(500).json({ error: "Conflict detection failed: " + e.message });
    }
};

// ??$$$ — NEW: Task Branch creation on GitHub
export const createRepoBranch = async (req, res) => {
    try {
        const { repoOwner, repoName, branchName, fromBranch = "main" } = req.body;
        const user = await User.findById(req.user._id);
        if (!user || !user.githubToken) return res.status(401).json({ error: "No GitHub token" });

        const headers = { 
            Authorization: `Bearer ${user.githubToken}`,
            Accept: "application/vnd.github+json"
        };

        // 1. Get the SHA of the base branch (usually main)
        const baseRes = await axios.get(`https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${fromBranch}`, { headers });
        const baseSha = baseRes.data.object.sha;

        // 2. Create the new branch
        await axios.post(`https://api.github.com/repos/${repoOwner}/${repoName}/git/refs`, {
            ref: `refs/heads/${branchName}`,
            sha: baseSha
        }, { headers });

        res.status(200).json({ success: true, branch: branchName });
    } catch (e) {
        // If branch already exists, GitHub returns 422
        if (e.response?.status === 422) {
            return res.status(200).json({ success: true, alreadyExists: true });
        }
        console.error("Branch Creation Error:", e?.response?.data || e.message);
        res.status(500).json({ error: "Failed to create branch: " + (e.response?.data?.message || e.message) });
    }
};
