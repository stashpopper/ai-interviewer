# Gemini Live Voice Interview — Design

**Date:** 2026-06-24
**Status:** Approved (browser-direct + personalized)

## Goal

Replace the current fragile STT/TTS/turn-taking loop (Web Speech API + `speechSynthesis` +
Mistral `/chat` polling) with the **Gemini Live API** (`gemini-3.1-flash-live-preview`) as a
single realtime voice session. This also fixes the "stuck after first question" bug, whose root
cause is documented below.

## Root cause of the current bug

`apps/frontend/src/components/Interview.tsx`:

- The `recognition.onresult` handler (lines 62–74) writes recognized text to **React state**
  via `setTranscript(...)`.
- The main conversation loop (lines 166–169) reads from **`transcriptRef.current`** to detect a
  new user message.
- `transcriptRef.current` is seeded once with the first Assistant question (line 146) and is
  **only ever appended to when the AI replies** (line 194). The STT handler never writes to it.
- Therefore `transcriptRef.current.filter(m => m.type === "User").pop()` is always `undefined`,
  the `if (lastUser && ...)` guard is never true, and the loop polls forever.

Net effect: AI asks the first question, the user speaks, and the app never advances. Replacing
the whole mechanism with Gemini Live removes this code path entirely.

## Architecture

```
Browser (Interview.tsx)
  │  getUserMedia(mic) ──► AudioWorklet (→ 16kHz PCM Int16, base64)
  │                                    │
  │  WSS  wss://...BidiGenerateContent?key=…  ◄──── realtime_input (audio)
  │     │                                    └────► modelAudio chunks (24kHz PCM)
  │     ├── setup: model, response_modalities=[AUDIO], voice config,
  │     │         input/output transcription enabled, system_instruction
  │     │         (interviewer persona + scraped GitHub profile)
  │     ├── serverContent.modelTurn.parts[].text   (transcript deltas)
  │     └── serverContent.turnComplete             (flush transcript entry)
  ▼
Backend (index.ts)
  ├── POST /api/v1/pre-interview  → returns { profile }  (scraped GitHub)
  └── POST /api/v1/evaluate       → score + feedback (Gemini text model, unchanged)
```

The Live API provides VAD + STT + TTS + conversation reasoning in one model, so the Mistral
`/chat` endpoint, the Web Speech API, and `speechSynthesis` are all removed.

## Data flow

1. `Form` posts the GitHub URL to `/api/v1/pre-interview`, which returns `{ profile }` (the
   scraped repo list). `Form` navigates to `/interview` passing `profile` via router state.
2. `Interview` opens the Live WebSocket and sends a `setup` message:
   - `model` = `GEMINI_LIVE_MODEL` (default `gemini-3.1-flash-live-preview`)
   - `generationConfig.responseModalities = ["AUDIO"]`
   - `generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName = "Puck"`
   - `inputAudioTranscription: {}` and `outputAudioTranscription: {}` enabled
   - `systemInstruction.parts[0].text` = interviewer prompt + serialized profile
3. Mic PCM is streamed continuously via `realtime_input` frames.
4. Output PCM is decoded and played through a single queued `AudioBufferSourceNode`.
   `interrupted` flags stop active playback (barge-in).
5. Transcript entries are accumulated from transcription deltas and flushed on `turnComplete`.
6. "End interview" closes the socket and posts the transcript to `/evaluate`.

## Files changed

| File | Change |
|------|--------|
| `apps/frontend/src/components/Interview.tsx` | Rewrite realtime core on Gemini Live. Keep `VoiceOrb` usage + UI shell. Remove STT, `speechSynthesis`, polling loop, `isRespondingRef`/`lastProcessedRef`. |
| `apps/frontend/src/lib/config.ts` | Add `GEMINI_LIVE_MODEL` constant alongside existing `GEMINI_API_KEY`. |
| `apps/frontend/src/components/Form.tsx` | Navigate to `/interview` carrying `profile` in state instead of `/interview/:id`. |
| `apps/frontend/src/App.tsx` | Drop the `:interviewId` route param. |
| `apps/frontend/src/worklets/pcm-worklet.ts` | **New.** AudioWorkletProcessor that emits 16 kHz mono Int16 PCM. |
| `apps/backend/index.ts` | `/pre-interview` returns `{ profile }`; **remove** the dead `/chat` endpoint. |
| `apps/backend/index.ts` `/evaluate`, `result.ts`, `types.ts` | Unchanged. |

## Key protocol details (verified against Live API docs)

- Mic format: 16-bit PCM, 16 kHz, mono, base64-encoded, in `realtime_input` frames.
- Output format: base64 PCM at 24 kHz.
- The model performs its own VAD, transcription, and TTS; the frontend only captures, encodes,
  plays back, and renders transcript text.
- Setup message shape uses `setup`/`realtimeInput`/`serverContent` field names per the current
  `generativelanguage.googleapis.com` WebSocket.

## Error handling

- WebSocket `onerror` / `onclose` (abnormal) → set an error string shown in the UI; do not loop.
- Missing mic / unsupported browser → `setError(...)` with a clear message (Chrome required).
- Missing `GEMINI_API_KEY` → block at the setup stage with a clear error rather than failing
  inside the WebSocket handshake.

## Caveats (accepted)

- API key is exposed in the browser — acceptable for localhost/free-tier use. A future deploy
  should switch to ephemeral tokens or a backend WS proxy.
- Chrome required (AudioWorklet + `getUserMedia`).
