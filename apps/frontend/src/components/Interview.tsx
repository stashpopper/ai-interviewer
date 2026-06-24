import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Bot, Loader2, PhoneOff, User } from "lucide-react";
import { Button } from "./ui/button";
import { VoiceOrb } from "./VoiceOrb";

type Status = "connecting" | "live" | "evaluating";

export function Interview() {
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>("connecting");
    const [aiLevel, setAiLevel] = useState(0);
    const [userLevel, setUserLevel] = useState(0);
    const [transcript, setTranscript] = useState<Array<{ type: string; message: string }>>([]);
    const [error, setError] = useState("");

    const synthRef = useRef<SpeechSynthesis | null>(null);
    const recognitionRef = useRef<any>(null);
    const userStreamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const isRespondingRef = useRef(false);
    const lastProcessedRef = useRef("");
    const transcriptRef = useRef<Array<{ type: string; message: string }>>([]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                synthRef.current = window.speechSynthesis;

                // Get mic
                const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (cancelled) { ms.getTracks().forEach((t) => t.stop()); return; }
                userStreamRef.current = ms;

                // Audio analyser for level meter
                const audioCtx = new AudioContext();
                const source = audioCtx.createMediaStreamSource(ms);
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 512;
                analyser.smoothingTimeConstant = 0.8;
                source.connect(analyser);
                analyserRef.current = analyser;

                // STT
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                if (!SpeechRecognition) {
                    setError("Speech recognition not supported. Use Chrome.");
                    return;
                }

                const recognition = new SpeechRecognition();
                recognitionRef.current = recognition;
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = "en-US";

                recognition.onresult = (event: any) => {
                    let finalText = "";
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalText += event.results[i][0].transcript;
                        }
                    }
                    if (finalText.trim()) {
                        const text = finalText.trim();
                        console.log("STT final:", text);
                        setTranscript((prev) => [...prev, { type: "User", message: text }]);
                    }
                };

                recognition.onerror = (e: any) => {
                    if (!cancelled && e.error !== "aborted" && e.error !== "no-speech") {
                        console.error("STT error:", e.error);
                        if (e.error === "not-allowed") setError("Mic access denied.");
                    }
                };

                // Speak function
                const speak = async (text: string) => {
                    if (cancelled) return;
                    isRespondingRef.current = true;
                    setAiLevel(0.7);
                    synthRef.current?.cancel();

                    const utterance = new SpeechSynthesisUtterance(text);
                    utterance.rate = 1.0;
                    utterance.pitch = 1.0;

                    utterance.onend = () => {
                        isRespondingRef.current = false;
                        setAiLevel(0);
                    };
                    utterance.onerror = () => {
                        isRespondingRef.current = false;
                        setAiLevel(0);
                    };

                    synthRef.current?.speak(utterance);

                    // Wait for speech to finish
                    await new Promise<void>((resolve) => {
                        const check = () => {
                            if (cancelled) { resolve(); return; }
                            if (!synthRef.current?.speaking) {
                                resolve();
                            } else {
                                setTimeout(check, 100);
                            }
                        };
                        check();
                    });
                };

                // Level meter loop
                const data = new Uint8Array(512);
                const updateLevel = () => {
                    if (cancelled) return;
                    analyserRef.current?.getByteTimeDomainData(data);
                    let sum = 0;
                    for (let i = 0; i < data.length; i++) {
                        const v = (data[i]! - 128) / 128;
                        sum += v * v;
                    }
                    const level = Math.min(1, Math.sqrt(sum / data.length) * 3.2);
                    setUserLevel(level);
                    rafRef.current = requestAnimationFrame(updateLevel);
                };
                rafRef.current = requestAnimationFrame(updateLevel);

                // First question from backend
                setError("Loading first question...");
                const firstResp = await axios.post(`${BACKEND_URL}/api/v1/chat`, {
                    message: "Start the interview",
                    transcript: [],
                });
                const firstQuestion = firstResp.data.reply;

                setError("Speaking...");
                await speak(firstQuestion);
                const firstTranscript = [{ type: "Assistant" as const, message: firstQuestion }];
                transcriptRef.current = firstTranscript;
                setTranscript(firstTranscript);
                setError("");

                // Start listening
                if (!cancelled) {
                    recognition.start();
                    setStatus("live");
                }

                // Main loop: wait for user to finish, then get AI response
                while (!cancelled) {
                    // Wait until AI is done AND user has spoken something
                    await new Promise<void>((resolve) => {
                        const check = () => {
                            if (cancelled) { resolve(); return; }
                            if (isRespondingRef.current) {
                                // AI is speaking, wait
                                setTimeout(check, 200);
                            } else {
                                // AI is done — check if user has a new message
                                const lastUser = transcriptRef.current.filter(m => m.type === "User").pop();
                                if (lastUser && lastUser.message !== lastProcessedRef.current) {
                                    lastProcessedRef.current = lastUser.message;
                                    resolve();
                                } else {
                                    setTimeout(check, 200);
                                }
                            }
                        };
                        check();
                    });

                    // Get AI response
                    if (!cancelled) {
                        const lastUserMsg = transcriptRef.current.filter(m => m.type === "User").pop();
                        if (lastUserMsg) {
                            try {
                                setError("Thinking...");
                                const resp = await axios.post(`${BACKEND_URL}/api/v1/chat`, {
                                    message: lastUserMsg.message,
                                    transcript: transcriptRef.current.slice(-6),
                                });
                                const aiText = resp.data.reply;
                                if (aiText && !cancelled) {
                                    setError("Speaking...");
                                    await speak(aiText);
                                    const newTranscript = [...transcriptRef.current, { type: "Assistant", message: aiText }];
                                    transcriptRef.current = newTranscript;
                                    setTranscript(newTranscript);
                                }
                            } catch (e) {
                                console.error("Chat error:", e);
                                setError("Network error.");
                            }
                        }
                    }
                }
            } catch (e) {
                console.error("Interview setup error:", e);
                setError("Failed to start interview.");
            }
        })();

        return () => {
            cancelled = true;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            recognitionRef.current?.stop();
            synthRef.current?.cancel();
            userStreamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, []);

    async function endInterview() {
        setStatus("evaluating");
        try {
            const result = await axios.post(`${BACKEND_URL}/api/v1/evaluate`, { transcript: transcriptRef.current });
            navigate("/result", { state: { result: result.data } });
        } catch (error) {
            console.error("Evaluation failed:", error);
            navigate("/result", { state: { result: { score: 0, feedback: "Evaluation failed. Try again later." } } });
        }
    }

    const aiSpeaking = aiLevel > 0.06;
    const userSpeaking = userLevel > 0.06;

    return (
        <main className="flex h-screen w-screen flex-col overflow-hidden">
            <header className="flex items-center justify-between px-6 py-5">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="relative flex size-2.5">
                        <span
                            className={
                                status === "live"
                                    ? "absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"
                                    : "hidden"
                            }
                        />
                        <span
                            className={
                                "relative inline-flex size-2.5 rounded-full " +
                                (status === "live" ? "bg-emerald-400" : status === "evaluating" ? "bg-amber-400" : "bg-amber-400")
                            }
                        />
                    </span>
                    {status === "connecting" ? "Connecting…" : status === "live" ? "Interview live" : "Analyzing…"}
                </div>
                <span className="text-sm text-muted-foreground">AI Interview</span>
            </header>

            <div className="flex flex-1 items-center justify-center px-6">
                {error ? (
                    <div className="flex flex-col items-center gap-3 text-red-400">
                        <p className="text-sm">{error}</p>
                        <p className="text-xs text-muted-foreground">Check browser console for details</p>
                    </div>
                ) : status === "connecting" ? (
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <Loader2 className="size-7 animate-spin" />
                        <p className="text-sm">Setting up your interview & microphone…</p>
                    </div>
                ) : (
                    <div className="flex w-full max-w-3xl flex-col items-center gap-8">
                        {/* Conversation */}
                        <div className="flex w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4" style={{ maxHeight: "50vh" }}>
                            {transcript.map((m, i) => {
                                const isAi = m.type === "Assistant";
                                return (
                                    <div key={i} className={`flex ${isAi ? "justify-start" : "justify-end"}`}>
                                        <div
                                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                                isAi ? "rounded-tl-sm bg-card text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
                                            }`}
                                        >
                                            {m.message}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Orbs */}
                        <div className="flex w-full max-w-3xl items-center justify-center gap-12 sm:gap-24">
                            <VoiceOrb
                                level={aiSpeaking ? 0.7 : 0}
                                speaking={aiSpeaking}
                                label="Interviewer"
                                sublabel={isRespondingRef.current ? "Speaking…" : "Listening"}
                                icon={Bot}
                                accent="violet"
                            />
                            <VoiceOrb
                                level={userLevel}
                                speaking={userSpeaking}
                                label="You"
                                sublabel={userSpeaking ? "Speaking…" : "Mic on"}
                                icon={User}
                                accent="emerald"
                            />
                        </div>
                    </div>
                )}
            </div>

            <footer className="flex justify-center px-6 py-8">
                <Button
                    variant="destructive"
                    size="lg"
                    onClick={endInterview}
                    disabled={status === "evaluating"}
                    className="gap-2 rounded-full px-6"
                >
                    {status === "evaluating" ? <Loader2 className="size-4 animate-spin" /> : <PhoneOff className="size-4" />}
                    End interview
                </Button>
            </footer>
        </main>
    );
}
