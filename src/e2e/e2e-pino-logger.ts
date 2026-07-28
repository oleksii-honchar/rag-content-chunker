import pino from 'pino';
import { BasePinoLogger } from '../infrastructure/logging/base-pino-logger';

/**
 * Real pino-backed logger for e2e tests.
 * Not a mock — uses actual pino instance with JSON output at warn level.
 * Implements BasePinoLogger interface for full DI compatibility.
 */
export class E2ePinoLogger implements BasePinoLogger {
  private readonly logger: pino.Logger;

  constructor(parentLogger: pino.Logger) {
    this.logger = parentLogger;
  }

  setContext(_context: string): void {
    // Context handled via pino bindings in child()
  }

  log(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.info(message, meta);
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.logger.info(this.buildPayload(message, meta));
  }

  error(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.logger.error(this.buildPayload(message, meta));
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.logger.warn(this.buildPayload(message, meta));
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.logger.debug(this.buildPayload(message, meta));
  }

  child(bindings: Record<string, unknown>): BasePinoLogger {
    return new E2ePinoLogger(this.logger.child(bindings));
  }

  private buildPayload(message: string | Record<string, unknown>, meta?: Record<string, unknown>): unknown {
    if (meta != null && Object.keys(meta).length > 0) {
      if (typeof message === 'string') {
        return { ...meta, msg: message };
      }
      return { ...meta, ...message };
    }
    return message;
  }
}

/**
 * Creates a quiet e2e pino logger instance.
 */
export function createE2ePinoLogger(): E2ePinoLogger {
  const e2ePino = pino({
    level: 'warn',
    base: { service: 'rag-content-chunker', environment: 'test' },
  });
  return new E2ePinoLogger(e2ePino);
}
