import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Mic, Brain, Zap } from "lucide-react";
import { Button } from "./ui/button";

function OrbCanvas() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animId: number;
        let w = 0;
        let h = 0;

        const particles: { x: number; y: number; vx: number; vy: number; r: number; phase: number }[] = [];
        const PARTICLE_COUNT = 80;

        const resize = () => {
            w = canvas.width = canvas.offsetWidth;
            h = canvas.height = canvas.offsetHeight;
        };
        resize();
        window.addEventListener("resize", resize);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 100;
            particles.push({
                x: Math.cos(angle) * dist,
                y: Math.sin(angle) * dist,
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                r: 1 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
            });
        }

        const draw = (t: number) => {
            ctx.clearRect(0, 0, w, h);
            const cx = w / 2;
            const cy = h / 2;
            const pulse = Math.sin(t * 0.001) * 0.15 + 1;

            const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70 * pulse);
            coreGrad.addColorStop(0, "rgba(139, 92, 246, 0.9)");
            coreGrad.addColorStop(0.5, "rgba(99, 102, 241, 0.4)");
            coreGrad.addColorStop(1, "rgba(99, 102, 241, 0)");
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 70 * pulse, 0, Math.PI * 2);
            ctx.fill();

            const glowGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 140 * pulse);
            glowGrad.addColorStop(0, "rgba(139, 92, 246, 0.15)");
            glowGrad.addColorStop(1, "rgba(139, 92, 246, 0)");
            ctx.fillStyle = glowGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 140 * pulse, 0, Math.PI * 2);
            ctx.fill();

            for (const p of particles) {
                p.phase += 0.008;
                const orbit = Math.sin(p.phase) * 0.5 + 0.5;
                const px = cx + p.x * pulse + Math.sin(t * 0.0005 + p.phase) * 10;
                const py = cy + p.y * pulse + Math.cos(t * 0.0005 + p.phase) * 10;

                ctx.beginPath();
                ctx.arc(px, py, p.r * (0.5 + orbit * 0.5), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(167, 139, 250, ${0.3 + orbit * 0.5})`;
                ctx.fill();
            }

            for (let i = 0; i < particles.length; i++) {
                for (let j = i + 1; j < particles.length; j++) {
                    const a = particles[i];
                    const b = particles[j];
                    const ax = cx + a.x * pulse + Math.sin(t * 0.0005 + a.phase) * 10;
                    const ay = cy + a.y * pulse + Math.cos(t * 0.0005 + a.phase) * 10;
                    const bx = cx + b.x * pulse + Math.sin(t * 0.0005 + b.phase) * 10;
                    const by = cy + b.y * pulse + Math.cos(t * 0.0005 + b.phase) * 10;
                    const dist = Math.hypot(ax - bx, ay - by);
                    if (dist < 50) {
                        ctx.strokeStyle = `rgba(139, 92, 246, ${(1 - dist / 50) * 0.15})`;
                        ctx.lineWidth = 0.5;
                        ctx.beginPath();
                        ctx.moveTo(ax, ay);
                        ctx.lineTo(bx, by);
                        ctx.stroke();
                    }
                }
            }

            animId = requestAnimationFrame(draw);
        };

        animId = requestAnimationFrame(draw);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-60"
            style={{ width: 500, height: 500 }}
        />
    );
}

export function Landing() {
    const navigate = useNavigate();

    return (
        <main className="relative flex min-h-screen w-screen flex-col overflow-hidden bg-background">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(139,92,246,0.08)_0%,_transparent_70%)]" />

            <nav className="relative z-10 flex items-center justify-between px-8 py-6">
                <div className="flex items-center gap-2">
                    <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
                        <Brain className="size-4 text-white" />
                    </div>
                    <span className="text-lg font-bold tracking-tight">NeuralInterview</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/start")}
                    className="text-muted-foreground hover:text-foreground"
                >
                    Start now
                </Button>
            </nav>

            <section className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 text-center">
                <OrbCanvas />

                <div className="animate-in fade-in slide-in-from-bottom-8 duration-1000 fill-mode-forwards">
                    <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5 text-xs font-medium text-violet-300 backdrop-blur">
                        <span className="relative flex size-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-violet-400" />
                        </span>
                        AI-powered voice interviews
                    </div>

                    <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-7xl">
                        Practice interviews{" "}
                        <span className="bg-gradient-to-r from-violet-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
                            that feel real
                        </span>
                    </h1>

                    <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-200 fill-mode-forwards">
                        Speak with an AI interviewer that adapts to your GitHub projects,
                        asks follow-up questions, and scores your performance in real time.
                    </p>

                    <div className="mt-10 flex items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-400 fill-mode-forwards">
                        <Button
                            size="lg"
                            onClick={() => navigate("/start")}
                            className="gap-2 rounded-full bg-gradient-to-r from-violet-600 to-indigo-600 px-8 text-base shadow-[0_0_30px_rgba(139,92,246,0.3)] hover:shadow-[0_0_40px_rgba(139,92,246,0.5)] transition-all duration-300"
                        >
                            Start your interview
                            <ArrowRight className="size-4" />
                        </Button>
                    </div>
                </div>

                <div className="mt-20 grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-6 duration-1000 delay-600 fill-mode-forwards">
                    {[
                        {
                            icon: Mic,
                            title: "Voice-first",
                            desc: "Natural conversation, not typed Q&A",
                            color: "from-violet-500 to-purple-600",
                        },
                        {
                            icon: Brain,
                            title: "Adaptive AI",
                            desc: "Questions tailored to your codebase",
                            color: "from-indigo-500 to-blue-600",
                        },
                        {
                            icon: Zap,
                            title: "Instant feedback",
                            desc: "Score and insights after every session",
                            color: "from-emerald-500 to-teal-600",
                        },
                    ].map((item) => (
                        <div
                            key={item.title}
                            className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 p-6 backdrop-blur transition-all duration-300 hover:border-violet-500/30 hover:bg-card/60"
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 transition-opacity duration-300 group-hover:opacity-[0.03]`} />
                            <div className={`mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} shadow-lg`}>
                                <item.icon className="size-5 text-white" />
                            </div>
                            <h3 className="font-semibold">{item.title}</h3>
                            <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="relative z-10 py-6 text-center text-xs text-muted-foreground">
                Built with voice AI. No scripts. No typing.
            </footer>
        </main>
    );
}
