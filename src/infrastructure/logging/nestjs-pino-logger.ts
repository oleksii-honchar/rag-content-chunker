import { Injectable, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { BasePinoLogger } from './base-pino-logger';

@Injectable({ scope: Scope.TRANSIENT })
export class NestjsPinoLogger implements BasePinoLogger {
  constructor(private readonly pinoLogger: PinoLogger) {}

  setContext(context: string): void {
    this.pinoLogger.setContext(context);
  }

  private buildLogPayload(message: string | Record<string, unknown>, meta?: Record<string, unknown>): [unknown, string?] {
    if (typeof message === 'string') {
      return meta ? [{ ...meta, msg: message }] : [message];
    }
    return meta ? [{ ...meta, ...message }] : [message];
  }

  log(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.info(message, meta);
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const [obj, msg] = this.buildLogPayload(message, meta);
    this.pinoLogger.info(obj, msg);
  }

  error(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const [obj, msg] = this.buildLogPayload(message, meta);
    this.pinoLogger.error(obj, msg);
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const [obj, msg] = this.buildLogPayload(message, meta);
    this.pinoLogger.warn(obj, msg);
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const [obj, msg] = this.buildLogPayload(message, meta);
    this.pinoLogger.debug(obj, msg);
  }

  child(bindings: Record<string, unknown>): BasePinoLogger {
    const childLogger = this.pinoLogger.logger.child(bindings);
    const wrapper = new NestjsPinoLogger({ logger: childLogger } as PinoLogger);
    return wrapper;
  }
}
