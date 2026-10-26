# AI Interviewer

A voice-driven technical interview application powered by AI. Practice real conversations with an AI interviewer that adapts to your GitHub projects, asks follow-up questions, and scores your performance.

https://www.youtube.com/watch?v=iNJ7z4YLQFk

---

## Features

- **Live Voice Interview** — Speak naturally with an AI interviewer using your microphone. No scripts, no typing.
- **GitHub Integration** — Enter your GitHub profile URL to let the AI interviewer review your projects and tailor questions to your tech stack.
- **Resume Support** — Upload a PDF or DOCX resume, or paste it inline, for the AI to reference during the interview.
- **Adaptive AI** — Questions start easy and progressively get harder. The AI interviewer bases its first question on your GitHub projects and digs deeper into your answers.
- **Real-time STT** — Speech-to-text powered by Deepgram streams your responses in real time and commits them to the transcript.
- **AI Conversation** — Mistral AI generates the interviewer's replies on the fly via streaming API.
- **Instant Evaluation** — After the interview, an AI evaluator (Gemini 2.5 Flash) scores your performance from 0-10 and provides detailed feedback.
- **Single-Session** — No accounts or database. Your data is discarded after each session.

---

## Architecture

```
ai-interviewer/
├── apps/
│   ├── backend/       Express.js + TypeScript backend (Bun runtime)
│   │   ├── index.ts           HTTP server + WebSocket for STT proxy
│   │   ├── scrapers/          GitHub profile scraper (axios → GitHub API)
│   │   ├── mistralReply.ts    Normalizes Mistral API structured responses
│   │   ├── result.ts          Post-interview evaluation via Gemini
│   │   └── types.ts           Zod validation schemas
│   └── frontend/      React 19 + TypeScript + Vite + Tailwind CSS 4
│       ├── src/
│       │   ├── components/    Landing, Form, Interview, Result, VoiceOrb
│       │   └── lib/           Config, reply text normalization, utils
│       └── public/            Assets
├── packages/
│   ├── typescript-config/     Shared TS configs
│   ├── eslint-config/         Shared ESLint configs
│   └── ui/                    Shared component library
├── .gitignore
├── .npmrc
├── Dockerfile                Multi-stage build for backend
├── run.sh                    Local dev runner
├── turbo.json                Turborepo pipeline config
└── package.json              Workspace root (Bun monorepo)
```

### Data Flow

```
┌──────────────┐     POST /api/v1/pre-interview     ┌──────────────┐
│  Frontend    │ ─────────────────────────────────►  │  Backend     │
│  (React App) │                                     │  (Express)   │
└──────────────┘                                     │              │
                                                     │  GitHub API  │
                                                     │  scrape     │
                                                     └──────────────┘
                                                              │
                                                              ▼
                                                     ┌──────────────┐
                                                     │  Frontend    │
                                                     │  connects    │
                                                     │  Mistral     │
                                                     │  API directly│
                                                     └──────────────┘
                                                              │
                                                   ┌─────────────────┐
                                                   │  Backend       │
                                                   │  WebSocket     │
                                                   │  proxy to      │
                                                   │  Deepgram      │
                                                   └─────────────────┘
                                                              │
                                              ┌───────────────────┐
                                              │  Frontend        │
                                              │  captures mic,   │
                                              │  plays AI audio, │
                                              │  shows transcript│
                                              └───────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Backend POST    │
                                              │  /api/v1/evaluate│
                                              │  Gemini scores  │
                                              └──────────────────┘
                                                       │
                                                       ▼
                                              ┌──────────────────┐
                                              │  Frontend shows  │
                                              │  score & feedback│
                                              └──────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Package Manager | **Bun** |
| Monorepo | **Turborepo** |
| Backend Runtime | **Bun** (Express.js) |
| Frontend Framework | **React 19** + **Vite** |
| Styling | **Tailwind CSS 4** |
| AI — Interviewer | **Mistral AI** (`labs-leanstral-2603`) |
| AI — Evaluator | **Google Gemini 2.5 Flash** |
| AI — Speech-to-Text | **Deepgram** (Nova-3 model) |
| AI — Voice Output | Browser **SpeechSynthesis** |
| Schema Validation | **Zod** |
| HTTP Client | **Axios** |

---

## Setup

### Prerequisites

- [Bun](https://bun.sh/) installed (`curl -fsSL https://bun.sh/install | bash`)
- A **Mistral AI API key** (`MISTRAL_API_KEY`)
- A **Deepgram API key** (`DEEPGRAM_API_KEY`)
- A **Google Gemini API key** (`GEMINI_API_KEY`)

### Environment Variables

Create a `.env` file in `apps/backend/`:

```env
MISTRAL_API_KEY=00635ea07a4ac5bdc21b70b8ea839e37de25616c
DEEPGRAM_API_KEY=your-deepgram-key
```

### Install & Run

```bash
# Install dependencies
bun install

# Start both frontend (port 3000) and backend (port 30001)
./run.sh
```

Or manually:

```bash
# Terminal 1 — Backend
cd apps/backend
bun run index.ts

# Terminal 2 — Frontend
cd apps/frontend
bun src/index.ts
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker

```bash
# Build and run backend
docker build -f Dockerfile -t ai-interviewer-backend .
docker run -p 3001:3001 -e MISTRAL_API_KEY=your-key ai-interviewer-backend

# Build and run frontend (pass backend URL)
docker build --build-arg BACKEND_URL=http://localhost:3001 -f apps/frontend/Dockerfile .
docker run -p 3000:3000 -e BACKEND_URL=http://localhost:3001 ai-interviewer-frontend
```

---

## Project Structure

### Backend (`apps/backend/`)

| File | Purpose |
|------|---------|
| `index.ts` | Express server with 3 REST endpoints + WebSocket STT proxy |
| `scrapers/github.ts` | Fetches user repos from GitHub API to personalize questions |
| `mistralReply.ts` | Extracts and normalizes assistant text from Mistral structured content |
| `result.ts` | Calls Gemini to evaluate interview transcript and return score + feedback |
| `types.ts` | Zod validation schemas for request bodies |

### Frontend (`apps/frontend/`)

| File | Purpose |
|------|---------|
| `src/components/Landing.tsx` | Home page with animated orb background, features, CTA |
| `src/components/Form.tsx` | Interview setup: GitHub URL + resume upload/paste form |
| `src/components/Interview.tsx` | Live interview screen — mic capture, Deepgram WS, conversation loop |
| `src/components/Result.tsx` | Post-interview results display with score and feedback |
| `src/components/VoiceOrb.tsx` | Animated voice level indicator orb |
| `src/lib/config.ts` | Backend URL resolver (local / production with Netlify proxy) |

---

## How It Works

### Pre-Interview

1. User enters their GitHub URL on the landing page.
2. Frontend sends `POST /api/v1/pre-interview` with the GitHub URL.
3. Backend scrapes the user's GitHub profile (repos, star counts, descriptions).
4. Backend also accepts optional resume upload (PDF/DOCX) or pasted text.
5. Backend returns an `interviewId`.
6. Frontend navigates to the interview screen with the `interviewId`.

### Live Interview

1. The interview screen opens a WebSocket to the backend for real-time speech-to-text.
2. Backend connects to Deepgram and proxies audio chunks.
3. User speaks — audio is captured at native rate, resampled to 16kHz, sent to Deepgram.
4. Transcript chunks stream back via WebSocket (interim + final).
5. Frontend commits final transcript entries to local state with a 7s silence debounce.
6. Meanwhile, the user speaks → Mistral generates interviewer reply based on:
   - System prompt with GitHub background context
   - Current transcript (last 6 messages)
   - Candidate's resume text (if provided)
7. AI response is spoken via browser `SpeechSynthesis`.
8. Conversation continues until the user clicks "End interview".

### Evaluation

1. User clicks "End interview".
2. Frontend sends the full transcript to `POST /api/v1/evaluate`.
3. Backend calls Gemini 2.5 Flash with the complete conversation.
4. Gemini returns `{ score: number (0-10), feedback: string }`.
5. Frontend displays the result on the results page.
6. All session data is discarded (no persistence).

---

## API Reference

### `POST /api/v1/pre-interview`

Starts a new interview session.

**Request** — `multipart/form-data` or JSON:

```bash
# With GitHub URL only
curl -X POST http://localhost:3001/api/v1/pre-interview \
  -H "Content-Type: application/json" \
  -d '{"github": "https://github.com/stashpopper"}'

# With resume file upload
curl -X POST http://localhost:3001/api/v1/pre-interview \
  -F "github=https://github.com/stashpopper" \
  -F "resume=@resume.pdf"

# With pasted resume text
curl -X POST http://localhost:3001/api/v1/pre-interview \
  -H "Content-Type: application/json" \
  -d '{"github": "https://github.com/stashpopper", "resumeText": "..."}'
```

**Response:**

```json
{ "id": "uuid-string" }
```

### `POST /api/v1/chat`

Sends a user message to the AI interviewer and gets a reply.

**Request:**

```json
{
  "message": "Can you tell me about your experience with React?",
  "transcript": [
    { "type": "User", "message": "Hello" },
    { "type": "Assistant", "message": "Hi! Let's start..." },
    { "type": "User", "message": "Tell me about your React experience" }
  ],
  "interviewId": "uuid-string"
}
```

**Response:**

```json
{ "reply": "Sure! I've been building with React for the past 3 years..." }
```

### `POST /api/v1/evaluate`

Scores the interview and returns feedback.

**Request:**

```json
{
  "transcript": [
    { "type": "User", "message": "Hello" },
    { "type": "Assistant", "message": "Hi there!" },
    { "type": "User", "message": "Tell me about your projects" }
  ]
}
```

**Response:**

```json
{ "score": 7, "feedback": "Good knowledge of React..." }
```

### WebSocket: `/ws/stt?interviewId=<id>`

Real-time speech-to-text proxy to Deepgram.

- **Send**: Raw PCM audio chunks (16kHz, 16-bit, mono)
- **Receive**: JSON messages:
  - `{ "type": "interim", "text": "..." }` — streaming text
  - `{ "type": "final", "text": "..." }` — committed text
  - `{ "type": "speechStarted" }` — user started speaking

---

## Deployment

### Netlify + Render (Production)

- **Frontend**: Deployed to Netlify with `netlify.toml` proxy rules that forward `/api/*` requests to the backend.
- **Backend**: Deployed to Render (free tier) as a Web Service on port 3001.
- Backend URL is injected at Netlify build time via `VITE_BACKEND_URL` and `BACKEND_URL`.

### Environment Variables (Production)

| Variable | Where | Purpose |
|----------|-------|---------|
| `MISTRAL_API_KEY` | Backend | Mistral AI API key |
| `DEEPGRAM_API_KEY` | Backend | Deepgram STT API key |
| `GEMINI_API_KEY` | Backend | Google Gemini evaluation API key |
| `BACKEND_URL` | Frontend (build) | Backend API URL (Netlify injects this) |

---

## License

Private project. Built for learning and practice.
