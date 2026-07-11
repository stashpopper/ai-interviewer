import { BACKEND_URL } from "@/lib/config";
import axios from "axios";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Bot, Loader2, PhoneOff, User } from "lucide-react";
import { Button } from "./ui/button";
import { VoiceOrb } from "./VoiceOrb";

type Status = "connecting" | "live" | "evaluating";

// Simple linear interpolation resampler
function resampleSamples(input: Float32Array, ratio: number): Float32Array {
    const outputLen = Math.floor(input.length * ratio);
    const output = new Float32Array(outputLen);

    for (let i = 0; i < outputLen; i++) {
        const srcIndex = i / ratio;
        const idx = Math.floor(srcIndex);
        const frac = srcIndex - idx;
        if (idx + 1 < input.length) {
            output[i] = input[idx] * (1 - frac) + input[idx + 1] * frac;
        } else {
            output[i] = input[idx] || 0;
        }
    }

    return output;
}

export function Interview() {
    const { interviewId } = useParams();
    const navigate = useNavigate();
    const [status, setStatus] = useState<Status>("connecting");
    const [aiLevel, setAiLevel] = useState(0);
    const [userLevel, setUserLevel] = useState(0);
    const [transcript, setTranscript] = useState<Array<{ type: string; message: string }>>([]);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [interimText, setInterimText] = useState("");

    const synthRef = useRef<SpeechSynthesis | null>(null);
    const userStreamRef = useRef<MediaStream | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef = useRef<number | null>(null);
    const isRespondingRef = useRef(false);
    const processedUserCountRef = useRef(0);
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingFinalTextRef = useRef("");
    const lastSpeechTimeRef = useRef<number>(0);
    const transcriptRef = useRef<Array<{ type: string; message: string }>>([]);
    const wsRef = useRef<WebSocket | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const prevUserLevelRef = useRef(0);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                synthRef.current = window.speechSynthesis;

                // Get mic
                const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (cancelled) { ms.getTracks().forEach((t) => t.stop()); return; }
                userStreamRef.current = ms;
                streamRef.current = ms;

                // Audio pipeline: capture at native rate, resample to 16kHz for Deepgram
                const nativeAudioCtx = new AudioContext();
                audioContextRef.current = nativeAudioCtx;
                const source = nativeAudioCtx.createMediaStreamSource(ms);

                const bufferSize = 4096;
                const scriptProcessor = nativeAudioCtx.createScriptProcessor(bufferSize, 1, 1);
                source.connect(scriptProcessor);
                scriptProcessor.connect(nativeAudioCtx.destination);

                let nativeSampleRate = nativeAudioCtx.sampleRate;
                let targetSampleRate = 16000;
                let resampleRatio = targetSampleRate / nativeSampleRate;
                let leftover: Float32Array | null = null;

                scriptProcessor.onaudioprocess = (e) => {
                    const inputData = e.inputBuffer.getChannelData(0);

                    // Calculate audio level for visualization
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        const v = inputData[i];
                        sum += v * v;
                    }
                    const level = Math.min(1, Math.sqrt(sum / inputData.length) * 4);
                    if (Math.abs(level - prevUserLevelRef.current) > 0.03) {
                        setUserLevel(level);
                        prevUserLevelRef.current = level;
                    }

                    // Prepend leftover from previous callback
                    let input: Float32Array;
                    if (leftover && leftover.length > 0) {
                        input = new Float32Array(leftover.length + inputData.length);
                        input.set(leftover);
                        input.set(inputData, leftover.length);
                        leftover = null;
                    } else {
                        input = inputData;
                    }

                    // Resample entire input
                    const resampled = resampleSamples(input, resampleRatio);

                    // Send in ~10ms chunks (160 samples at 16kHz = 320 bytes int16)
                    const chunkSize = 160;
                    let i = 0;
                    for (; i < resampled.length - chunkSize; i += chunkSize) {
                        const end = i + chunkSize;

                        // Convert float32 to int16 PCM inline
                        const int16Data = new Int16Array(chunkSize);
                        for (let j = 0; j < chunkSize; j++) {
                            const s = resampled[i + j];
                            int16Data[j] = s < 0 ? Math.floor(s * 0x8000) : Math.floor(s * 0x7FFF);
                        }

                        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                            wsRef.current.send(int16Data.buffer);
                        }
                    }

                    // Keep leftover samples that don't form a full chunk
                    if (i < resampled.length) {
                        leftover = resampled.slice(i);
                    }
                };

                // Connect to backend WebSocket for STT
                const wsUrl = `${BACKEND_URL.replace("http", "ws")}/ws/stt?interviewId=${interviewId}`;
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log("[STT] WebSocket connected");
                };

                ws.onmessage = (event) => {
                    try {
                        const msg = JSON.parse(event.data);

                        // Track last speech activity timestamp
                        lastSpeechTimeRef.current = Date.now();

                        if (msg.type === "speechStarted") {
                            console.log("[STT] Speech started");
                            // Clear silence timer — user is actively speaking
                            if (silenceTimerRef.current) {
                                clearTimeout(silenceTimerRef.current);
                                silenceTimerRef.current = null;
                            }
                        } else if (msg.type === "interim") {
                            setInterimText(msg.text);
                            // Clear silence timer — user is still speaking
                            if (silenceTimerRef.current) {
                                clearTimeout(silenceTimerRef.current);
                                silenceTimerRef.current = null;
                            }
                        } else if (msg.type === "final") {
                            const text = msg.text.trim();
                            if (!text) return;
                            setInterimText(text);
                            pendingFinalTextRef.current = pendingFinalTextRef.current
                                ? pendingFinalTextRef.current + " " + text
                                : text;
                            // Reset silence timer — wait 7s of true silence before committing
                            if (silenceTimerRef.current) {
                                clearTimeout(silenceTimerRef.current);
                            }
                            silenceTimerRef.current = setTimeout(() => {
                                // Double-check: only commit if no speech activity in the last 7s
                                const elapsed = Date.now() - lastSpeechTimeRef.current;
                                if (elapsed < 6500) {
                                    // Speech happened recently, don't commit yet
                                    // Restart timer for remaining time
                                    const remaining = 7000 - elapsed;
                                    silenceTimerRef.current = setTimeout(() => {
                                        const finalText = pendingFinalTextRef.current.trim();
                                        if (!finalText) return;
                                        setInterimText("");
                                        console.log("[STT] Committed text:", finalText);
                                        const entry = { type: "User" as const, message: finalText };
                                        transcriptRef.current = [...transcriptRef.current, entry];
                                        setTranscript((prev) => [...prev, entry]);
                                        pendingFinalTextRef.current = "";
                                        silenceTimerRef.current = null;
                                    }, remaining);
                                    return;
                                }
                                const finalText = pendingFinalTextRef.current.trim();
                                if (!finalText) return;
                                setInterimText("");
                                console.log("[STT] Committed text:", finalText);
                                const entry = { type: "User" as const, message: finalText };
                                transcriptRef.current = [...transcriptRef.current, entry];
                                setTranscript((prev) => [...prev, entry]);
                                pendingFinalTextRef.current = "";
                                silenceTimerRef.current = null;
                            }, 7000);
                        }
                    } catch (e) {
                        console.error("[STT] Message parse error:", e);
                    }
                };

                ws.onerror = (err) => {
                    console.error("[STT] WebSocket error:", err);
                    if (!cancelled) setError("Speech recognition connection failed.");
                };

                ws.onclose = () => {
                    console.log("[STT] WebSocket closed");
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

                // First question from backend
                setStatusMessage("Loading first question...");
                const firstResp = await axios.post(`${BACKEND_URL}/api/v1/chat`, {
                    message: "Start the interview",
                    transcript: [],
                    interviewId,
                });
                let firstQuestion = firstResp.data.reply;
                firstQuestion = firstQuestion.replace(/\*/g, "").trim();

                setStatusMessage("Speaking...");
                await speak(firstQuestion);
                const firstTranscript = [{ type: "Assistant" as const, message: firstQuestion }];
                transcriptRef.current = firstTranscript;
                setTranscript(firstTranscript);
                setStatusMessage("");
                setStatus("live");

                // Main loop: wait for user to finish speaking, then get AI response
                while (!cancelled) {
                    await new Promise<void>((resolve) => {
                        const check = () => {
                            if (cancelled) { resolve(); return; }
                            // Don't respond while AI is already speaking
                            if (isRespondingRef.current) {
                                setTimeout(check, 200);
                                return;
                            }
                            // Don't respond while user is actively speaking or silence timer is running
                            // (meaning we're still waiting for user to finish)
                            if (silenceTimerRef.current !== null) {
                                setTimeout(check, 200);
                                return;
                            }
                            const userMsgs = transcriptRef.current.filter(m => m.type === "User");
                            if (userMsgs.length > processedUserCountRef.current) {
                                resolve();
                            } else {
                                setTimeout(check, 200);
                            }
                        };
                        check();
                    });

                    if (!cancelled) {
                        const userMsgs = transcriptRef.current.filter(m => m.type === "User");
                        if (userMsgs.length > processedUserCountRef.current) {
                            const lastUserMsg = userMsgs[userMsgs.length - 1];
                            try {
                                setStatusMessage("Thinking...");
                                const resp = await axios.post(`${BACKEND_URL}/api/v1/chat`, {
                                    message: lastUserMsg.message,
                                    transcript: transcriptRef.current.slice(-6),
                                    interviewId,
                                });
                                let aiText = resp.data.reply;
                                aiText = aiText.replace(/\*/g, "").trim();
                                if (aiText && !cancelled) {
                                    setStatusMessage("Speaking...");
                                    await speak(aiText);
                                    const newTranscript = [...transcriptRef.current, { type: "Assistant" as const, message: aiText }];
                                    transcriptRef.current = newTranscript;
                                    setTranscript(newTranscript);
                                    processedUserCountRef.current = userMsgs.length;
                                    setStatusMessage("");
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
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            wsRef.current?.close();
            if (audioContextRef.current) audioContextRef.current.close();
            synthRef.current?.cancel();
            userStreamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, [interviewId]);

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

    const memoizedTranscript = useMemo(() => {
        return transcript.map((m, i) => {
            const isAi = m.type === "Assistant";
            return { ...m, _key: i, isAi };
        });
    }, [transcript]);

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

            <div className="flex flex-1 items-center justify-center overflow-hidden px-6">
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
                        {/* Status indicator (shown inline, doesn't replace content) */}
                        {statusMessage && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" />
                                <p className="text-sm">{statusMessage}</p>
                            </div>
                        )}

                        {/* Conversation */}
                        <div className="flex w-full max-w-2xl flex-col gap-3 overflow-y-auto px-4" style={{ maxHeight: "50vh" }}>
                            {memoizedTranscript.map((m) => (
                                <div key={m._key} className={`flex ${m.isAi ? "justify-start" : "justify-end"}`}>
                                    <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                            m.isAi ? "rounded-tl-sm bg-card text-foreground" : "rounded-tr-sm bg-primary text-primary-foreground"
                                        }`}
                                    >
                                        {m.message}
                                    </div>
                                </div>
                            ))}
                            {interimText && (
                                <div className="flex justify-end">
                                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/60 px-4 py-2.5 text-sm leading-relaxed text-primary-foreground opacity-70 italic">
                                        {interimText}
                                    </div>
                                </div>
                            )}
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

            <footer className="flex shrink-0 justify-center px-6 py-8">
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
