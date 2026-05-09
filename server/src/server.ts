/**
 * Articulate Backend Server
 * WebSocket server for audio streaming, transcription, and polishing
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { WhisperTranscriber, MockTranscriber } from './services/transcriber';
import { GPTPolisher, MockPolisher } from './services/polisher';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Configuration
const PORT = process.env.PORT || 8080;
const USE_MOCK = process.env.NODE_ENV !== 'production';

// Services
const transcriber = USE_MOCK
  ? new MockTranscriber()
  : new WhisperTranscriber(process.env.OPENAI_API_KEY || '', process.env.WHISPER_MODEL);

const polisher = USE_MOCK
  ? new MockPolisher()
  : new GPTPolisher(process.env.OPENAI_API_KEY || '', process.env.OPENAI_MODEL);

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// REST API endpoint for polishing text
app.post('/api/polish', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Invalid request. Expected JSON with "text" field.',
      });
    }

    const startTime = Date.now();
    const polished = await polisher.polish(text);
    const latency = Date.now() - startTime;

    res.json({
      polished,
      latency_ms: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Polish endpoint error:', error);
    res.status(500).json({
      error: 'Failed to polish text',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  console.log(`[${clientId}] Connected`);

  transcriber.reset();

  ws.on('message', async (data: Buffer | string) => {
    try {
      // Handle text messages (control signals)
      if (typeof data === 'string') {
        const message = JSON.parse(data);

        if (message.type === 'finalize') {
          console.log(`[${clientId}] Finalizing transcription`);

          const startTime = Date.now();
          const finalTranscript = await transcriber.finalizeTranscription();
          const asr_latency = Date.now() - startTime;

          console.log(`[${clientId}] Final transcript: "${finalTranscript}" (${asr_latency}ms)`);

          // Send final transcript to client
          ws.send(
            JSON.stringify({
              type: 'final_text',
              text: finalTranscript,
              latency_ms: asr_latency,
            })
          );

          // Polish the text
          const polishStart = Date.now();
          const polishedText = await polisher.polish(finalTranscript);
          const llm_latency = Date.now() - polishStart;

          console.log(`[${clientId}] Polished text: "${polishedText}" (${llm_latency}ms)`);

          // Send polished text to client
          ws.send(
            JSON.stringify({
              type: 'polished_text',
              text: polishedText,
              latency_ms: llm_latency,
            })
          );
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } else {
        // Handle binary audio data
        const startTime = Date.now();
        const partialTranscript = await transcriber.transcribeChunk(data);
        const latency = Date.now() - startTime;

        // Send partial transcript to client
        ws.send(
          JSON.stringify({
            type: 'partial_text',
            text: partialTranscript,
            latency_ms: latency,
          })
        );

        console.log(`[${clientId}] Chunk processed (${latency}ms): "${partialTranscript}"`);
      }
    } catch (error) {
      console.error(`[${clientId}] Error processing message:`, error);
      ws.send(
        JSON.stringify({
          type: 'error',
          error: 'processing_failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      );
    }
  });

  ws.on('error', error => {
    console.error(`[${clientId}] WebSocket error:`, error);
  });

  ws.on('close', () => {
    console.log(`[${clientId}] Disconnected`);
    transcriber.reset();
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  wss.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║           🎙️ Articulate Backend Server                    ║
╚════════════════════════════════════════════════════════════╝

📍 HTTP Server:      http://localhost:${PORT}
🔌 WebSocket:        ws://localhost:${PORT}/
🏥 Health Check:     http://localhost:${PORT}/health
📝 Polish API:       POST http://localhost:${PORT}/api/polish

📋 Environment:      ${process.env.NODE_ENV}
🧠 Transcriber:      ${USE_MOCK ? 'Mock (Development)' : 'Whisper API'}
🎯 Polisher:         ${USE_MOCK ? 'Mock (Development)' : 'GPT-3.5 Turbo'}

⏱️  Server started at ${new Date().toISOString()}
  `);
});

export { app, wss, transcriber, polisher };
