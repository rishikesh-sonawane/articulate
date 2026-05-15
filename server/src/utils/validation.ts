/**
 * Environment validation utilities
 */

export interface EnvironmentConfig {
  NODE_ENV: string;
  PORT: number;
  WS_URL: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL: string;
  WHISPER_MODEL: string;
  USE_LOCAL_WHISPER: boolean;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
  RATE_LIMIT_REQUESTS: number;
  RATE_LIMIT_WINDOW_MS: number;
  METRICS_ENABLED: boolean;
  METRICS_PORT: number;
}

export function validateEnvironment(): EnvironmentConfig {
  const config: EnvironmentConfig = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '8080', 10),
    WS_URL: process.env.WS_URL || 'ws://localhost:8080',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    WHISPER_MODEL: process.env.WHISPER_MODEL || 'whisper-1',
    USE_LOCAL_WHISPER: process.env.USE_LOCAL_WHISPER === 'true',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    LOG_FORMAT: process.env.LOG_FORMAT || 'json',
    RATE_LIMIT_REQUESTS: parseInt(process.env.RATE_LIMIT_REQUESTS || '100', 10),
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    METRICS_ENABLED: process.env.METRICS_ENABLED === 'true',
    METRICS_PORT: parseInt(process.env.METRICS_PORT || '9090', 10),
  };

  // Validate port
  if (isNaN(config.PORT) || config.PORT < 1 || config.PORT > 65535) {
    throw new Error(`Invalid PORT: ${process.env.PORT}. Must be between 1 and 65535`);
  }

  // Validate rate limit values
  if (config.RATE_LIMIT_REQUESTS < 1) {
    throw new Error('RATE_LIMIT_REQUESTS must be at least 1');
  }

  if (config.RATE_LIMIT_WINDOW_MS < 1000) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be at least 1000ms');
  }

  // Warn if missing API key in non-mock mode
  if (config.NODE_ENV === 'production' && !config.OPENAI_API_KEY) {
    console.warn('WARNING: OPENAI_API_KEY not set in production mode. Using mock services.');
  }

  return config;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeInput(input: string, maxLength: number = 10000): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove null bytes and control characters (except newlines/tabs)
  // eslint-disable-next-line no-control-regex
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Trim whitespace and limit length
  sanitized = sanitized.trim().slice(0, maxLength);

  return sanitized;
}

export function validateAudioBuffer(buffer: Buffer): { valid: boolean; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty audio buffer' };
  }

  // Check minimum size (at least 100 bytes for any audio)
  if (buffer.length < 100) {
    return { valid: false, error: 'Audio buffer too small' };
  }

  // Check maximum size (10MB limit)
  if (buffer.length > 10 * 1024 * 1024) {
    return { valid: false, error: 'Audio buffer exceeds 10MB limit' };
  }

  return { valid: true };
}