/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { BasePinoLogger } from './base-pino-logger';

@Injectable({ scope: Scope.TRANSIENT })
export class NestjsPinoLogger implements BasePinoLogger {
  constructor(private readonly pinoLogger: PinoLogger) {}

  setContext(context: string): void {
    this.pinoLogger.setContext(context);
  }

  private buildLogArgs(
    message: string | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ): any[] {
    if (meta != null && Object.keys(meta).length > 0) {
      if (typeof message === 'string') {
        return [{ ...meta, msg: message }];
      }
      return [{ ...meta, ...message }];
    }
    return [message];
  }

  log(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    this.info(message, meta);
  }

  info(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const args = this.buildLogArgs(message, meta);
    this.pinoLogger.info(args[0], ...args.slice(1));
  }

  error(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const args = this.buildLogArgs(message, meta);
    this.pinoLogger.error(args[0], ...args.slice(1));
  }

  warn(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const args = this.buildLogArgs(message, meta);
    this.pinoLogger.warn(args[0], ...args.slice(1));
  }

  debug(message: string | Record<string, unknown>, meta?: Record<string, unknown>): void {
    const args = this.buildLogArgs(message, meta);
    this.pinoLogger.debug(args[0], ...args.slice(1));
  }

  child(bindings: Record<string, unknown>): BasePinoLogger {
    const childLogger = this.pinoLogger.logger.child(bindings);
    const wrapper = new NestjsPinoLogger({ logger: childLogger } as PinoLogger);
    return wrapper;
  }
}
