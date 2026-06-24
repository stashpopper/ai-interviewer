import { useLocation, useNavigate } from "react-router";
import { Bot, Sparkles, User } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface ResultData {
    score: number;
    feedback: string;
}

export function Result() {
    const navigate = useNavigate();
    const location = useLocation();
    const result = (location.state as { result?: ResultData })?.result;

    if (!result) {
        return (
            <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                    <p className="text-muted-foreground">No results found. Start a new interview.</p>
                    <Button onClick={() => navigate("/")}>New interview</Button>
                </div>
            </main>
        );
    }

    return (
        <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
            <header className="mb-10 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Interview results</h1>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Your feedback and score.
                    </p>
                </div>
                <Button variant="outline" onClick={() => navigate("/")}>
                    New interview
                </Button>
            </header>

            <div className="flex flex-col gap-8">
                {/* Score + feedback */}
                <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
                    <div className="flex items-start justify-between gap-6">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                            <Sparkles className="size-4 text-violet-400" />
                            AI Feedback
                        </div>
                        <div className="flex shrink-0 items-baseline gap-1">
                            <span className="text-3xl font-bold tracking-tight">
                                {result.score}
                            </span>
                            <span className="text-sm text-muted-foreground">/ 10</span>
                        </div>
                    </div>
                    <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                        {result.feedback}
                    </p>
                </section>
            </div>
        </main>
    );
}
