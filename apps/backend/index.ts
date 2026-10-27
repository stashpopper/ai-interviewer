import express from "express";
import { PreInterviewBody, ChatBody, EvaluateBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { calculateResult } from "./result";
import WebSocket from "ws";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { appendFileSync } from "fs";
import { extractAssistantReplyText, sanitizeInterviewerSpeech } from "./mistralReply";

const DEBUG_LOG_PATH = "/home/hritam/Projects/ai-interviewer/.cursor/debug-9610a0.log";

function agentLog(payload: Record<string, unknown>) {
    try {
        appendFileSync(DEBUG_LOG_PATH, `${JSON.stringify({ sessionId: "9610a0", timestamp: Date.now(), ...payload })}\n`);
    } catch {
        /* ignore */
    }
}

const app = express();
app.use(express.json());
app.use(cors());

// In-memory store for interview context (github data + resume)
const interviewContext = new Map<string, { githubUsername?: string; githubData?: Array<{ description?: string; name: string; fullName: string; starCount?: number }>; resumeText?: string }>();

// Multer config for resume uploads (memory storage)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// --- Pre-interview: scrape GitHub and/or parse resume, return an interview ID ---
app.post("/api/v1/pre-interview", upload.single("resume"), async (req, res) => {
    // Support both JSON body and multipart form data
    const github = req.body?.github as string | undefined;
    const resumeTextBody = req.body?.resumeText as string | undefined;
    const resumeFile = req.file;

    if (!github && !resumeTextBody && !resumeFile) {
        res.status(411).json({ message: "Provide at least a GitHub URL or resume" });
        return;
    }

    let resumeText = resumeTextBody || "";

    // Parse uploaded file if provided
    if (resumeFile) {
        try {
            const mimetype = resumeFile.mimetype.toLowerCase();
            if (mimetype === "application/pdf") {
                const parser = new PDFParse({ data: resumeFile.buffer });
                const result = await parser.getText();
                resumeText = result.text;
                await parser.destroy();
            } else if (
                mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
                mimetype === "application/msword"
            ) {
                const result = await mammoth.extractRawText({ buffer: resumeFile.buffer });
                resumeText = result.value;
            } else {
                res.status(400).json({ message: "Unsupported file type. Please upload PDF or DOCX." });
                return;
            }
        } catch (err) {
            console.error("Resume parse error:", err);
            res.status(500).json({ message: "Failed to parse resume file." });
            return;
        }
    }

    // Truncate resume text to avoid token overflow (~8k chars max)
    if (resumeText.length > 8000) {
        resumeText = resumeText.slice(0, 8000);
    }

    let githubUsername: string | undefined;
    let githubData: Array<{ description?: string; name: string; fullName: string; starCount?: number }> | undefined;

    if (github) {
        const githubUrl = github.endsWith("/") ? github.slice(0, -1) : github;
        githubUsername = githubUrl.split("/").pop()!;
        githubData = await scrapeGithub(githubUsername);
    }

    const interviewId = crypto.randomUUID();
    interviewContext.set(interviewId, { githubUsername, githubData, resumeText });

    res.json({ id: interviewId });
});

// --- Chat: Mistral generates interviewer reply ---
app.post("/api/v1/chat", async (req, res) => {
    const { success, data } = ChatBody.safeParse(req.body);
    if (!success) {
        res.status(411).json({ message: "Incorrect body" });
        return;
    }

    const { message, transcript, interviewId } = data;

    const context = interviewId ? interviewContext.get(interviewId) : null;

    let backgroundContext = "";
    if (context) {
        const parts: string[] = [];
        if (context.githubData && context.githubData.length > 0) {
            const repos = context.githubData
                .sort((a, b) => (b.starCount || 0) - (a.starCount || 0))
                .slice(0, 5)
                .map(r => `  - ${r.fullName}${r.description ? ` (${r.description})` : ""}`)
                .join("\n");
            parts.push(`GitHub profile (@${context.githubUsername}) top projects:\n${repos}`);
        }
        if (context.resumeText) {
            parts.push(`Candidate's resume:\n${context.resumeText}`);
        }
        if (parts.length > 0) {
            backgroundContext = `\n\nCandidate background:\n${parts.join("\n\n")}\n\nUse this background to tailor your questions.`;
        }
    }

    try {
        const resp = await fetch("https://api.mistral.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.MISTRAL_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: process.env.MISTRAL_MODEL || "labs-leanstral-2603",
                messages: [
                    {
                        role: "system",
                        content: `You are a friendly technical interviewer conducting a voice interview. Follow these rules:
- Ask 4-6 progressive questions, starting easy and getting harder
- Base your FIRST question on the candidate's GitHub projects and background
- Give follow-up questions to dig deeper into their answers
- Keep responses concise (1-2 sentences max) — this is a spoken conversation
- Be encouraging but honest
- Use English only
- Do NOT use asterisks (*) for emphasis or formatting
- Do NOT use any markdown formatting
- Do NOT say "Got it" or "Nice" as standalone responses — always ask a question or give a follow-up

Candidate background:${backgroundContext}

Current conversation context:
${JSON.stringify(transcript || [])}`
                    },
                    { role: "user", content: message },
                ],
                max_tokens: 150,
                reasoning_effort: "none",
            }),
        });

        const data = await resp.json();
        const rawContent = data.choices?.[0]?.message?.content;
        const FALLBACK_REPLY =
            "Could you walk me through a recent project from your GitHub and your role in it?";
        let extracted = sanitizeInterviewerSpeech(extractAssistantReplyText(rawContent));
        if (!extracted) {
            extracted = FALLBACK_REPLY;
        }
        // #region agent log
        agentLog({
            runId: "chat-fix",
            hypothesisId: "H1-H3",
            location: "index.ts:/api/v1/chat",
            message: "Mistral reply normalized",
            data: {
                contentType: Array.isArray(rawContent) ? "array" : typeof rawContent,
                chunkTypes: Array.isArray(rawContent)
                    ? rawContent.map((c: { type?: string }) => c?.type)
                    : null,
                extractedLen: extracted.length,
                extractedPreview: extracted.slice(0, 120),
            },
        });
        // #endregion
        res.json({ reply: extracted });
    } catch (error) {
        console.error("Mistral error:", error);
        res.status(500).json({ reply: "I didn't catch that, could you repeat?" });
    }
});

// --- Evaluate: take transcript, return score + feedback ---
app.post("/api/v1/evaluate", async (req, res) => {
    const { success, data } = EvaluateBody.safeParse(req.body);

    if (!success) {
        res.status(411).json({ message: "Incorrect body" });
        return;
    }

    const messages = data.transcript.map(t => ({
        type: t.type as "User" | "Assistant",
        message: t.message,
        createdAt: new Date(),
    }));

    try {
        const result = await calculateResult(messages);
        res.json(result);
    } catch (error: any) {
        console.error("Evaluation error:", error.message);
        // Return a default result if Gemini is down
        res.json({
            score: 0,
            feedback: "Could not evaluate your interview right now due to a service issue. Please try again later."
        });
    }
});

// --- Keep-alive route (prevents Render cold starts) ---
app.get("/keep-alive", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});

const server = app.listen(3001, () => {
    console.log("Backend running on port 3001");
});

const wsServer = new WebSocket.Server({ server, path: "/ws/stt" });

wsServer.on("connection", async (ws, req) => {
    const url = new URL(req.url!, `http://localhost:3001`);
    const interviewId = url.searchParams.get("interviewId");
    if (!interviewId) {
        ws.close();
        return;
    }

    const DG_API_KEY = process.env.DEEPGRAM_API_KEY || "00635ea07a4ac5bdc21b70b8ea839e37de25616c";
    const dgUrl = "wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&punctuate=true&smart_format=true&dictation=true&encoding=linear16&sample_rate=16000&channels=1";

    console.log(`[STT] Connection opened for interview: ${interviewId}`);

    let dgReady = false;
    let pendingAudio: Buffer[] = [];
    let dg: WebSocket | null = null;

    const connectDeepgram = () => {
        dg = new WebSocket(dgUrl, {
            headers: { "Authorization": `Token ${DG_API_KEY}` },
        });

        dg.on("open", () => {
            console.log(`[STT] Deepgram connected: ${interviewId}`);
            dgReady = true;
            if (pendingAudio.length > 0) {
                dg!.send(Buffer.concat(pendingAudio));
                pendingAudio = [];
            }
        });

        dg.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === "speech_started") {
                    ws.send(JSON.stringify({ type: "speechStarted" }));
                } else if (msg.type === "Results") {
                    const channel = msg.channel !== undefined ? msg.channel : null;
                    const alternatives = channel?.alternatives || msg.alternatives;
                    const text = alternatives?.[0]?.transcript;
                    if (text && text.trim()) {
                        console.log(`[STT] Final: ${interviewId}: ${text.trim()}`);
                        ws.send(JSON.stringify({ type: "final", text: text.trim() }));
                    }
                } else if (msg.type === "results_transient" || (msg.type === "Results" && !msg.is_final)) {
                    const channel = msg.channel !== undefined ? msg.channel : null;
                    const alternatives = channel?.alternatives || msg.alternatives;
                    const text = alternatives?.[0]?.transcript;
                    if (text) {
                        ws.send(JSON.stringify({ type: "interim", text: text.trim() }));
                    }
                } else if (msg.type === "error") {
                    console.error(`[STT] DG error: ${msg.error || msg}`);
                }
            } catch (e) {
                console.error(`[STT] DG message parse error:`, e);
            }
        });

        dg.on("error", (err) => {
            console.error(`[STT] Deepgram error: ${interviewId}:`, err.message);
        });

        dg.on("close", () => {
            console.log(`[STT] Deepgram closed: ${interviewId}`);
            if (ws.readyState === WebSocket.OPEN) {
                console.log(`[STT] Reconnecting Deepgram: ${interviewId}`);
                dgReady = false;
                setTimeout(connectDeepgram, 500);
            }
        });
    };

    connectDeepgram();

    // Receive audio from frontend and forward to Deepgram
    ws.on("message", (data) => {
        const buf = data instanceof Buffer ? data : Buffer.from(data);
        if (dg && dgReady) {
            dg.send(buf);
        } else {
            pendingAudio.push(buf);
        }
    });

    ws.on("close", () => {
        console.log(`[STT] Client disconnected: ${interviewId}`);
        dg?.close();
    });

    ws.on("error", (err) => {
        console.error(`[STT] WS error: ${interviewId}:`, err.message);
        dg?.close();
    });
});
