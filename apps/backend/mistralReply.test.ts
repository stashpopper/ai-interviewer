import { describe, expect, test } from "bun:test";
import { extractAssistantReplyText, sanitizeInterviewerSpeech } from "./mistralReply";

describe("extractAssistantReplyText", () => {
  test("plain string content", () => {
    expect(extractAssistantReplyText("Hello, tell me about your project.")).toBe(
      "Hello, tell me about your project.",
    );
  });

  test("reasoning model chunk list ignores thinking", () => {
    const content = [
      {
        type: "thinking",
        thinking: [{ type: "text", text: "Plan the first question..." }],
      },
      { type: "text", text: "What drew you to your latest GitHub project?" },
    ];
    expect(extractAssistantReplyText(content)).toBe(
      "What drew you to your latest GitHub project?",
    );
  });

  test("non-string non-array returns empty", () => {
    expect(extractAssistantReplyText(null)).toBe("");
    expect(extractAssistantReplyText({ foo: 1 })).toBe("");
  });
});

describe("sanitizeInterviewerSpeech", () => {
  test("strips asterisks", () => {
    expect(sanitizeInterviewerSpeech("*Hello* there")).toBe("Hello there");
  });
});
