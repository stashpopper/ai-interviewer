
// Bun-specific: import.meta.env works in both server and browser contexts
export const BACKEND_URL = "http://localhost:3001";
export const GEMINI_API_KEY = (typeof process !== "undefined" && process.env?.GEMINI_API_KEY) || import.meta.env?.GEMINI_API_KEY || "";