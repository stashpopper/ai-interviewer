
// Set via Bun build --define at build time
export const BACKEND_URL = (typeof globalThis !== "undefined" && globalThis.__BACKEND_URL__) || "http://localhost:3001";
export const GEMINI_API_KEY = (typeof globalThis !== "undefined" && globalThis.__GEMINI_API_KEY__) || "";