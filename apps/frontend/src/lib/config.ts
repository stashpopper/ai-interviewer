
const LOCAL_BACKEND = "http://localhost:3001";
const PRODUCTION_BACKEND = "https://ai-interviewer-ky0h.onrender.com";

declare global {
  // Injected at build time via apps/frontend/build.ts (Bun `define`)
  var __BACKEND_URL__: string | undefined;
}

function readInjectedBackendUrl(): string | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const value = globalThis.__BACKEND_URL__;
  if (typeof value === "string" && value.length > 0) return value;
  return undefined;
}

function readRuntimeBackendUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const { hostname } = window.location;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return LOCAL_BACKEND;
  }
  return PRODUCTION_BACKEND;
}

export const BACKEND_URL =
  readInjectedBackendUrl() ?? readRuntimeBackendUrl() ?? LOCAL_BACKEND;

/** WebSocket origin (ws/wss) for the configured backend. */
export function backendWebSocketOrigin(): string {
  const url = BACKEND_URL;
  if (url.startsWith("https://")) return url.replace("https://", "wss://");
  if (url.startsWith("http://")) return url.replace("http://", "ws://");
  return url;
}

// #region agent log
if (typeof window !== "undefined") {
  fetch("http://127.0.0.1:7767/ingest/0f3cb5ec-1324-4061-a22c-e4706fc633ce", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9610a0" },
    body: JSON.stringify({
      sessionId: "9610a0",
      runId: "pre-fix",
      hypothesisId: "H1-H2",
      location: "config.ts:BACKEND_URL",
      message: "Resolved BACKEND_URL",
      data: {
        backendUrl: BACKEND_URL,
        injected: readInjectedBackendUrl() ?? null,
        hostname: window.location.hostname,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
}
// #endregion
