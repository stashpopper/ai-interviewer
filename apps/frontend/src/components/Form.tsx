import { useState, useRef } from "react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { toast } from "sonner";
import axios from "axios";
import { BACKEND_URL } from "@/lib/config";
import { useNavigate } from "react-router";
import { ArrowRight, Github, Loader2, Mic, Upload, FileText, X } from "lucide-react";

type ResumeMode = "none" | "upload" | "paste";

export function Form() {
    const [github, setGithub] = useState("");
    const [resumeMode, setResumeMode] = useState<ResumeMode>("none");
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [resumeText, setResumeText] = useState("");
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    async function onSubmit() {
        if (!github.trim() && !resumeFile && !resumeText.trim()) {
            toast("Please provide a GitHub URL or resume");
            return;
        }

        setLoading(true);
        try {
            let response;

            if (resumeFile) {
                // Multipart form data for file upload
                const formData = new FormData();
                if (github.trim()) formData.append("github", github.trim());
                formData.append("resume", resumeFile);

                response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, formData, {
                    headers: { "Content-Type": "multipart/form-data" },
                });
            } else {
                // JSON body for text-only or GitHub-only
                response = await axios.post(`${BACKEND_URL}/api/v1/pre-interview`, {
                    github: github.trim() || undefined,
                    resumeText: resumeText.trim() || undefined,
                });
            }

            navigate(`/interview/${response.data.id}`);
        } catch (e) {
            toast("Something went wrong starting your interview. Please try again.");
            setLoading(false);
        }
    }

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        const validTypes = [
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
        ];
        if (!validTypes.includes(file.type)) {
            toast("Please upload a PDF or DOCX file");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast("File must be under 10MB");
            return;
        }
        setResumeFile(file);
    }

    return (
        <main className="flex h-screen w-screen items-center justify-center overflow-hidden px-6">
            <div className="flex w-full max-w-xl flex-col items-center text-center">
                <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
                    <Mic className="size-3.5 text-primary" />
                    Voice-based technical interview
                </span>

                <h1 className="bg-gradient-to-b from-foreground to-foreground/60 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
                    AI Interview Kickstart
                </h1>
                <p className="mt-4 max-w-md text-balance text-base text-muted-foreground">
                    Drop your GitHub profile and/or resume to start a live, voice-driven interview
                    tailored to your background. Get instant feedback when you're done.
                </p>

                <div className="mt-10 w-full space-y-4">
                    {/* GitHub Input */}
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-card/60 p-2 shadow-sm backdrop-blur focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
                        <div className="flex items-center pl-2 text-muted-foreground">
                            <Github className="size-5" />
                        </div>
                        <Input
                            value={github}
                            placeholder="https://github.com/your-username"
                            onChange={(e) => setGithub(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !loading && onSubmit()}
                            disabled={loading}
                            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                        />
                    </div>

                    {/* Resume Options Toggle */}
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant={resumeMode === "upload" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setResumeMode(resumeMode === "upload" ? "none" : "upload");
                                setResumeText("");
                            }}
                            disabled={loading}
                            className="gap-2"
                        >
                            <Upload className="size-3.5" />
                            Upload Resume
                        </Button>
                        <Button
                            variant={resumeMode === "paste" ? "default" : "outline"}
                            size="sm"
                            onClick={() => {
                                setResumeMode(resumeMode === "paste" ? "none" : "paste");
                                setResumeFile(null);
                            }}
                            disabled={loading}
                            className="gap-2"
                        >
                            <FileText className="size-3.5" />
                            Paste Resume
                        </Button>
                    </div>

                    {/* File Upload */}
                    {resumeMode === "upload" && (
                        <div className="rounded-xl border border-dashed border-border bg-card/40 p-6 transition-colors hover:bg-card/60">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.docx,.doc"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                            {resumeFile ? (
                                <div className="flex items-center justify-center gap-3">
                                    <FileText className="size-5 text-primary" />
                                    <span className="text-sm font-medium">{resumeFile.name}</span>
                                    <button
                                        onClick={() => {
                                            setResumeFile(null);
                                            if (fileInputRef.current) fileInputRef.current.value = "";
                                        }}
                                        className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <X className="size-4" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex w-full flex-col items-center gap-2 text-muted-foreground hover:text-foreground"
                                >
                                    <Upload className="size-8" />
                                    <span className="text-sm">Click to upload PDF or DOCX</span>
                                    <span className="text-xs opacity-60">Max 10MB</span>
                                </button>
                            )}
                        </div>
                    )}

                    {/* Paste Resume Text */}
                    {resumeMode === "paste" && (
                        <textarea
                            value={resumeText}
                            onChange={(e) => setResumeText(e.target.value)}
                            placeholder="Paste your resume text here..."
                            disabled={loading}
                            rows={6}
                            className="w-full resize-none rounded-xl border border-border bg-card/60 p-4 text-sm shadow-sm backdrop-blur placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-[3px] focus:ring-ring/30"
                        />
                    )}

                    {/* Submit Button */}
                    <Button
                        disabled={loading}
                        onClick={onSubmit}
                        size="lg"
                        className="w-full gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="size-4 animate-spin" />
                                Starting
                            </>
                        ) : (
                            <>
                                Start interview
                                <ArrowRight className="size-4" />
                            </>
                        )}
                    </Button>

                    <p className="text-xs text-muted-foreground">
                        We'll ask for microphone access once your interview begins.
                    </p>
                </div>
            </div>
        </main>
    );
}
