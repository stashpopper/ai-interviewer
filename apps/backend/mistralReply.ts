/** Mistral assistant `message.content`: plain string or typed chunks (reasoning models). */
export type MistralContentChunk =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: Array<{ type?: string; text?: string }> };

export function extractAssistantReplyText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }

  const spokenParts: string[] = [];
  for (const chunk of content as MistralContentChunk[]) {
    if (chunk?.type === "text" && typeof chunk.text === "string" && chunk.text.trim()) {
      spokenParts.push(chunk.text.trim());
    }
  }
  return spokenParts.join("\n").trim();
}

export function sanitizeInterviewerSpeech(text: string): string {
  return text.replace(/\*/g, "").trim();
}
