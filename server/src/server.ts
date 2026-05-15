/**
 * Articulate Backend Server
 * WebSocket server for audio streaming, transcription, and polishing
 */

import express, { Request, Response, NextFunction } from 'express';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { ITranscriber, WhisperTranscriber, MockTranscriber } from './services/transcriber';
import { OpenCodePolisher, MockPolisher } from './services/polisher';
import { validateEnvironment, EnvironmentConfig, sanitizeInput, validateAudioBuffer } from './utils/validation';

// Load environment variables
dotenv.config();

// Validate environment configuration
let envConfig: EnvironmentConfig;
try {
  envConfig = validateEnvironment();
} catch (error) {
  console.error('Environment validation failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exit(1);
}

const app = express();
const server = createServer(app);

// Track active WebSocket connections
interface ClientConnection {
  ws: WebSocket;
  transcriber: ITranscriber;
  createdAt: number;
  ip: string;
}
const activeConnections = new Map<string, ClientConnection>();

// Rate limiting
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Configuration
const PORT = envConfig.PORT;
const RATE_LIMIT_MAX = envConfig.RATE_LIMIT_REQUESTS;
const RATE_LIMIT_WINDOW = envConfig.RATE_LIMIT_WINDOW_MS;

// Check if MiniMax is available
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL?.replace(/"/g, '') || 'minimax-m2.5-free';

// Services
const createTranscriber = (): ITranscriber => {
  // If no OpenAI key, use mock
  if (!process.env.OPENAI_API_KEY) {
    return new MockTranscriber();
  }
  return new WhisperTranscriber(
        envConfig.OPENAI_API_KEY || '',
        envConfig.WHISPER_MODEL
      );
}

// Use OpenCode.ai (Anthropic-compatible API)
const polisher = new OpenCodePolisher(
  MINIMAX_API_KEY || '',
  MINIMAX_MODEL
);

// Rate limiting middleware
function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  let record = rateLimitStore.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
    rateLimitStore.set(ip, record);
  }

  record.count++;

  if (record.count > RATE_LIMIT_MAX) {
    res.status(429).json({
      error: 'Too many requests',
      message: `Rate limit exceeded. Max ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW / 1000} seconds.`,
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    });
    return;
  }

  next();
}

// CORS middleware - configurable for production
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'];

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (corsOrigins.includes('*') || (origin && corsOrigins.includes(origin))) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }

  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: '10mb' }));

// Error handling middleware
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[Error] Unhandled error:', err.message, err.stack);

  res.status(500).json({
    error: 'Internal server error',
    message: envConfig.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: activeConnections.size,
    environment: envConfig.NODE_ENV,
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  if (!envConfig.METRICS_ENABLED) {
    return res.status(404).json({ error: 'Metrics not enabled' });
  }

  const connections = Array.from(activeConnections.values());
  const oldestConnection = connections.length > 0
    ? Math.min(...connections.map(c => c.createdAt))
    : null;

  res.json({
    activeConnections: activeConnections.size,
    uptimeSeconds: process.uptime(),
    memoryUsage: process.memoryUsage(),
    oldestConnectionAge: oldestConnection ? Date.now() - oldestConnection : null,
    rateLimitEntries: rateLimitStore.size,
  });
});

// REST API endpoint for polishing text
app.post('/api/polish', rateLimitMiddleware, async (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    // Validate input
    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Expected JSON with "text" field containing a non-empty string',
      });
    }

    // Sanitize input
    const sanitizedText = sanitizeInput(text, 10000);

    if (!sanitizedText) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Text cannot be empty after sanitization',
      });
    }

    const startTime = Date.now();
    const polished = await polisher.polish(sanitizedText);
    const latency = Date.now() - startTime;

    res.json({
      polished,
      latency_ms: latency,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Polish] Error:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      error: 'Failed to polish text',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Initialize WebSocket server
const wss = new WebSocketServer({
  server,
  maxPayload: 10 * 1024 * 1024, // 10MB max message size
});

// WebSocket connection handler
wss.on('connection', (ws: WebSocket, req) => {
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const clientIp = req.socket.remoteAddress || 'unknown';
  const transcriber = createTranscriber();

  // Track connection
  activeConnections.set(clientId, {
    ws,
    transcriber,
    createdAt: Date.now(),
    ip: clientIp,
  });

  console.log(`[${clientId}] Connected from ${clientIp} (total: ${activeConnections.size})`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    timestamp: new Date().toISOString(),
  }));

  ws.on('message', async (data: RawData, isBinary: boolean) => {
    try {
      // Rate limit check per connection
      const connection = activeConnections.get(clientId);
      if (!connection) {
        return;
      }

      // Handle text messages (control signals)
      if (!isBinary) {
        let message;
        try {
          message = JSON.parse(data.toString());
        } catch {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'invalid_message',
            message: 'Failed to parse JSON message',
          }));
          return;
        }

        if (message.type === 'finalize') {
          console.log(`[${clientId}] Finalizing transcription`);

          const startTime = Date.now();
          const finalTranscript = await transcriber.finalizeTranscription();
          const asrLatency = Date.now() - startTime;

          console.log(`[${clientId}] Final transcript: "${finalTranscript}" (${asrLatency}ms)`);

          // Send final transcript to client
          ws.send(JSON.stringify({
            type: 'final_text',
            text: finalTranscript,
            latency_ms: asrLatency,
          }));

          // Only polish if not in raw mode
          const mode = message.mode || 'polished';
          if (mode !== 'raw' && finalTranscript.trim()) {
            const polishStart = Date.now();
            const polishedText = await polisher.polish(finalTranscript);
            const llmLatency = Date.now() - polishStart;

            console.log(`[${clientId}] Polished text: "${polishedText}" (${llmLatency}ms)`);

            ws.send(JSON.stringify({
              type: 'polished_text',
              text: polishedText,
              latency_ms: llmLatency,
            }));
          }
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        } else if (message.type === 'reset') {
          transcriber.reset();
          ws.send(JSON.stringify({ type: 'reset', success: true }));
        }
      } else {
        // Handle binary audio data
        const audioBuffer = normalizeWebSocketData(data);

        // Validate audio buffer
        const validation = validateAudioBuffer(audioBuffer);
        if (!validation.valid) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'invalid_audio',
            message: validation.error,
          }));
          return;
        }

        const startTime = Date.now();
        const partialTranscript = await transcriber.transcribeChunk(audioBuffer);
        const latency = Date.now() - startTime;

        // Send partial transcript to client
        ws.send(JSON.stringify({
          type: 'partial_text',
          text: partialTranscript,
          latency_ms: latency,
        }));

        console.log(`[${clientId}] Audio chunk (${audioBuffer.length} bytes, ${latency}ms)`);
      }
    } catch (error) {
      console.error(`[${clientId}] Error processing message:`, error instanceof Error ? error.message : 'Unknown error');

      ws.send(JSON.stringify({
        type: 'error',
        error: 'processing_failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  });

  ws.on('error', (error) => {
    console.error(`[${clientId}] WebSocket error:`, error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`[${clientId}] Disconnected (code: ${code}, reason: ${reason.toString() || 'none'})`);
    transcriber.reset();
    activeConnections.delete(clientId);
    console.log(`[${clientId}] Connection removed (remaining: ${activeConnections.size})`);
  });

  // Heartbeat to detect dead connections
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(heartbeatInterval);
    }
  }, 30000);

  ws.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});

function normalizeWebSocketData(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data);
  }

  return Buffer.from(data);
}

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

  // Close all WebSocket connections
  activeConnections.forEach((conn, clientId) => {
    console.log(`[Shutdown] Closing connection: ${clientId}`);
    conn.ws.close(1001, 'Server shutting down');
  });

  wss.close(() => {
    console.log('[Shutdown] WebSocket server closed');

    server.close(() => {
      console.log('[Shutdown] HTTP server closed');
      process.exit(0);
    });

    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('[Shutdown] Forced exit after timeout');
      process.exit(1);
    }, 10000);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Fatal] Uncaught exception:', error.message, error.stack);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
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
📊 Metrics:          http://localhost:${PORT}/metrics
📝 Polish API:       POST http://localhost:${PORT}/api/polish

📋 Environment:      ${envConfig.NODE_ENV}
🧠 Transcriber:      ${MINIMAX_API_KEY ? `Whisper (${envConfig.WHISPER_MODEL})` : 'Mock (Development)'}
🎯 Polisher:        ${MINIMAX_API_KEY ? MINIMAX_MODEL : 'Mock (Development)'}

⏱️  Server started at ${new Date().toISOString()}
  `);
});

export { app, server, wss, createTranscriber, polisher };