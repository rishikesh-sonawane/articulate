# 🎙️ Articulate — Voice-to-Polished-Text

**Speak naturally, get polished text.** A Chrome extension that converts your voice into professional, ready-to-send text across any website—Slack, Gmail, Jira, and more.

![Status](https://img.shields.io/badge/status-Working-green)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## ✨ Features

- **🎤 Voice Input** – Click mic button or press `Ctrl+Shift+M` in any text field
- **🧠 AI Polishing** – Automatically removes filler words, fixes grammar, improves clarity
- **🔄 Real-time** – See transcription as you speak
- **📍 Seamless** – Text inserts directly into your active field
- **🌐 Works Everywhere** – Any text field on any website

---

## 🚀 Quick Start

### 1. Start the Backend

```bash
cd server
npm install
npm run dev
```

The server runs on `http://localhost:8080`.

### 2. Load the Extension

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select `client/extension`

### 3. Use It

- Click the 🎙️ mic button on any text field
- Or press `Ctrl+Shift+M`
- Speak naturally
- Stop speaking — AI polishes and inserts the text

---

## ⚙️ Configuration

### Environment Variables (server/.env)

```env
# Required for AI polishing
MINIMAX_API_KEY=your-opencode-api-key

# Optional
MINIMAX_MODEL=minimax-m2.5-free
PORT=8080
```

### Get API Key

1. Go to [opencode.ai/workspace](https://opencode.ai/workspace/wrk_01KRMWWYQKYA058AACZ3J8T6GQ/keys)
2. Create a new API key
3. Add it to `server/.env`

---

## 📁 Project Structure

```
articulate/
├── client/extension/          # Chrome extension
│   ├── manifest.json          # Extension config (Manifest V3)
│   ├── background.js           # Service worker
│   ├── content-script.js      # Audio capture & UI
│   ├── popup.html/js           # Settings popup
│   └── styles/ui.css           # UI styles
│
├── server/                    # Backend service
│   ├── src/
│   │   ├── server.ts           # Express + WebSocket server
│   │   └── services/
│   │       ├── polisher.ts      # AI text polishing
│   │       └── transcriber.ts   # Speech-to-text
│   └── .env                    # Configuration
│
├── CLAUDE.md                  # Developer notes
└── README.md                  # This file
```

---

## 🔌 API

### REST Endpoints

```bash
# Health check
GET http://localhost:8080/health

# Polish text
POST http://localhost:8080/api/polish
Content-Type: application/json
{"text": "um hello team i wanted to share some news"}
```

### WebSocket (optional)

```bash
ws://localhost:8080
```

---

## 📝 Example

**You say:** "so um like i was thinking we should like work on this project and um i think we should like finish it by friday"

**AI polishes to:** "I was thinking we should work on this project, and I think we should finish it by Friday."

---

## License

MIT
