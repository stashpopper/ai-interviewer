import z from "zod";

export const PreInterviewBody = z.object({
    github: z.string()
});

export const EvaluateBody = z.object({
    transcript: z.array(z.object({
        type: z.enum(["User", "Assistant"]),
        message: z.string(),
    })),
});