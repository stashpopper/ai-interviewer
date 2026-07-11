import z from "zod";

export const PreInterviewBody = z.object({
    github: z.string().optional(),
    resumeText: z.string().optional(),
});

export const ChatBody = z.object({
    message: z.string(),
    transcript: z.array(z.object({
        type: z.enum(["User", "Assistant"]),
        message: z.string(),
    })).optional(),
    interviewId: z.string().optional(),
});

export const EvaluateBody = z.object({
    transcript: z.array(z.object({
        type: z.enum(["User", "Assistant"]),
        message: z.string(),
    })),
});