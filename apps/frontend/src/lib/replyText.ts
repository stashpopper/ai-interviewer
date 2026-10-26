/** Normalize chat API `reply` (string or Mistral chunk array) for TTS/display. */
export function normalizeChatReply(reply: unknown): string {
  if (typeof reply === "string") {
    return reply.replace(/\*/g, "").trim();
  }
  if (Array.isArray(reply)) {
    const parts: string[] = [];
    for (const chunk of reply) {
      if (chunk && typeof chunk === "object" && (chunk as { type?: string }).type === "text") {
        const text = (chunk as { text?: string }).text;
        if (typeof text === "string" && text.trim()) parts.push(text.trim());
      }
    }
    return parts.join("\n").replace(/\*/g, "").trim();
  }
  if (reply != null && typeof reply === "object" && "text" in reply) {
    const text = (reply as { text?: unknown }).text;
    if (typeof text === "string") return text.replace(/\*/g, "").trim();
  }
  return "";
}
