import express from "express";
import { PreInterviewBody, EvaluateBody } from "./types";
import { scrapeGithub } from "./scrapers/github";
import cors from "cors";
import { calculateResult } from "./result";

const app = express();
app.use(express.json());
app.use(cors());

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

    res.json({ id: interviewId });
});

// --- Chat: Mistral generates interviewer reply ---
app.post("/api/v1/chat", async (req, res) => {
    const { message, transcript } = req.body;

    if (!message) {
        res.status(411).json({ message: "Missing message" });
        return;
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
- Base questions on the candidate's background and previous answers
- Give follow-up questions to dig deeper
- Keep responses concise (1-2 sentences max) — this is a conversation
- Be encouraging but honest
- Use English only

Current conversation context:
${JSON.stringify(transcript || [])}`
                    },
                    { role: "user", content: message },
                ],
                max_tokens: 100,
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

app.listen(3001, () => {
    console.log("Backend running on port 3001");
});
