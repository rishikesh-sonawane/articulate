# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Articulate** is a Chrome extension that converts voice input into polished, professional text. It uses browser's built-in Web Speech API for transcription and OpenCode.ai (MiniMax) for AI-powered text polishing.

## Commands

### Backend (server/)

```bash
cd server
npm install          # Install dependencies
npm run dev          # Start dev server (ts-node)
npm run build        # Compile TypeScript
npm run start        # Run compiled server
npm run lint         # Lint with ESLint
npm run type-check  # TypeScript type check
```

### Chrome Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `client/extension`

## Architecture

### Two Modes

**Mode 1 - Browser-only (default):**
- Uses Web Speech API for transcription (no backend needed)
- Sends text to backend `/api/polish` endpoint for AI polishing

**Mode 2 - With Backend WebSocket:**
- Streams audio to backend for processing
- Backend uses Whisper for transcription + AI for polishing

```
Client (Chrome Extension)  →  HTTP  →  Backend (Node.js)  →  OpenCode.ai (MiniMax)
  - Browser Speech API
  - Mic button injection
  - Text insertion to DOM
                              - REST API (/api/polish)
                              - OpenCodePolisher service
```

### Key Services (server/src/services/)

- **ITranscriber** (`transcriber.ts`): Interface for speech-to-text
  - `WhisperTranscriber`: Uses OpenAI Whisper API (requires OPENAI_API_KEY)
  - `MockTranscriber`: For development/testing
- **IPolisher** (`polisher.ts`): Interface for text polishing
  - `OpenCodePolisher`: Uses OpenCode.ai (Anthropic-compatible API → MiniMax)
  - `MockPolisher`: Regex-based polishing for dev

### REST API

**Endpoint:** `http://localhost:8080`

- `GET /health` — Health check
- `POST /api/polish` — Polish raw text: `{"text": "um hello team"}`
- `GET /metrics` — Server metrics

### Environment Variables

In `server/.env`:
- `MINIMAX_API_KEY` — OpenCode.ai/MiniMax API key (required for AI polishing)
- `MINIMAX_MODEL` — Model to use (default: minimax-m2.5-free)
- `OPENAI_API_KEY` — Optional, for Whisper transcription
- `PORT` — Server port (default: 8080)
- `NODE_ENV` — Set to `development` or `production`
- `RATE_LIMIT_REQUESTS` — Max requests per window (default: 100)
- `RATE_LIMIT_WINDOW_MS` — Rate limit window in ms (default: 60000)
- `METRICS_ENABLED` — Enable `/metrics` endpoint (default: true)

## Development Notes

- The extension uses browser speech recognition by default (`transcriptionProvider: 'browser'`)
- For AI polishing, the backend must be running and `MINIMAX_API_KEY` must be set in `.env`
- Chrome extension uses Manifest V3 with service worker (`background.js`) and content script (`content-script.js`)
- Keyboard shortcut: `Ctrl+Shift+M` to toggle recording