import express from "express";
import { PreInterviewBody, ChatBody, EvaluateBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { calculateResult } from "./result";
import WebSocket from "ws";

const app = express();
app.use(express.json());
app.use(cors());

// In-memory store for interview context (github data)
const interviewContext = new Map<string, { githubUsername: string; githubData: Array<{ description?: string; name: string; fullName: string; starCount?: number }> }>();

// --- Pre-interview: scrape GitHub and return an interview ID ---
app.post("/api/v1/pre-interview", async (req, res) => {
    const { success, data } = PreInterviewBody.safeParse(req.body);

    if (!success) {
        res.status(411).json({ message: "Incorrect body" });
        return;
    }

    const githubUrl = data.github.endsWith("/") ? data.github.slice(0, -1) : data.github;
    const githubUsername = githubUrl.split("/").pop()!;
    const githubData = await scrapeGithub(githubUsername);

    const interviewId = crypto.randomUUID();

    // Store github data in memory (keyed by interview id)
    interviewContext.set(interviewId, { githubUsername, githubData });

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

    let githubContext = "";
    if (context && context.githubData.length > 0) {
        const repos = context.githubData
            .sort((a, b) => (b.starCount || 0) - (a.starCount || 0))
            .slice(0, 5)
            .map(r => `  - ${r.fullName}${r.description ? ` (${r.description})` : ""}`)
            .join("\n");
        githubContext = `\nThe candidate's GitHub profile (@${context.githubUsername}) has these top projects:\n${repos}\n\nUse these projects to tailor your questions.`;
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

Candidate background:${githubContext}

Current conversation context:
${JSON.stringify(transcript || [])}`
                    },
                    { role: "user", content: message },
                ],
                max_tokens: 150,
            }),
        });

        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content || "Could you elaborate on that?";
        res.json({ reply });
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
