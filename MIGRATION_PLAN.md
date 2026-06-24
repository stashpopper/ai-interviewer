# AI Interviewer — Migration Plan

## Goal
Replace all paid services with free alternatives and eliminate the database layer. Single-session interview with no persistence.

---

## Architecture Before → After

| Component | Before | After |
|-----------|--------|-------|
| Voice conversation | OpenAI Realtime API (WebRTC/SDP) via backend proxy | Gemini Live API (WebSocket) from frontend directly |
| Transcription | Deepgram (WebSocket) | Web Speech API (browser native, free) |
| Evaluation | Gemini (`gemini-3.5-flash`) | Same — no change |
| Database | PostgreSQL + Prisma | Removed entirely |
| Backend role | SDP proxy + DB writes + evaluation | Pre-interview scraper + evaluation endpoint only |
| Frontend role | WebRTC + Deepgram + DB polling | Gemini Live WebSocket + local state + single evaluate call |

---

## Files to DELETE

| File | Reason |
|------|--------|
| `apps/backend/sideband.ts` | OpenAI sideband WebSocket handler — no longer needed |
| `apps/backend/db.ts` | Prisma/PostgreSQL connection — no DB |
| `apps/backend/prisma/schema.prisma` | DB schema — no DB |
| `apps/backend/prisma/migrations/` | Migration directory — no DB |
| `apps/backend/prisma.config.ts` | Prisma config — no DB |

---

## Files to MODIFY

### 1. `apps/backend/package.json`
**Remove dependencies:**
- `pg`
- `@prisma/client`
- `@prisma/adapter-pg`
- `prisma`
- `@types/pg`

**Keep:** `@google/genai`, `express`, `cors`, `ws`, `axios`, `zod`, `zod-to-json-schema`, `https-proxy-agent`

### 2. `apps/backend/index.ts`
**Remove endpoints:**
- `POST /api/v1/session/:id` — SDP proxy to OpenAI
- `POST /api/v1/session/user/response/:id` — saves message to DB
- `GET /api/v1/result/:id` — DB-fetched results

**Keep endpoint:**
- `POST /api/v1/pre-interview` — scrapes GitHub, returns interview ID (no DB write)

**Add endpoint:**
- `POST /api/v1/evaluate` — takes `{ transcript: [{type, message}] }`, returns `{ score, feedback }`

**Remove imports:** `prisma` from db, `initSideband` from sideband

### 3. `apps/backend/result.ts`
**Change signature:**
```typescript
// Before: takes DB-fetched messages with createdAt
export async function calculateResult(messages: {type: "Assistant" | "User", message: string, createdAt: Date}[])

// After: takes frontend messages (same shape, no DB lookup needed)
// The function body stays the same — it already uses GoogleGenAI
```

**Update model:** `gemini-3.5-flash` → `gemini-2.5-flash` (free tier)

### 4. `apps/backend/types.ts`
**Keep:** `PreInterviewBody` (still needed for GitHub URL validation)
**Add:** `EvaluateBody`
```typescript
export const EvaluateBody = z.object({
    transcript: z.array(z.object({
        type: z.enum(["User", "Assistant"]),
        message: z.string(),
    })),
});
```

### 5. `apps/frontend/src/components/Interview.tsx`
**Remove (~50+ lines):**
- `RTCPeerConnection` + SDP handshake
- `socketRef` (Deepgram WebSocket)
- `audioCtx` for AI audio metering (keep for user metering)
- `axios.post` to `/api/v1/session/user/response/`

**Add:**
- Direct Gemini Live WebSocket connection:
  ```typescript
  const ws = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`
  );
  ```
- Gemini Live protocol handler:
  - Send config frame on open (model, instructions, audio config)
  - Send audio chunks (base64 encoded FLAC) on speech
  - Receive response frames (audio + text)
- Local transcript state:
  ```typescript
  const [transcript, setTranscript] = useState<Array<{type: string, message: string}>>([]);
  ```
- On interview end, send transcript to backend:
  ```typescript
  const result = await axios.post(`${BACKEND_URL}/api/v1/evaluate`, { transcript });
  navigate(`/result`, { state: { result } });
  ```

**Keep:**
- `VoiceOrb` component (drives off audio levels)
- `createLevelMeter` (still works for user mic)
- Audio playback for AI responses

### 6. `apps/frontend/src/components/Result.tsx`
**Change:**
- Accept `score`/`feedback` as props from navigation state (instead of polling DB)
- Remove `useEffect` polling loop
- Remove API call to `/api/v1/result/:id`
- Remove `status`/`transcript` from result data (transcript shown in Interview screen instead)

### 7. `apps/frontend/src/App.tsx`
**Update routing:**
- Remove `:interviewId` param dependency for result page
- Result page receives data from `useLocation().state` instead of URL param

### 8. `apps/frontend/src/lib/config.ts`
**Add:** `GEMINI_API_KEY` (or use a backend proxy if you change mind later)

### 9. `apps/frontend/package.json`
**Remove dependency:** `@deepgram/sdk`

---

## Gemini Live API Protocol

### Connection
```
GET wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=YOUR_API_KEY
```

### On Open — Send Config
```json
{
  "setup": {
    "model": "models/gemini-2.5-flash-preview-05-20",
    "generation_config": {
      "response_modalities": ["audio"],
      "speech_config": {
        "voice_config": {
          "prebuilt_voice_config": {
            "voice_name": "Puck"
          }
        }
      }
    },
    "system_instruction": {
      "parts": [{
        "text": "You are an interviewer..."
      }]
    }
  }
}
```

### Send Audio (from user mic)
```json
{
  "client_content": {
    "turns": [{"text": "..."}],
    "turn_complete": true
  }
}
```

### Receive Response
```json
{
  "server_content": {
    "turns": [{"text": "..."}],
    "audio": "base64-encoded-audio-chunk"
  }
}
```

---

## New Backend Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/pre-interview` | Scrape GitHub, return interview ID |
| POST | `/api/v1/evaluate` | Takes `{transcript: [...]}`, returns `{score, feedback}` |

---

## New Frontend Flow

1. User enters GitHub URL → `POST /api/v1/pre-interview`
2. Frontend opens Gemini Live WebSocket directly
3. Conversation happens live, messages stored in frontend state
4. User clicks "End interview"
5. Frontend sends transcript to `POST /api/v1/evaluate`
6. Backend calls Gemini (text model), returns score + feedback
7. Frontend shows results
8. All data discarded (no persistence)

---

## Dependencies to Remove

### Backend (`apps/backend/package.json`)
```
pg
@prisma/client
@prisma/adapter-pg
prisma
@types/pg
```

### Frontend (`apps/frontend/package.json`)
```
@deepgram/sdk
```

---

## Environment Variables

### Remove
```
DATABASE_URL
OPENAI_KEY
```

### Add
```
GEMINI_API_KEY  (backend only, for evaluation endpoint)
```

---

## Implementation Checklist

- [ ] Delete `sideband.ts`, `db.ts`, `prisma/` directory
- [ ] Update `backend/package.json` — remove DB dependencies
- [ ] Rewrite `backend/index.ts` — remove SDP/user-response endpoints, add evaluate endpoint
- [ ] Update `backend/result.ts` — no DB lookup, just use parameter
- [ ] Update `backend/types.ts` — add `EvaluateBody`
- [ ] Rewrite `frontend/src/components/Interview.tsx` — Gemini Live WebSocket + local transcript state
- [ ] Update `frontend/src/components/Result.tsx` — receive data from props, no API call
- [ ] Update `frontend/src/App.tsx` — adjust routing for new flow
- [ ] Update `frontend/package.json` — remove `@deepgram/sdk`
- [ ] Update `frontend/src/lib/config.ts` — add `GEMINI_API_KEY`
- [ ] Run `bun install` in both apps
- [ ] Test full flow: pre-interview → Gemini conversation → evaluate → result
