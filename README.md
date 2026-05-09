# 🎙️ Articulate — Voice-to-Polished-Text Overlay

**Speak faster, write better.** A Chrome extension that automatically converts rambling speech into professional, ready-to-send text across any web application—Slack, Gmail, Jira, and beyond.

![Status](https://img.shields.io/badge/status-MVP%20Development-yellow)
![Version](https://img.shields.io/badge/version-0.1--alpha-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📌 Quick Overview

**Articulate** is a browser extension for software engineers that uses cutting-edge AI to turn spoken words into polished, professional writing. Click a microphone button, speak naturally (even while rambling or using technical jargon), and the system instantly transcribes your speech and cleans it up using AI—removing fillers ("um", "uh"), fixing grammar, and improving tone—then inserts the final text directly into any text field.

**Problem:** Engineers speak ~150 words per minute but only type ~40 WPM. Writing code comments, Slack messages, and Jira tickets takes time.  
**Solution:** Dictate in 2 minutes what would take 5 minutes to type—and AI polishes it along the way.

---

## ✨ Core Features

### MVP (0.1)
- **🎤 Universal Voice Capture** – Works in any web text field (Slack, Gmail, Google Docs, Jira, Notion).
- **⚡ Real-Time Transcription** – Uses OpenAI Whisper for near-human accuracy, even with technical terms.
- **🧠 AI Text Polishing** – GPT-3.5 automatically removes filler words, corrects grammar, and improves tone.
- **🎛️ Raw vs. Polish Modes** – Choose raw transcription (verbatim) or polished (AI-cleaned).
- **🔄 Streaming Audio** – Efficient chunk-based streaming for low latency (<1 second).
- **📍 Seamless Integration** – Text inserts directly into your active field—no copy/paste needed.
- **🔒 Privacy-First Design** – Optional local processing; never stores your audio.

### Coming Soon (Post-MVP)
- Multi-language & Hinglish support
- Custom tone profiles (professional/casual/technical)
- Context-aware editing (reads surrounding text)
- Offline mode (local Whisper processing)
- Desktop app support (native macOS/Windows)
- Analytics & correction learning

---

## 🏗️ Architecture

### Three-Layer System

```
┌─────────────────────────────────────────────────────────────┐
│                  BROWSER CLIENT (Extension)                  │
│  • Mic button injection & UI overlay                         │
│  • Audio capture (getUserMedia)                              │
│  • WebSocket connection to backend                           │
│  • Inserts polished text into DOM                            │
└────────────────────────┬────────────────────────────────────┘
                         │ WebSocket (binary audio + JSON)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              BACKEND SERVICE (Node.js/Python)               │
│  • WebSocket server for audio streaming                      │
│  • Orchestrates ASR & LLM calls                              │
│  • Manages buffering, VAD, retry logic                       │
│  • Implements backpressure & rate-limiting                   │
└────────────────────────┬────────────────────────────────────┘
                    ┌────┴────┐
                    ▼         ▼
        ┌──────────────────┐ ┌──────────────────┐
        │  ASR Engine      │ │  LLM Polisher    │
        │ (Whisper API)    │ │ (GPT-3.5 Turbo)  │
        │ or Local         │ │ or Local LLaMA   │
        └──────────────────┘ └──────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ or **Python** 3.10+
- **npm** or **yarn** (for frontend)
- **Chrome** 120+ or Chromium-based browser
- **OpenAI API Key** (for Whisper & GPT-3.5)
  - [Get one here](https://platform.openai.com/api-keys)
  - ~$1–6k/month for MVP scale (~100 daily users)

### Installation (Development)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/articulate.git
   cd articulate
   ```

2. **Setup the backend service:**
   ```bash
   cd server
   npm install
   ```

3. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key:
   # OPENAI_API_KEY=sk-...
   ```

4. **Start the backend:**
   ```bash
   npm run dev
   # Backend should run on ws://localhost:8080
   ```

5. **Load the extension in Chrome:**
   - Go to `chrome://extensions/`
   - Enable **Developer mode** (top-right)
   - Click **Load unpacked**
   - Select the `client/extension` directory from this repo

6. **Test it out:**
   - Open any web page with a text field (try Gmail, Slack, etc.)
   - Click the 🎙️ icon
   - Speak naturally
   - Watch it polish and insert!

---

## 📁 Project Structure

```
articulate/
├── client/
│   └── extension/
│       ├── manifest.json              # Extension config (Manifest V3)
│       ├── background.js              # Service worker
│       ├── content-script.js           # Audio capture & UI injection
│       ├── popup.html                  # Settings popup
│       ├── popup.js                    # Settings logic
│       └── styles/
│           └── ui.css                  # Extension UI styles
│
├── server/
│   ├── src/
│   │   ├── services/
│   │   │   ├── transcriber.ts         # ASR (Whisper) interface
│   │   │   └── polisher.ts             # LLM (GPT) interface
│   │   └── server.ts                   # WebSocket + REST API
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
├── tests/                              # Test suites
├── docs/                               # Documentation
├── Dockerfile
├── docker-compose.yml
├── .gitignore
└── README.md                           # This file
```

---

## 🔌 API Reference

### WebSocket Protocol

**Endpoint:** `ws://localhost:8080`

#### Client → Server
- **Audio chunks** (binary)
- **Control messages** (JSON): `{"type": "finalize"}`

#### Server → Client
```json
{"type": "partial_text", "text": "Hello wor..."}
{"type": "final_text", "text": "Hello world"}
{"type": "polished_text", "text": "Hello, world."}
{"type": "error", "error": "quota_exceeded"}
```

### REST API

**POST `/api/polish`** – Manually polish text
```bash
curl -X POST http://localhost:8080/api/polish \
  -H "Content-Type: application/json" \
  -d '{"text": "uh hello team"}'
```

**GET `/health`** – Health check
```bash
curl http://localhost:8080/health
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Load testing
npm run test:load -- --users 100
```

---

## 📊 Metrics & Monitoring

**Key Performance Indicators:**
- **Latency:** End-to-end <1000ms (target)
- **Accuracy:** Word Error Rate <5%
- **Availability:** 99.9% uptime
- **Error Rate:** <1%

**Prometheus metrics** available on `:9090/metrics`

---

## 🔒 Privacy & Security

✅ **Audio never stored** – Deleted after transcription  
✅ **No user tracking** – Extension doesn't send PII  
✅ **Encrypted in transit** – TLS/wss  
✅ **Optional local mode** – Coming soon  
✅ **GDPR/CCPA compliant**

See [Privacy Policy](docs/PRIVACY.md) and [Security Policy](docs/SECURITY.md).

---

## 📈 Roadmap

### Phase 1: MVP (May–June 2026)
- [x] Extension UI & audio capture
- [x] Backend WebSocket server
- [x] Whisper ASR integration
- [x] GPT-3.5 polishing
- [ ] Beta launch (invite-only)

### Phase 2: Polish & Launch (July 2026)
- [ ] Performance optimization
- [ ] Chrome store listing
- [ ] Public launch 🚀

### Phase 3: Expansion (Aug–Oct 2026)
- [ ] Multi-language support
- [ ] Local processing mode
- [ ] Custom tone profiles
- [ ] Desktop app (Electron)

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

```bash
git checkout -b feat/awesome-feature
# Make changes
git commit -m "feat: add awesome feature"
git push origin feat/awesome-feature
# Create Pull Request
```

---

## 📄 License

MIT © 2026 Articulate Contributors. See [LICENSE](LICENSE).

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/yourusername/articulate/issues)
- **Email:** support@articulate.dev
- **Twitter:** [@ArticulateApp](https://twitter.com/ArticulateApp)

---

**Made with ❤️ to help engineers write faster.**
